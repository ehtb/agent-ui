// Everything a page says about the document around its app: the title and description, the attributes of <html> and
// <body>, the elements of <head>, and the elements at the end of <body>. A page declares it in `head` (src/pages.js,
// docs/API.md section 13); this module resolves it for a state, and keeps a browser document in step with it.
//
//   head: {
//     title: (state) => state.item.name,                        // string | (state) => string, required
//     description: 'About the item',                            // string | (state) => string
//     html: { lang: 'en', class: (state) => state.theme.name }, // attributes of <html>
//     body: { 'data-page': 'item' },                            // attributes of <body>
//     tags: [                                                   // elements of <head>: meta, link, base, script, style
//       { tag: 'meta', props: { property: 'og:title', content: (state) => state.item.name } },
//       { tag: 'link', props: { rel: 'canonical', href: (state) => `https://example.com/item/${state.item.id}` } },
//       { tag: 'script', props: { type: 'application/ld+json' }, children: (state) => ({ '@type': 'Product', name: state.item.name }) },
//     ],
//     bodyTags: [{ tag: 'script', props: { src: '/analytics.js', defer: true } }],   // elements at the end of <body>
//   }
//
// The grammar is the spec's: an element is { tag, props, children }. Any value of an attribute, and the children of a data
// script, may be a function of the state snapshot (the same `state` as in ready and status). The server writes the result into
// the document while it renders (server/document.mjs, injectHead); the browser keeps the attributes, meta and link elements
// and the title current as the state changes (applyHead, through the plugin `withHead`). Elements that run or style the page (script, style, base) are
// written when the document is written (the server's render, or a soft navigation that copies it), so withHead leaves them alone, the text of a data script built
// from the state included: it is the state at that moment, so a page reached by a soft link keeps the JSON-LD the server wrote for it.
// withHead re-resolves the whole head on every change of any key (a head function may read any of the state, and there is no cheap
// way to know which); applyHead writes only what differs, so an unrelated write costs the head functions, not the document.
//
// This module is what a browser bundle holds. The server's half (the text of scripts and styles, the names the checks use) is
// src/head-document.js, reached through src/pages-server.js and src/pages-checks.js, which production browser bundles replace by stubs.
import { URL_PROPS, isUnsafeUrl, markPagePlugin, valueForState } from './spec-core.js';
import { codedError } from './errors.js';
import { BASE_PATH_ATTRIBUTES, withBaseInAttribute } from './base-path.js';

// Elements whose values follow the state and so are updated in a browser; the rest are literal.
export const DYNAMIC_HEAD_TAGS = ['meta', 'link'];
export const MARKER_HEAD = 'data-agent-ui-head';
export const MARKER_BODY = 'data-agent-ui-body';
export const MARKER_ATTRIBUTES = 'data-agent-ui-attrs';
// The comments around the elements a server wrote: injectHead writes them (server/document.mjs), readHead finds the elements by them.
export const HEAD_START = '<!--agent-ui-head:start-->';
export const HEAD_END = '<!--agent-ui-head:end-->';
export const BODY_START = '<!--agent-ui-body:start-->';
export const BODY_END = '<!--agent-ui-body:end-->';


// { name: value } with every value read for the state. A value of false, null or undefined leaves the attribute out, true
// writes it bare (`defer`), anything else is its text. An unsafe URL stops the render with the attribute named; a root-absolute
// URL of the site is written below the base path (src/base-path.js).
const attributesOf = (props, state, where, tag = null, basePath = '') => {
  const attributes = {};
  for (const [name, raw] of Object.entries(props ?? {})) {
    const value = valueForState(raw, state);
    if (value === undefined || value === null || value === false) continue;
    if (value !== true && typeof value !== 'string' && typeof value !== 'number') {
      throw codedError('AUI0502', { where, name, value });
    }
    const text = value === true ? true : String(value);
    // Names are case-insensitive in HTML (HREF is href). The src of a script runs code, so a data: URL is as unsafe there as in an href.
    const urlName = name.toLowerCase();
    const isUrl = text !== true && URL_PROPS.includes(urlName);
    if (isUrl && isUnsafeUrl(tag === 'script' ? 'href' : urlName, text)) throw codedError('AUI0503', { where, name, value: text });
    attributes[name] = text !== true && BASE_PATH_ATTRIBUTES.includes(urlName) ? withBaseInAttribute(basePath, urlName, text) : text;
  }
  return attributes;
};

// The elements of a list with their attributes read for the state. Their text is the server's business (src/head-document.js); a description made here has none (`text` is undefined).
const resolveTags = (nodes, state, where, basePath) => (nodes ?? []).map((node, index) => ({ tag: node.tag, attributes: attributesOf(node.props, state, `${where}[${index}]`, node.tag, basePath) }));

const resolveText = (value, state) => valueForState(value, state) ?? '';

// The description of the document for one state, without the text of scripts and styles: what a browser needs to keep the
// document current.
export const resolveHead = (head, state, where = 'head', basePath = '') => ({
  title: resolveText(head.title, state),
  description: resolveText(head.description, state),
  html: attributesOf(head.html, state, `${where}.html`),
  body: attributesOf(head.body, state, `${where}.body`),
  tags: resolveTags(head.tags, state, `${where}.tags`, basePath),
  bodyTags: resolveTags(head.bodyTags, state, `${where}.bodyTags`, basePath),
});

// ---- the browser's side ----------------------------------------------------------------------------------------------

// Sets each attribute whose value differs; true is the bare attribute.
const writeAttributes = (element, attributes) => {
  for (const [name, value] of Object.entries(attributes)) {
    const text = value === true ? '' : value;
    if (element.getAttribute(name) !== text) element.setAttribute(name, text);
  }
};

// Sets the attributes of one element to exactly `attributes`, for the names this module manages: the ones it wrote last
// time are listed on the element (MARKER_ATTRIBUTES), so an attribute the page stopped asking for is removed, and one the
// document had of its own (the build's `lang="en"`) is replaced, never duplicated.
// `written` limits the names that are listed as the page's own to those (a soft navigation writes the template's attributes too, and
// must not list them: the next page that does not ask for them would take them away).
export const setManagedAttributes = (element, attributes, written = null) => {
  const managed = (element.getAttribute(MARKER_ATTRIBUTES) ?? '').split(' ').filter(Boolean);
  for (const name of managed) if (!(name in attributes)) element.removeAttribute(name);
  writeAttributes(element, attributes);
  const names = Object.keys(attributes).filter((name) => written === null || written.includes(name));
  if (names.length) element.setAttribute(MARKER_ATTRIBUTES, names.join(' '));
  else if (managed.length) element.removeAttribute(MARKER_ATTRIBUTES);
};

const elementsOf = (container) => [...container.childNodes].filter((node) => node.nodeType === 1);
// Puts a new element where its position says: before the first element the page wrote at a later position, else at the end. A load
// writes them in order, so a script that changed must not jump after one that did not.
const insertAtPosition = (container, marker, element, index) => {
  const later = elementsOf(container).find((child) => Number(child.getAttribute(marker) ?? -1) > index);
  container.insertBefore(element, later ?? null);
};
const findMarked = (container, marker, index) => elementsOf(container).find((child) => child.getAttribute(marker) === String(index));

// meta and link elements follow the state; the server wrote them (marked with their position in the list), and a document
// that no server rendered gets them here. The elements that run or style the page (script, style, base) are the server's.
// A description with the text of the elements (`complete`: what readHead reads out of a document a server rendered) also replaces the
// elements that run or style the page, so a soft navigation leaves the document as a page load would.
const syncTags = (document, container, marker, tags, complete) => {
  const managed = (tag) => complete || DYNAMIC_HEAD_TAGS.includes(tag);
  // A tag the page wrote earlier that the head no longer describes at that position (the list got shorter, or the
  // position now holds another tag) is taken out, as the server does when it rewrites the marked region.
  for (const child of elementsOf(container)) {
    const index = child.getAttribute(marker);
    if (index === null || !managed(child.localName)) continue;
    if (tags[Number(index)]?.tag !== child.localName) child.remove();
  }
  tags.forEach((node, index) => {
    if (!managed(node.tag)) return;
    const existing = findMarked(container, marker, index);
    if (!DYNAMIC_HEAD_TAGS.includes(node.tag)) {
      // A script, style or base is written again only when it differs: an unchanged script must not run twice.
      const names = (existing?.getAttributeNames?.() ?? []).filter((name) => name !== marker);
      const same = existing && names.length === Object.keys(node.attributes).length && names.every((name) => name in node.attributes && (node.attributes[name] === true ? '' : node.attributes[name]) === existing.getAttribute(name)) && existing.textContent === (node.text ?? '');
      if (same) return;
      const element = document.createElement(node.tag);
      writeAttributes(element, node.attributes);
      if (node.text) element.append(document.createTextNode(node.text));
      element.setAttribute(marker, String(index));
      if (existing) existing.replaceWith(element);
      else insertAtPosition(container, marker, element, index);
      return;
    }
    const element = existing ?? document.createElement(node.tag);
    for (const name of [...(element.getAttributeNames?.() ?? [])]) if (name !== marker && !(name in node.attributes)) element.removeAttribute(name);
    writeAttributes(element, node.attributes);
    if (!existing) {
      element.setAttribute(marker, String(index));
      insertAtPosition(container, marker, element, index);
    }
  });
};

// Brings a browser document in line with a description: the title, the description meta, the attributes of <html> and
// <body>, and the page's own head and body elements. Writing a value that is already there changes nothing.
export const applyHead = (document, description) => {
  if (description.title && document.title !== description.title) document.title = description.title;
  const head = document.head;
  if (head) {
    const meta = elementsOf(head).find((child) => child.localName === 'meta' && child.getAttribute('name') === 'description');
    if (description.description) {
      const element = meta ?? document.createElement('meta');
      if (!meta) {
        element.setAttribute('name', 'description');
        head.append(element);
      }
      if (element.getAttribute('content') !== description.description) element.setAttribute('content', description.description);
    } else if (meta) {
      meta.remove();
    }
    syncTags(document, head, MARKER_HEAD, description.tags, description.complete);
  }
  if (document.documentElement) setManagedAttributes(document.documentElement, description.html, description.written?.html ?? null);
  if (document.body) {
    setManagedAttributes(document.body, description.body, description.written?.body ?? null);
    syncTags(document, document.body, MARKER_BODY, description.bodyTags, description.complete);
  }
};

// The plugin a page lists to keep its document current as its state changes: `plugins: [withHead]` (import it from `@ehtb/agent-ui/head`).
// The server writes `head` into every document it renders, and a soft navigation copies it from the document it fetched
// (src/head-reader.js), so the plugin is only for a head that is a function of the state; the page checks say so (src/pages-checks.js).
export const withHead = markPagePlugin(function withHead(environment) {
  return (api) => {
    const { win, page, basePath = '' } = environment;
    if (!win?.document?.createElement) return; // a server renders the head itself (server/document.mjs): its window has no document to keep
    api.watch(api.keys(), () => applyHead(win.document, resolveHead(page.head, api.state(), `page "${page.path}" head`, basePath)));
  };
});
