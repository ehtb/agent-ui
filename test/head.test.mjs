// The head of a page (src/head.js): the title and description, the attributes of <html> and <body>, the elements of <head>
// and of the end of <body>. Resolved for a state, written by the server, kept current by the browser, and checked when the
// page is defined.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { definePage } from '../src/pages.js';
import { applyHead, resolveHead as resolveLight, withHead } from '../src/head.js';
import { readHead } from '../src/head-reader.js';
import { describeDocument } from '../src/head-document.js';
import { injectHead, renderDocument } from '../server/document.mjs';
import { createRoot, createWindow, shimDocument } from './support/dom-shim.mjs';

// The description as the server writes it; the browser's (resolveLight) leaves out the text of scripts and styles.
const resolveHead = (head, state, where = 'head') => describeDocument(head, state, where);
const view = { tag: 'p', id: 'x', children: 'x' };
const define = (head, extra = {}) => definePage({ head, ...extra }, { path: '/', view });
const expectError = (action, pattern) => assert.throws(action, (error) => pattern.test(error.message), String(pattern));

const PAGE = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Old</title>\n</head>\n<body>\n<div id="app"></div>\n<script type="module" src="/a.js"></script>\n</body>\n</html>\n';

// ---- resolving ---------------------------------------------------------------------------------------------------------

test('resolveHead reads every value for the state; false, null and undefined leave an attribute out, true writes it bare', () => {
  const head = {
    title: (state) => `Item ${state.item.id}`,
    html: { lang: 'nl', class: (state) => (state.item.dark ? 'dark' : null), 'data-count': 3 },
    body: { hidden: false },
    tags: [
      { tag: 'meta', props: { property: 'og:title', content: (state) => state.item.name } },
      { tag: 'link', props: { rel: 'canonical', href: (state) => `/item/${state.item.id}` } },
      { tag: 'script', props: { type: 'application/ld+json' }, children: (state) => ({ name: state.item.name, note: '</script><b>' }) },
    ],
    bodyTags: [{ tag: 'script', props: { src: '/analytics.js', defer: true } }],
  };
  const state = { item: { id: 7, name: 'Chair "XL"', dark: false } };
  const resolved = resolveHead(head, state);
  assert.equal(resolved.title, 'Item 7');
  assert.deepEqual(resolved.html, { lang: 'nl', 'data-count': '3' });
  assert.deepEqual(resolved.body, {});
  assert.deepEqual(resolved.tags[0], { tag: 'meta', attributes: { property: 'og:title', content: 'Chair "XL"' }, text: '' });
  assert.deepEqual(resolved.tags[1].attributes, { rel: 'canonical', href: '/item/7' });
  assert.ok(!resolved.tags[2].text.includes('</script>') && resolved.tags[2].text.includes('\\u003c/script>'), 'data written for a script cannot end it');
  assert.deepEqual(JSON.parse(resolved.tags[2].text), { name: 'Chair "XL"', note: '</script><b>' });
  assert.deepEqual(resolved.bodyTags[0].attributes, { src: '/analytics.js', defer: true });
  assert.deepEqual(resolveHead(head, { item: { id: 1, name: 'a', dark: true } }).html, { lang: 'nl', class: 'dark', 'data-count': '3' });
});

test('an unsafe URL or a script that could end itself stops the render with the place and the fix', () => {
  expectError(() => resolveHead({ title: 't', tags: [{ tag: 'link', props: { rel: 'x', href: (state) => state.u } }] }, { u: 'javascript:alert(1)' }, 'page "/" head'), /page "\/" head\.tags\[0\]: href is an unsafe URL \("javascript:alert\(1\)"\)\. Use an http\(s\), relative or mailto URL/);
  expectError(() => resolveHead({ title: 't', tags: [{ tag: 'script', props: { src: (state) => state.u } }] }, { u: 'data:text/javascript,alert(1)' }, 'page "/" head'), /head\.tags\[0\]: src is an unsafe URL/);
  expectError(() => resolveHead({ title: 't', tags: [{ tag: 'link', props: { rel: 'x', HREF: (state) => state.u } }] }, { u: 'javascript:alert(1)' }, 'page "/" head'), /head\.tags\[0\]: HREF is an unsafe URL/);
  expectError(() => define({ title: 't', tags: [{ tag: 'link', props: { rel: 'x', HREF: '/a' } }] }), /"HREF" is not an attribute name\. Use lower case letters/);
  expectError(() => resolveHead({ title: 't', tags: [{ tag: 'script', children: 'a</script><b>' }] }, {}, 'page "/" head'), /the text of a script contains "<\/script" or "<!--"\. Move that text into a file and load it with `src`/);
  expectError(() => resolveHead({ title: 't', html: { lang: () => ({}) } }, {}, 'page "/" head'), /page "\/" head\.html: lang is \{\}, not a string, a number or a boolean/);
});

test('describePage returns the whole description for the current state', () => {
  const definition = define({ title: 'Home', description: 'Start', html: { lang: 'fr' }, tags: [{ tag: 'meta', props: { name: 'robots', content: 'noindex' } }] });
  assert.deepEqual(definition.describePage({ route: { params: {} } }), {
    title: 'Home', description: 'Start', html: { lang: 'fr' }, body: {},
    tags: [{ tag: 'meta', attributes: { name: 'robots', content: 'noindex' }, text: '' }], bodyTags: [],
  });
});

// ---- the checks --------------------------------------------------------------------------------------------------------

test('a mistake in head is reported with the place, what is wrong and how to fix it', () => {
  expectError(() => define({ title: 't', tgas: [] }), /page "\/" head: unknown key "tgas"\. Did you mean "tags"\? Allowed keys: title, description, html, body, tags, bodyTags/);
  expectError(() => define({ title: 't', html: 'en' }), /page "\/" html: must be an object of attributes\. Write html: \{ lang: 'en' \}/);
  expectError(() => define({ title: 't', html: { onclick: 'x()' } }), /"onclick" is an event handler attribute\. Handlers are actions/);
  expectError(() => define({ title: 't', body: { 'bad name': 'x' } }), /"bad name" is not an attribute name/);
  expectError(() => define({ title: 't', html: { lang: { state: 'a.b' } } }), /lang is a binding object\. A head value is a literal or a function of the state snapshot/);
  expectError(() => define({ title: 't', tags: {} }), /page "\/" tags: must be a list of elements/);
  expectError(() => define({ title: 't', tags: [{ tag: 'title', children: 'x' }] }), /page "\/" tags\[0\]: "title" is not allowed here\. .*Allowed in tags: meta, link, base, script, style\. The title is `head\.title`/);
  expectError(() => define({ title: 't', tags: [{ tag: 'meta', prop: {} }] }), /unknown key "prop"\. Did you mean "props"\?/);
  expectError(() => define({ title: 't', tags: [{ tag: 'meta', props: { name: 'description', content: 'x' } }] }), /a meta description is `head\.description`/);
  expectError(() => define({ title: 't', tags: [{ tag: 'meta', props: { charset: 'utf-8' } }] }), /character set is written by the framework/);
  expectError(() => define({ title: 't', tags: [{ tag: 'meta', props: { name: 'a' }, children: 'x' }] }), /meta has no children\. Put the value in props/);
  expectError(() => define({ title: 't', tags: [{ tag: 'script', props: { src: '/a.js' }, children: 'x' }] }), /a script has either `src` or children, not both/);
  expectError(() => define({ title: 't', tags: [{ tag: 'script', children: () => 'alert(1)' }] }), /the children of a script are a literal string\. Only a script of type application\/ld\+json/);
  expectError(() => define({ title: 't', tags: [{ tag: 'script', props: { src: (state) => state.x } }] }), /src of a script is a function\. A script is written once by the server/);
  expectError(() => define({ title: 't', tags: [{ tag: 'script', props: { type: 'application/ld+json' }, children: { state: 'a.b' } }] }), /children is a binding object\. A head value is a literal or a function of the state snapshot/);
  expectError(() => define({ title: 't', bodyTags: [{ tag: 'base', props: { href: '/' } }] }), /bodyTags\[0\]: "base" is not allowed here\. .*Allowed in bodyTags: meta, link, script, style/);
  assert.doesNotThrow(() => define({ title: 't', tags: [{ tag: 'script', props: { type: 'application/ld+json' }, children: (state) => ({ a: state.route.params }) }] }));
});

// ---- the server's document ---------------------------------------------------------------------------------------------

test('injectHead writes the title, the description, the attributes and the elements, and writing again changes nothing', () => {
  const description = resolveHead({
    title: 'A & B', description: 'About "A"', html: { lang: 'nl', class: 'dark' }, body: { 'data-page': 'x' },
    tags: [{ tag: 'meta', props: { property: 'og:title', content: 'Hi "you"' } }, { tag: 'script', props: { type: 'application/ld+json' }, children: '{"a":1}' }],
    bodyTags: [{ tag: 'script', props: { src: '/analytics.js', defer: true } }],
  }, {});
  const first = injectHead(PAGE, description);
  assert.match(first, /<html lang="nl" class="dark" data-agent-ui-attrs="lang class">/, 'the build\'s lang="en" is replaced, not repeated');
  assert.match(first, /<title>A &amp; B<\/title>\n<meta name="description" content="About &quot;A&quot;">/);
  assert.match(first, /<!--agent-ui-head:start-->\n<meta data-agent-ui-head="0" property="og:title" content="Hi &quot;you&quot;">\n<script data-agent-ui-head="1" type="application\/ld\+json">\{"a":1\}<\/script>\n<!--agent-ui-head:end-->\n<\/head>/);
  assert.match(first, /<body data-page="x" data-agent-ui-attrs="data-page">/);
  assert.match(first, /<script type="module" src="\/a\.js"><\/script>\n<!--agent-ui-body:start-->\n<script data-agent-ui-body="0" src="\/analytics\.js" defer><\/script>\n<!--agent-ui-body:end-->\n<\/body>/);
  assert.equal(injectHead(first, description), first);
  // A later render that asks for less removes what the earlier one wrote.
  const bare = injectHead(first, resolveHead({ title: 'Next' }, {}));
  assert.match(bare, /<html>\n/);
  assert.match(bare, /<body>\n/);
  assert.ok(!bare.includes('agent-ui-head') && !bare.includes('agent-ui-body') && !bare.includes('og:title') && !bare.includes('description'));
  assert.match(bare, /<title>Next<\/title>/);
});

test('a document written by the build is the template a per-request render fills in again', () => {
  const home = define({ title: 'Home', html: { lang: 'nl' }, tags: [{ tag: 'link', props: { rel: 'canonical', href: '/' } }] });
  const result = { html: '<p>hi</p>', stateScript: '<script type="application/json" id="agent-ui-state">{}</script>', state: { route: { params: {} } } };
  const built = renderDocument(PAGE, result, { describePage: home.describePage });
  assert.equal(renderDocument(built, result, { describePage: home.describePage }), built);
  assert.match(built, /<html lang="nl"/);
});

// ---- the browser's document --------------------------------------------------------------------------------------------

// The few DOM members applyHead uses, with the semantics of a browser's.
class FakeElement {
  constructor(localName) {
    this.localName = localName;
    this.nodeType = 1;
    this.attributes = new Map();
    this.childNodes = [];
    this.text = '';
  }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  getAttributeNames() { return [...this.attributes.keys()]; }
  append(node) { node.parent = this; this.childNodes.push(node); }
  insertBefore(node, reference) { node.parent = this; const at = reference ? this.childNodes.indexOf(reference) : -1; this.childNodes.splice(at < 0 ? this.childNodes.length : at, 0, node); }
  remove() { this.parent.childNodes = this.parent.childNodes.filter((node) => node !== this); }
  replaceWith(node) { this.parent.insertBefore(node, this); this.remove(); }
  set textContent(value) { this.text = value; }
}
const fakeDocument = () => {
  const document = { title: 'Old', createElement: (name) => new FakeElement(name), head: new FakeElement('head'), body: new FakeElement('body'), documentElement: new FakeElement('html') };
  document.documentElement.setAttribute('lang', 'en');
  return document;
};

test('applyHead brings a browser document in line (title, description, attributes, meta and link), and removes what the page stopped asking for', () => {
  const document = fakeDocument();
  applyHead(document, resolveLight({
    title: 'One', description: 'First', html: { lang: 'nl', class: 'dark' }, body: { 'data-page': 'a' },
    tags: [{ tag: 'meta', props: { name: 'robots', content: 'noindex' } }, { tag: 'script', props: { type: 'application/ld+json' }, children: '{}' }],
    bodyTags: [{ tag: 'script', props: { src: '/a.js' } }],
  }, {}));
  assert.equal(document.title, 'One');
  assert.equal(document.documentElement.getAttribute('lang'), 'nl');
  assert.equal(document.documentElement.getAttribute('class'), 'dark');
  assert.equal(document.body.getAttribute('data-page'), 'a');
  const metas = document.head.childNodes.filter((node) => node.localName === 'meta');
  assert.deepEqual(metas.map((node) => [node.getAttribute('name'), node.getAttribute('content')]), [['description', 'First'], ['robots', 'noindex']]);
  assert.equal(document.head.childNodes.some((node) => node.localName === 'script'), false, 'a script is written by the server, not by the browser');
  assert.equal(document.body.childNodes.length, 0);
  // The state changes: values follow, an attribute the page stopped asking for goes, a script is not written twice.
  const robots = metas[1];
  applyHead(document, resolveLight({ title: 'Two', html: { lang: 'fr' }, tags: [{ tag: 'meta', props: { name: 'robots', content: 'all' } }, { tag: 'script', props: { type: 'application/ld+json' }, children: '{}' }], bodyTags: [{ tag: 'script', props: { src: '/a.js' } }] }, {}));
  assert.equal(document.title, 'Two');
  assert.equal(document.documentElement.getAttribute('lang'), 'fr');
  assert.equal(document.documentElement.getAttribute('class'), null);
  assert.equal(document.body.getAttribute('data-page'), null);
  assert.equal(robots.getAttribute('content'), 'all', 'the same element is updated, not replaced');
  assert.ok(!document.head.childNodes.some((node) => node.getAttribute('name') === 'description'), 'a page with no description has no description tag');
});

test('applyHead removes the meta and link elements a shorter head no longer describes, like the server does', () => {
  const document = fakeDocument();
  const robots = { tag: 'meta', props: { name: 'robots', content: 'noindex' } };
  const canonical = { tag: 'link', props: { rel: 'canonical', href: '/a' } };
  applyHead(document, resolveLight({ tags: [robots, canonical] }, {}));
  assert.equal(document.head.childNodes.length, 2);
  applyHead(document, resolveLight({ tags: [robots] }, {}));
  assert.deepEqual(document.head.childNodes.map((node) => node.localName), ['meta'], 'the link of the removed position is gone');
  // A position that now holds a script (the server's) loses the meta the browser wrote there.
  applyHead(document, resolveLight({ tags: [{ tag: 'script', props: { src: '/x.js' } }] }, {}));
  assert.equal(document.head.childNodes.length, 0);
  // A position that changes from one dynamic tag to another is replaced, not rewritten into the wrong element.
  applyHead(document, resolveLight({ tags: [robots] }, {}));
  applyHead(document, resolveLight({ tags: [canonical] }, {}));
  assert.deepEqual(document.head.childNodes.map((node) => node.localName), ['link']);
});

test('a page keeps its document current while its state changes', async () => {
  const namespaces = { theme: { state: { name: 'light' }, actions: { set: { args: { name: 'string' }, run: (store, { name }) => store.set('name', name) } } } };
  const definition = definePage(
    { head: { title: (state) => `Theme ${state.theme.name}`, html: { class: (state) => `theme-${state.theme.name}` } }, namespaces, plugins: [withHead] },
    { path: '/', view },
  );
  const document = fakeDocument();
  const win = { ...createWindow('/'), document };
  const ui = definition.create({ root: createRoot(), win, fetchFunction: null, dev: true });
  await ui.settle();
  assert.equal(document.title, 'Theme light');
  assert.equal(document.documentElement.getAttribute('class'), 'theme-light');
  ui.dispatch('theme.set', { name: 'dark' });
  await ui.settle();
  assert.equal(document.title, 'Theme dark');
  assert.equal(document.documentElement.getAttribute('class'), 'theme-dark');
});

test('a head value that follows the state needs the plugin that keeps the browser current', () => {
  expectError(
    () => define({ title: 't', html: { class: (state) => state.route.params.theme } }),
    /page "\/": head\.html\.class follows the state, but nothing keeps the browser's document current\. Add `plugins: \[withHead\]` to page\.js \(withHead is the export of `@ehtb\/agent-ui\/head`\), or make the value a literal/,
  );
  expectError(
    () => define({ title: 't', tags: [{ tag: 'meta', props: { name: 'robots', content: (state) => state.route.params.r } }] }),
    /head\.tags\[0\]\.props\.content follows the state/,
  );
  assert.doesNotThrow(() => define({ title: 't', html: { class: (state) => state.route.params.theme } }, { plugins: [withHead] }));
  expectError(
    () => define({ title: 't', description: (state) => state.route.params.d }),
    /page "\/": head\.description follows the state, but nothing keeps the browser's document current\. Add `plugins: \[withHead\]`/,
  );
  assert.doesNotThrow(() => define({ title: 't', description: (state) => state.route.params.d }, { plugins: [withHead] }));
  assert.doesNotThrow(() => define({ title: (state) => state.route.params.t, description: 'd', html: { lang: 'en' } }), 'the title is always kept current, and a literal needs nothing');
});

test('injectHead: a script that mentions <body> or <html> is not mistaken for the tag, on any render', () => {
  const page = '<!doctype html><html lang="en"><head><title>x</title></head><body class="a"><div id="app"></div><script type="module" src="/m.js"></script></body></html>';
  const description = { title: 't', html: { lang: 'nl' }, body: { 'data-x': '1' }, tags: [{ tag: 'script', attributes: {}, text: 'var s = "<body><html>";' }] };
  const once = injectHead(page, description);
  assert.match(once, /<body class="a" data-x="1" data-agent-ui-attrs="data-x">/);
  assert.match(once, /<script data-agent-ui-head="0">var s = "<body><html>";<\/script>/);
  assert.equal(injectHead(once, description), once, 'a second render gives the same document');
});

test('a page without withHead still keeps its title current', async () => {
  const namespaces = { theme: { state: { name: 'light' }, actions: { set: { args: { name: 'string' }, run: (store, { name }) => store.set('name', name) } } } };
  const definition = definePage({ head: { title: (state) => `Theme ${state.theme.name}` }, namespaces }, { path: '/', view });
  const document = fakeDocument();
  const ui = definition.create({ root: createRoot(), win: { ...createWindow('/'), document }, fetchFunction: null, dev: true });
  ui.dispatch('theme.set', { name: 'dark' });
  await ui.settle();
  assert.equal(document.title, 'Theme dark');
});

// ---- reading a rendered document back (soft navigation) --------------------------------------------------------------------

test('readHead reads what injectHead wrote: description, attributes of <html> and <body>, and every element with its text', () => {
  const description = {
    title: 'Item',
    description: 'A "fine" <item> & more',
    html: { lang: 'nl', 'data-theme': 'dark' },
    body: { class: 'wide', inert: true },
    tags: [
      { tag: 'meta', attributes: { property: 'og:title', content: 'A & B' }, text: '' },
      { tag: 'script', attributes: { type: 'application/ld+json' }, text: '{"name":"\\u003c/x>"}' },
      { tag: 'style', attributes: {}, text: 'p { color: red }' },
    ],
    bodyTags: [{ tag: 'script', attributes: { src: '/analytics.js', defer: true }, text: '' }],
  };
  const read = readHead(injectHead(PAGE, description));
  assert.equal(read.description, description.description);
  assert.deepEqual(read.html, { lang: 'nl', 'data-theme': 'dark' });
  assert.deepEqual(read.body, { class: 'wide', inert: true });
  assert.deepEqual(read.tags, description.tags);
  assert.deepEqual(read.bodyTags, description.bodyTags);
  assert.equal(read.complete, true);
});

test('applyHead with a complete description replaces the scripts and styles too, and leaves an unchanged script alone', () => {
  const document = { createElement: shimDocument.createElement, createTextNode: shimDocument.createTextNode, head: shimDocument.createElement('head'), body: shimDocument.createElement('body'), title: '' };
  const script = (text) => ({ tag: 'script', attributes: { type: 'application/ld+json' }, text });
  applyHead(document, { ...readHead(''), tags: [script('{"a":1}')], bodyTags: [] });
  const first = document.head.childNodes.find((node) => node.localName === 'script');
  assert.equal(first.textContent, '{"a":1}');
  applyHead(document, { ...readHead(''), tags: [script('{"a":1}')], bodyTags: [] });
  assert.equal(document.head.childNodes.find((node) => node.localName === 'script'), first, 'an unchanged script is not written again (it would run twice)');
  applyHead(document, { ...readHead(''), tags: [script('{"a":2}')], bodyTags: [] });
  assert.equal(document.head.childNodes.find((node) => node.localName === 'script').textContent, '{"a":2}');
  applyHead(document, { ...readHead(''), tags: [], bodyTags: [] });
  assert.equal(document.head.childNodes.filter((node) => node.localName === 'script').length, 0);
});

test('withHead does nothing on a server (its window has no document to keep)', () => {
  const plugin = withHead({ win: createWindow('/'), page: { path: '/', head: { title: 'x', description: () => { throw new Error('read on the server'); } } } });
  assert.doesNotThrow(() => plugin({ watch: () => assert.fail('a watch was made'), keys: () => [], state: () => ({}) }));
});

test('readHead does not read markup out of the text of a script or style', () => {
  const description = {
    title: 't',
    description: 'real',
    html: { lang: 'nl' },
    body: { class: 'a', 'data-x': '1' },
    tags: [
      { tag: 'script', attributes: {}, text: 'var s = "<body class=\\"fake\\"><html lang=\\"xx\\"><meta name=\\"description\\" content=\\"fake\\">";' },
      { tag: 'script', attributes: {}, text: 'var m = \'<meta data-agent-ui-head="0" name="fake">\';' },
      { tag: 'style', attributes: {}, text: '/* <body id="fake"> */' },
    ],
  };
  const read = readHead(injectHead(PAGE, description));
  assert.equal(read.description, 'real');
  assert.deepEqual(read.html, { lang: 'nl' });
  assert.deepEqual(read.body, { class: 'a', 'data-x': '1' });
  assert.deepEqual(read.tags, description.tags.map((tag) => ({ ...tag, attributes: tag.attributes })));
  assert.deepEqual(read.bodyTags, []);
});

test('readHead keeps the template\'s own attributes of <html> and <body>, so a soft navigation restores them', () => {
  const template = '<!doctype html><html lang="en"><head><title>x</title></head><body class="shell"><div id="app"></div><script type="module" src="/m.js"></script></body></html>';
  const read = readHead(template);
  assert.deepEqual(read.html, { lang: 'en' });
  assert.deepEqual(read.body, { class: 'shell' });
  const document = { createElement: shimDocument.createElement, createTextNode: shimDocument.createTextNode, head: shimDocument.createElement('head'), body: shimDocument.createElement('body'), documentElement: shimDocument.createElement('html'), title: '' };
  applyHead(document, readHead(injectHead(template, { title: 't', html: { lang: 'nl' } })));
  assert.equal(document.documentElement.getAttribute('lang'), 'nl');
  applyHead(document, read);
  assert.equal(document.documentElement.getAttribute('lang'), 'en', 'a page that sets no lang gets the template\'s again');
  assert.equal(document.body.getAttribute('class'), 'shell');
});

test('the template\'s attributes that a soft navigation writes are not listed as the page\'s, so a later head without them keeps them', () => {
  const template = '<!doctype html><html lang="en"><head><title>x</title></head><body class="shell"><div id="app"></div></body></html>';
  const document = { createElement: shimDocument.createElement, createTextNode: shimDocument.createTextNode, head: shimDocument.createElement('head'), body: shimDocument.createElement('body'), documentElement: shimDocument.createElement('html'), title: '' };
  assert.deepEqual(readHead(template).written, { html: [], body: [] });
  assert.deepEqual(readHead(injectHead(template, { title: 't', html: { lang: 'nl' } })).written, { html: ['lang'], body: [] });
  applyHead(document, readHead(template));
  assert.equal(document.documentElement.getAttribute('data-agent-ui-attrs'), null, 'nothing listed: the page did not write them');
  applyHead(document, { ...readHead(''), html: {}, body: {} }); // what withHead resolves for a page whose head sets no attribute
  assert.equal(document.documentElement.getAttribute('lang'), 'en');
  assert.equal(document.body.getAttribute('class'), 'shell');
});

test('a stylesheet link in head.tags is refused: page styles are page.css, which the build links and a soft navigation waits for', () => {
  expectError(
    () => define({ title: 't', tags: [{ tag: 'link', props: { rel: 'stylesheet', href: '/x.css' } }] }),
    /tags\[0\]: a stylesheet link is not written here\. Put the styles in page\.css/,
  );
  assert.doesNotThrow(() => define({ title: 't', tags: [{ tag: 'link', props: { rel: 'preload', href: '/x.css', as: 'style' } }] }));
});

test('a changed script or style keeps its place among the page\'s elements, and a new one goes where its position says', () => {
  const document = { createElement: shimDocument.createElement, createTextNode: shimDocument.createTextNode, head: shimDocument.createElement('head'), body: shimDocument.createElement('body'), title: '' };
  const style = (text) => ({ tag: 'style', attributes: {}, text });
  const script = (text) => ({ tag: 'script', attributes: {}, text });
  const order = () => document.head.childNodes.filter((node) => node.nodeType === 1).map((node) => `${node.localName}:${node.textContent}`);
  applyHead(document, { ...readHead(''), tags: [style('B'), script('A')], bodyTags: [] });
  applyHead(document, { ...readHead(''), tags: [style('B2'), script('A')], bodyTags: [] });
  assert.deepEqual(order(), ['style:B2', 'script:A'], 'the changed first element stays first');
  applyHead(document, { ...readHead(''), tags: [script('C'), style('B2'), script('A')], bodyTags: [] });
  assert.deepEqual(order().length, 3);
  assert.equal(document.head.childNodes.find((node) => node.getAttribute?.('data-agent-ui-head') === '0').textContent, 'C');
});

test('a link whose rel is a function is refused (it could be a stylesheet), and so is any data-agent-ui-* name in head attributes', () => {
  expectError(
    () => define({ title: 't', tags: [{ tag: 'link', props: { rel: (state) => state.route.params.r, href: '/x.css' } }] }, { plugins: [withHead] }),
    /tags\[0\]: the rel of a link is a literal/,
  );
  expectError(() => define({ title: 't', html: { 'data-agent-ui-foo': '1' } }), /"data-agent-ui-foo" is the framework's own attribute/);
});

test('readHead reads single-quoted and unquoted attributes of a hand-edited template', () => {
  const read = readHead("<!doctype html><html lang='en' data-a=b><head><title>x</title></head><body class='shell'></body></html>");
  assert.deepEqual(read.html, { lang: 'en', 'data-a': 'b' });
  assert.deepEqual(read.body, { class: 'shell' });
});
