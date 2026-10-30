// The HTML document of a rendered page: the app's markup and state inside the page template, plus the page's title and
// description. Used for a static build and at request time (server rendering).
import { escapeAttribute, escapeText } from '../src/html-escape.js';
import { APP_ELEMENT_ID, SHELL_ELEMENT_ID } from '../src/hydrate.js';
import { MODULE_SCRIPT_START } from '../src/document-markup.js';
import { removeStateScript } from '../src/document-markup-reader.js';
import { BODY_END, BODY_START, HEAD_END, HEAD_START, MARKER_ATTRIBUTES, MARKER_BODY, MARKER_HEAD } from '../src/head.js';
import { VOID_HEAD_TAGS } from '../src/head-document.js';
import { escapeRegex } from '../src/url-pattern.js';

// Puts rendered markup inside <div id="app"> and the state script before the module script. Idempotent: markup and
// state script from an earlier run (a static build) are replaced, so the build output is the template that the
// per-request server (server/ssr-handler.mjs) fills in again. A page with a shell (`shell: true` in the render result) is
// rendered from the shell's root: the mount point becomes <div id="shell">, and the page's own element is inside the markup.
const START = '<!--ssr:start-->';
const END = '<!--ssr:end-->';
// The patterns are made once: every render walks the same shell, and a fresh RegExp per request is allocation without a
// reason. None of them is global, so no lastIndex carries from one request to the next.
const MARKERS = new RegExp(`${START}[\\s\\S]*?${END}`);
const MOUNT_POINT = new RegExp(`<div id="?(?:${APP_ELEMENT_ID}|${SHELL_ELEMENT_ID})"?>`);
export const injectMarkup = (pageHtml, { html, stateScript, shell = false }) => {
  const template = removeStateScript(pageHtml.replace(MARKERS, ''));
  const mountPoint = template.match(MOUNT_POINT);
  if (!mountPoint) throw new Error(`prerender: the page has no <div id="${APP_ELEMENT_ID}"> (or <div id="${SHELL_ELEMENT_ID}"> for a page with a shell) to render into`);
  // Slices, not String.replace: rendered text may contain "$&" or "$'", which replace() would interpret.
  const mountEnd = mountPoint.index + mountPoint[0].length;
  const wanted = shell ? SHELL_ELEMENT_ID : APP_ELEMENT_ID;
  const mountTag = mountPoint[0].includes(wanted) ? mountPoint[0] : `<div id="${wanted}">`; // the template's own spelling stays when it fits
  const withMarkup = `${template.slice(0, mountPoint.index)}${mountTag}${START}${html}${END}${template.slice(mountEnd)}`;
  const moduleScript = withMarkup.indexOf(MODULE_SCRIPT_START);
  if (moduleScript < 0) throw new Error('prerender: the page has no module script');
  return `${withMarkup.slice(0, moduleScript)}${stateScript}\n${withMarkup.slice(moduleScript)}`;
};

// ---- the head of the document ----------------------------------------------------------------------------------------
// The page's own elements sit between two comments, so that a document written by the build (the template the per-request
// server fills in again) is rewritten, not added to. The attributes it wrote on <html> and <body> are listed on the element
// (MARKER_ATTRIBUTES), so the ones a later render no longer asks for are removed. An attribute the template has itself
// (`lang="en"`) is replaced by the page's, and is not restored when a later render stops asking: fill in the shell (`<name>.html`,
// which no render writes to), as createSsrHandler and prerender do, and every render starts from the template's own.

const attributesText = (attributes) =>
  Object.entries(attributes)
    .map(([name, value]) => (value === true ? ` ${name}` : ` ${name}="${escapeAttribute(value)}"`))
    .join('');

const elementText = ({ tag, attributes, text }, marker, index) => {
  const open = `<${tag} ${marker}="${index}"${attributesText(attributes)}>`;
  return VOID_HEAD_TAGS.includes(tag) ? open : `${open}${text}</${tag}>`;
};

const regionText = (nodes, marker, start, end) => (nodes.length ? `${start}\n${nodes.map((node, index) => elementText(node, marker, index)).join('\n')}\n${end}\n` : '');

// The attributes of an open tag as { name, raw } (the raw text is kept so that nothing is unescaped and escaped again).
const ATTRIBUTE = /([^\s=/>"']+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/g;
const TAG_PATTERNS = {
  html: /<html(\s[^>]*)?>/i,
  body: /<body(\s[^>]*)?>/i,
};
const withAttributes = (html, tagName, attributes) => {
  const match = TAG_PATTERNS[tagName].exec(html);
  if (!match) return html;
  const existing = [...(match[1] ?? '').matchAll(ATTRIBUTE)].map((found) => ({ name: found[1], raw: found[0] }));
  const managed = existing.find((attribute) => attribute.name === MARKER_ATTRIBUTES)?.raw.match(/"([^"]*)"/)?.[1].split(' ') ?? [];
  const drop = new Set([MARKER_ATTRIBUTES, ...managed, ...Object.keys(attributes)].map((name) => name.toLowerCase()));
  const kept = existing.filter((attribute) => !drop.has(attribute.name.toLowerCase())).map((attribute) => ` ${attribute.raw}`).join('');
  const names = Object.keys(attributes);
  const marker = names.length ? ` ${MARKER_ATTRIBUTES}="${escapeAttribute(names.join(' '))}"` : '';
  return `${html.slice(0, match.index)}<${tagName}${kept}${attributesText(attributes)}${marker}>${html.slice(match.index + match[0].length)}`;
};

const HEAD_REGION = new RegExp(`${escapeRegex(HEAD_START)}[\\s\\S]*?${escapeRegex(HEAD_END)}\\n?`);
const BODY_REGION = new RegExp(`${escapeRegex(BODY_START)}[\\s\\S]*?${escapeRegex(BODY_END)}\\n?`);
const DESCRIPTION_META = /<meta name="description" content="[^"]*">\n?/;
const TITLE = /<title>[\s\S]*?<\/title>/;
const withRegion = (html, text, before) => {
  const at = html.lastIndexOf(before);
  return !text || at < 0 ? html : `${html.slice(0, at)}${text}${html.slice(at)}`;
};

// What a page says about its document (src/head.js, resolveHead): the title, the description meta tag, the attributes of
// <html> and <body>, the elements of <head> and the elements at the end of <body>. Idempotent, like injectMarkup.
export const injectHead = (pageHtml, { title, description, html: htmlAttributes = {}, body: bodyAttributes = {}, tags = [], bodyTags = [] }) => {
  let html = pageHtml.replace(DESCRIPTION_META, '');
  // Replacer functions, not replacement strings: a title may contain "$&" or "$'", which replace() would interpret.
  if (title) html = html.replace(TITLE, () => `<title>${escapeText(title)}</title>`);
  if (description) html = html.replace('</title>', () => `</title>\n<meta name="description" content="${escapeAttribute(description)}">`);
  // The earlier regions go first and the attributes are written next, so that the text of a script from an earlier render (or
  // this one) can never be mistaken for the <html> or <body> tag; the new regions are put in last.
  html = html.replace(HEAD_REGION, '').replace(BODY_REGION, '');
  html = withAttributes(withAttributes(html, 'html', htmlAttributes), 'body', bodyAttributes);
  html = withRegion(html, regionText(tags, MARKER_HEAD, HEAD_START, HEAD_END), '</head>');
  return withRegion(html, regionText(bodyTags, MARKER_BODY, BODY_START, BODY_END), '</body>');
};

// The finished document for one render: markup, state, and (when the app module exports describePage) the page's
// title and description.
export const renderDocument = (template, result, { describePage = null } = {}) => {
  const withMarkup = injectMarkup(template, result);
  return describePage ? injectHead(withMarkup, describePage(result.state)) : withMarkup;
};
