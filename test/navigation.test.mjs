// Soft navigation (src/navigation.js) with a shell (src/shell.js), driven the way a browser drives it, against the test shim: the first page
// starts inside its shell, a click on a soft link (or route.go from a button) replaces the page and leaves the shell, and everything that is
// not a plain page ends in a normal page load. The shim is not a browser: the same flow in a real one is what the shop example's browser
// check does. The tests run in order and share one document, like the pages of a site do.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ShimElement, fireEvent, shimDocument } from './support/dom-shim.mjs';
import { deferred, sleep } from './support/helpers.mjs';

const { startPage, findEntry, currentPage: running } = await import('../src/pages.js');
const currentPage = () => ({ ...running() }); // a copy: the record is kept current in place, and a test compares before with after
const { defineShell } = await import('../src/shell.js');
const { navigation, readDocument } = await import('../src/navigation.js');
const { a, button, div, footer, header, input, main, p, pageSlot, section, span, state, act } = await import('../src/spec.js');

// ---------------------------------------------------------------------------------------------------- a fake browser

const listeners = { click: [], popstate: [] };
const head = new ShimElement('head');
const body = new ShimElement('body');
shimDocument.head = head;
shimDocument.body = body;
shimDocument.getElementById = (id) => (body.attributes.id === id ? body : body.findById(id));
shimDocument.addEventListener = (type, listener) => listeners[type]?.push(listener);
shimDocument.removeEventListener = (type, listener) => (listeners[type] = listeners[type].filter((registered) => registered !== listener));

const history = [];
const scrolls = [];
const assigned = [];
const warnings = [];
const location = { pathname: '/', search: '', hash: '', origin: 'http://localhost', href: 'http://localhost/', assign: (href) => assigned.push(href) };
const setLocation = (href) => {
  const url = new URL(href, 'http://localhost');
  Object.assign(location, { pathname: url.pathname, search: url.search, hash: url.hash, href: url.href });
};
let answer = async () => { throw new Error('no answer prepared'); };
const fetched = [];
globalThis.window = {
  location,
  document: shimDocument,
  history: { pushState: (state, title, href) => (history.push(href), setLocation(href)) },
  addEventListener: (type, listener) => listeners[type]?.push(listener),
  removeEventListener: (type, listener) => (listeners[type] = listeners[type].filter((registered) => registered !== listener)),
  fetch: (url, init) => (fetched.push(url), answer(url, init)),
  scrollTo: (x, y) => scrolls.push([x, y]),
  setTimeout,
  clearTimeout,
};
console.warn = (message) => warnings.push(message);

const htmlResponse = (text, extra = {}) => ({ ok: true, status: 200, redirected: false, headers: { get: () => 'text/html; charset=utf-8' }, text: async () => text, ...extra });
const documentOf = ({ entry, state: pageState, stylesheets = [], headHtml = '' }) =>
  `<!doctype html><html><head>${headHtml}${stylesheets.map((href) => `<link rel="stylesheet" href="${href}">`).join('')}</head><body><div id="shell">x</div>${pageState ? `<script type="application/json" id="agent-ui-state">${JSON.stringify(pageState)}</script>` : ''}${entry ? `<script type="module" src="${entry}"></script>` : ''}</body></html>`;

const stylesheetHrefs = () => head.childNodes.filter((node) => node.localName === 'link').map((node) => node.getAttribute('href'));
const addStylesheet = (href) => {
  const link = new ShimElement('link');
  link.setAttribute('rel', 'stylesheet');
  link.setAttribute('href', href);
  head.append(link);
};
const until = async (condition, what) => {
  for (let round = 0; round < 100; round++) {
    if (condition()) return;
    await sleep(2);
  }
  assert.fail(`timed out waiting for ${what}`);
};
const click = (target, extra = {}) => {
  const event = { type: 'click', target, button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
  for (const listener of [...listeners.click]) listener(event);
  return event;
};
const find = (root, predicate) => {
  const found = [];
  const visit = (node) => node.childNodes?.forEach((child) => (child.localName && predicate(child) && found.push(child), visit(child)));
  visit(root);
  return found;
};
const byDataId = (id) => find(body, (element) => element.getAttribute('data-id') === id)[0];

// ---------------------------------------------------------------------------------------------------- the site

const frame = { state: { cartCount: 0 }, actions: { setCartCount: { args: { count: 'number' }, run: (store, { count }) => store.set('cartCount', count) } } };
const cart = { state: { lines: [] }, derive: { count: (get) => get('lines').reduce((sum, line) => sum + line.quantity, 0) } };
const imported = [];
const shell = defineShell({
  name: 'main',
  namespaces: { frame },
  plugins: [({ win, fetchFunction, shellName }) => navigation({ win, fetchFunction, shellName, importModule: async (url) => (imported.push(url), moduleFor[url]?.()), loadStylesheet: async (href) => addStylesheet(href) })],
  reads: [{ watch: ['cart.count'], action: 'frame.setCartCount', args: { count: 'cart.count' } }],
});
const shellContent = {
  name: 'main',
  view: main(
    { id: 'frame' },
    header({ id: 'frame-header' }, a({ id: 'to-home', href: '/', soft: true }, 'Home'), a({ id: 'to-b', href: '/b', soft: true }, 'B'), span({ id: 'badge' }, state('frame.cartCount'), ' @ ', state('route.path'))),
    pageSlot(),
    p({ id: 'announcer', domId: 'agent-ui-announcer', 'aria-live': 'polite' }, 'Page'),
    footer({ id: 'frame-footer' }, 'footer'),
  ),
};
const pageA = { head: { title: 'Page A' }, namespaces: { cart }, shell };
const viewA = div({ id: 'page-a' }, 'A', input({ id: 'typed', 'aria-label': 'typed' }), button({ id: 'go-b', on: { click: act('route.go', { href: '/b' }) } }, 'Go to B'), a({ id: 'external', href: 'https://example.com/', soft: true }, 'out'), a({ id: 'plain', href: '/b' }, 'plain'), a({ id: 'new-tab', href: '/b', target: '_blank', soft: true }, 'tab'), a({ id: 'to-c', href: '/c', soft: true }, 'C'), a({ id: 'to-missing', href: '/missing', soft: true }, 'missing'), a({ id: 'to-gone', href: '/gone', soft: true }, 'gone'), a({ id: 'to-slow', href: '/slow', soft: true }, 'slow'));
const pageB = { head: { title: 'Page B' }, namespaces: { cart }, shell };
const viewB = div({ id: 'page-b' }, 'B has ', state('cart.count'), a({ id: 'back', href: '/', soft: true }, 'back'), a({ id: 'same-page', href: '/b#details', soft: true }, 'details'));
const pageC = { head: { title: 'Page C' } };
const viewC = div({ id: 'page-c' }, 'C has no shell');

const entries = { '/assets/a.js': { page: pageA, path: '/', spec: viewA }, '/assets/b.js': { page: pageB, path: '/b', spec: viewB }, '/assets/c.js': { page: pageC, path: '/c', spec: viewC, noShell: true } };
const register = (name) => () => {
  const { page, path, spec, noShell } = entries[name];
  startPage(page, { url: `http://localhost${name}`, dev: true, path, spec, ...(noShell ? {} : { shell: shellContent }) });
};
const moduleFor = { 'http://localhost/assets/b.js': register('/assets/b.js'), 'http://localhost/assets/c.js': register('/assets/c.js') };

const documents = {
  // What a server writes for a head with a description and a script (server/document.mjs, injectHead).
  '/b': documentOf({ entry: '/assets/b.js', state: { cart: { lines: [{ id: 1, quantity: 4 }] } }, stylesheets: ['/assets/shared.css', '/assets/b.css'], headHtml: '<title>Page B</title>\n<meta name="description" content="About &quot;B&quot;">\n<!--agent-ui-head:start-->\n<script data-agent-ui-head="0" type="application/ld+json">{"name":"B"}</script>\n<!--agent-ui-head:end-->\n' }),
  '/': documentOf({ entry: '/assets/a.js', state: { cart: { lines: [{ id: 1, quantity: 1 }] } }, stylesheets: ['/assets/shared.css', '/assets/a.css'] }),
  '/c': documentOf({ entry: '/assets/c.js', stylesheets: ['/assets/shared.css'] }),
};
answer = async (url) => {
  if (url in documents) return htmlResponse(documents[url]);
  if (url === '/missing') return htmlResponse('not found', { ok: false, status: 404 });
  if (url === '/gone') return htmlResponse('', { redirected: true });
  throw new Error(`unexpected request ${url}`);
};

// ---------------------------------------------------------------------------------------------------- readDocument

test('readDocument reads the state, the entry file and the stylesheets from the text of a document', () => {
  assert.deepEqual(readDocument(documents['/b']), { state: { cart: { lines: [{ id: 1, quantity: 4 }] } }, entryUrl: '/assets/b.js', stylesheets: ['/assets/shared.css', '/assets/b.css'] });
  assert.deepEqual(readDocument(documentOf({ entry: '/assets/c.js' })), { state: {}, entryUrl: '/assets/c.js', stylesheets: [] }, 'a document rendered without state starts the page from its defaults');
  assert.equal(readDocument('<html></html>').entryUrl, null);
});

// ---------------------------------------------------------------------------------------------------- the first page

test('the first page starts inside its shell: the page\'s element is kept, the shell mounts around it, and the shell reads the page', async () => {
  const app = new ShimElement('div');
  app.attributes.id = 'app';
  app.marker = 'the server\'s element';
  body.append(app);
  addStylesheet('/assets/shared.css');
  addStylesheet('/assets/a.css');
  register('/assets/a.js')();
  const running = currentPage();
  assert.ok(running.shellApp, 'the shell app started');
  assert.equal(running.slot, app, 'the page mounted in the element that was in the document, not in a copy');
  assert.equal(shimDocument.getElementById('app'), app, 'and that element is in the shell\'s slot');
  assert.equal(app.parentElement.attributes['data-id'], 'frame', 'it sits inside the shell, between the header and the footer');
  assert.equal(app.previousSibling.attributes['data-id'], 'frame-header');
  assert.equal(byDataId('frame-header') !== undefined, true);
  assert.equal(window.__shell, running.shellApp);
  assert.equal(findEntry('http://localhost/assets/a.js') !== undefined, true, 'the entry is registered under the URL of its own file');
  await running.ui.settle();
  assert.equal(running.shellApp.state().route.path, '/');
  assert.deepEqual(running.ui.tree().map((entry) => entry.id).slice(0, 2), ['go-b', 'external'], 'the page app sees its own elements only');
  assert.equal(running.shellApp.tree().some((entry) => entry.id === 'go-b'), false);
});

// ---------------------------------------------------------------------------------------------------- following soft links

test('a click on a soft link replaces the page and keeps the shell: new state, new address, new stylesheets, focus, announcement, scroll', async () => {
  const before = currentPage();
  const event = click(byDataId('to-b'));
  assert.equal(event.defaultPrevented, true, 'the browser does not navigate');
  await until(() => currentPage().ui !== before.ui, 'the page to be replaced');
  const now = currentPage();
  assert.equal(before.ui.destroyed, true, 'the old page app was destroyed');
  assert.equal(now.shellApp, before.shellApp, 'the shell app is the same one');
  assert.equal(now.slot, before.slot, 'the page lives in the same element');
  assert.deepEqual(history, ['/b']);
  assert.equal(location.pathname, '/b');
  assert.deepEqual(imported, ['http://localhost/assets/b.js']);
  await now.ui.settle();
  assert.equal(byDataId('page-b').textContent.startsWith('B has 4'), true, 'the page started from the state its document carried');
  assert.deepEqual(now.ui.state().route.params, {});
  assert.equal(now.shellApp.state().route.path, '/b', 'the shell was told the path');
  await now.shellApp.settle();
  assert.equal(now.shellApp.state().frame.cartCount, 4, 'the shell reads the new page');
  assert.equal(byDataId('badge').textContent, '4 @ /b');
  assert.deepEqual(stylesheetHrefs(), ['/assets/shared.css', '/assets/b.css'], 'the old page\'s stylesheet is gone, the shared one stayed, the new one was added');
  const descriptions = () => head.childNodes.filter((node) => node.localName === 'meta' && node.getAttribute('name') === 'description');
  assert.deepEqual(descriptions().map((node) => node.getAttribute('content')), ['About "B"'], 'the description of the next page, as a load would give it');
  assert.deepEqual(head.childNodes.filter((node) => node.localName === 'script').map((node) => node.textContent), ['{"name":"B"}'], 'and its data script');
  assert.equal(now.slot.attributes.tabindex, '-1');
  assert.equal(now.slot.getAttribute('role'), 'region');
  assert.equal(now.slot.getAttribute('aria-label'), 'Page B', 'the focused page slot names the page');
  assert.equal(shimDocument.getElementById('agent-ui-announcer').textContent, 'Page B', 'the site\'s live region gets the new title');
  assert.equal(now.slot.focusCount, 1, 'the page\'s element took the focus');
  assert.deepEqual(scrolls, [[0, 0]]);
  assert.equal(window.__ui, now.ui);
  assert.deepEqual(before.ui.log.slice(-1)[0][0], 'route.hydrate');
});

test('a button reaches the same swap through route.go, and a page that was imported before is found again without a second import', async () => {
  const before = currentPage();
  click(byDataId('back')); // soft link to "/", whose entry was started first and is registered
  await until(() => currentPage().ui !== before.ui, 'the page to be replaced');
  assert.equal(currentPage().entry.path, '/');
  assert.deepEqual(head.childNodes.filter((node) => node.localName === 'meta' || node.localName === 'script'), [], 'a page without a description or script leaves none of the previous page\'s');
  assert.deepEqual(imported.slice(-1), ['http://localhost/assets/a.js'], 'the entry is asked for; a module that was loaded is not evaluated again by a real import()');
  assert.equal(window.__ui, currentPage().ui);
  const onA = currentPage();
  fireEvent(byDataId('go-b'), 'click'); // a button of the page: its app dispatches route.go
  await until(() => currentPage().ui !== onA.ui, 'route.go to be followed');
  assert.equal(currentPage().entry.path, '/b');
  assert.equal(location.pathname, '/b');
  assert.equal(assigned.length, 0, 'no hard load happened');
  assert.deepEqual(history.slice(-2), ['/', '/b']);
});

test('what a load would not do, a soft link does not do: modifier keys, other buttons, another origin, target, a place on this page and a plain link are left to the browser', async () => {
  const before = currentPage();
  await until(() => byDataId('same-page'), 'the page');
  for (const [id, extra] of [['to-home', { ctrlKey: true }], ['to-home', { metaKey: true }], ['to-home', { shiftKey: true }], ['to-home', { altKey: true }], ['to-home', { button: 1 }], ['to-home', { defaultPrevented: true }]]) {
    const event = click(byDataId(id), extra);
    assert.equal(event.defaultPrevented, extra.defaultPrevented ?? false, `${id} ${JSON.stringify(extra)} is left alone`);
  }
  const onA = async () => { const ui = currentPage().ui; click(byDataId('to-home')); await until(() => currentPage().ui !== ui, 'A'); };
  await onA();
  for (const id of ['external', 'new-tab', 'plain']) assert.equal(click(byDataId(id)).defaultPrevented, false, id);
  assert.equal(fetched.filter((url) => url === 'https://example.com/').length, 0);
  click(byDataId('to-b')); await until(() => currentPage().entry.path === '/b', 'B');
  assert.equal(click(byDataId('same-page')).defaultPrevented, false, 'a hash link to this very page: the browser scrolls');
  assert.equal(before.shellApp, currentPage().shellApp);
});

// ---------------------------------------------------------------------------------------------------- when it is not a plain page

const stays = async (id, reasonPattern) => {
  const before = currentPage();
  const assignedBefore = assigned.length;
  const warningsBefore = warnings.length;
  click(byDataId(id));
  await until(() => assigned.length > assignedBefore, `the normal page load of ${id}`);
  assert.equal(assigned.at(-1), { 'to-missing': '/missing', 'to-gone': '/gone', 'to-c': '/c', 'to-slow': '/slow' }[id]);
  assert.match(warnings[warningsBefore], reasonPattern);
  assert.equal(currentPage().ui, before.ui, 'the page that was showing is untouched until the load replaces it');
  assert.equal(before.ui.destroyed, false);
};

test('an answer that is not 200, a redirect, a page of another shell, a failed fetch and a page script that does not load all end in a normal page load, with the reason', async () => {
  click(byDataId('back')); await until(() => currentPage().entry.path === '/', 'A');
  await stays('to-missing', /soft navigation to \/missing: the answer is 404, not a plain page\. Loading it as a normal page/);
  await stays('to-gone', /the answer is a redirect/);
  await stays('to-c', /that page has no shell, and this one has "main"/);
  documents['/c'] = documentOf({ stylesheets: [] }); // no script in the document
  await stays('to-c', /the document names no page script/);
  answer = async (url) => (url === '/c' ? htmlResponse('<p>text</p>', { headers: { get: () => 'application/json' } }) : answer(url));
  await stays('to-c', /the answer is not HTML/);
  answer = async () => { throw new Error('network down'); };
  await stays('to-c', /network down/);
  assert.equal(location.pathname, '/', 'the address never moved for a page that was not shown');
});

test('a newer navigation wins: the answer to an older one that arrives late is dropped', async () => {
  const slow = deferred();
  answer = async (url) => (url === '/slow' ? slow : url in documents ? htmlResponse(documents[url]) : htmlResponse('', { ok: false, status: 404 }));
  documents['/b'] = documentOf({ entry: '/assets/b.js', state: { cart: { lines: [{ id: 1, quantity: 7 }] } }, stylesheets: ['/assets/shared.css', '/assets/b.css'] });
  const before = currentPage();
  click(byDataId('to-slow'));
  click(byDataId('to-b'));
  await until(() => currentPage().ui !== before.ui, 'B');
  slow.resolve(htmlResponse(documentOf({ entry: '/assets/c.js' })));
  await sleep(20);
  assert.equal(currentPage().entry.path, '/b');
  assert.equal(location.pathname, '/b');
});

test('navigate refuses an unsafe URL, sends another origin to a normal page load without fetching it, and a soft link without href is left alone', async () => {
  const { shellApp } = currentPage();
  const [loadsBefore, fetchedBefore] = [assigned.length, fetched.length];
  const errors = [];
  const originalError = console.error;
  console.error = (message) => errors.push(message);
  try {
    await shellApp.navigate('javascript:alert(1)');
    await shellApp.navigate('https://example.com/about');
  } finally {
    console.error = originalError;
  }
  assert.equal(errors.length, 1);
  assert.ok(warnings.some((message) => /soft navigation to https:\/\/example\.com\/about: it is another origin/.test(message)), 'the other origin is a normal load, with the reason');
  assert.equal(await shellApp.navigate('http://'), undefined, 'a URL that cannot be parsed ends in a message, not an unhandled rejection');
  assert.match(errors[0], /soft navigation to javascript:alert\(1\): an unsafe URL is not loaded/);
  assert.deepEqual(assigned.slice(loadsBefore), ['https://example.com/about'], 'only the safe external address is loaded, by the browser');
  assert.equal(fetched.length, fetchedBefore, 'the local site is not asked for a page of another origin');
  const hrefless = new ShimElement('a');
  hrefless.setAttribute('data-soft', '');
  body.append(hrefless);
  assert.equal(click(hrefless).defaultPrevented, false);
  assert.equal(fetched.length, fetchedBefore);
});

// ---------------------------------------------------------------------------------------------------- back and forward

test('back does the same swap for the address the browser returns to, without adding a history entry', async () => {
  const pushed = history.length;
  setLocation('/'); // the browser moved back
  const before = currentPage();
  for (const listener of [...listeners.popstate]) listener({ type: 'popstate' });
  await until(() => currentPage().ui !== before.ui, 'the page for "/"');
  assert.equal(currentPage().entry.path, '/');
  assert.equal(history.length, pushed, 'popstate does not push');
  for (const listener of [...listeners.popstate]) listener({ type: 'popstate' }); // the same address again (a hash change): nothing to do
  await sleep(10);
  assert.equal(currentPage().ui.destroyed, false);
});

test('destroying the shell removes the listeners of the navigation plugin, and a navigation still waiting changes nothing when it ends', async () => {
  const { shellApp } = currentPage();
  const [clicks, pops] = [listeners.click.length, listeners.popstate.length];
  const late = deferred();
  answer = async (url) => (url === '/slow' ? late : htmlResponse(documents[url]));
  const before = currentPage();
  const loadsBefore = assigned.length;
  click(byDataId('to-slow'));
  await sleep(5);
  shellApp.destroy();
  assert.equal(listeners.click.length, clicks - 1);
  assert.equal(listeners.popstate.length, pops - 1);
  late.resolve(htmlResponse(documentOf({ entry: '/assets/c.js' })));
  await sleep(20);
  assert.equal(currentPage().entry, before.entry, 'the page that was showing is not replaced');
  assert.equal(currentPage().ui, before.ui);
  assert.equal(assigned.length, loadsBefore, 'and it does not turn into a page load either');
});
