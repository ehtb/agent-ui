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
const { navigation, readDocument, fetchPlainDocument } = await import('../src/navigation.js');
const { prefetch } = await import('../src/prefetch.js');
const { viewTransition } = await import('../src/view-transition.js');
const { a, button, div, footer, header, input, main, p, pageSlot, section, span, state, act } = await import('../src/spec.js');

// ---------------------------------------------------------------------------------------------------- a fake browser

const listeners = { click: [], popstate: [], pagehide: [], pageshow: [], pointerover: [] };
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
  // One entry's state at a time: a test that goes back sets the state of the entry it returns to.
  history: {
    state: null,
    scrollRestoration: 'auto',
    pushState(state, title, href) {
      history.push(href);
      this.state = state;
      setLocation(href);
    },
    replaceState(state) {
      this.state = state;
    },
  },
  scrollX: 0,
  scrollY: 0,
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
const clock = { offset: 0 }; // what a test adds to the time withPrefetch reads, to age a document
const shell = defineShell({
  name: 'main',
  namespaces: { frame },
  plugins: [
    ({ win, fetchFunction, shellName }) => navigation({ win, fetchFunction, shellName, importModule: async (url) => (imported.push(url), moduleFor[url]?.()), loadStylesheet: async (href) => addStylesheet(href) }),
    ({ win, fetchFunction }) => prefetch({ win, fetchFunction, now: () => Date.now() + clock.offset }),
    ({ win }) => viewTransition({ win }),
  ],
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
  window.history.state = null; // an entry the plugin never saw has no position: the window goes to the top
  const before = currentPage();
  for (const listener of [...listeners.popstate]) listener({ type: 'popstate' });
  await until(() => currentPage().ui !== before.ui, 'the page for "/"');
  assert.equal(currentPage().entry.path, '/');
  assert.equal(history.length, pushed, 'popstate does not push');
  for (const listener of [...listeners.popstate]) listener({ type: 'popstate' }); // the same address again (a hash change): nothing to do
  await sleep(10);
  assert.equal(currentPage().ui.destroyed, false);
});

test('back and forward return to where the visitor was on that entry; a new entry starts at the top', async () => {
  assert.equal(window.history.scrollRestoration, 'manual', 'the browser does not scroll before the new page exists');
  answer = async (url) => htmlResponse(documents[url]);
  // On "/" the visitor scrolled to 300, then followed a link: the new entry starts at the top.
  const firstEntry = window.history.state;
  assert.ok(firstEntry.agentUiEntry, 'an entry the plugin arrived on without a key was given one');
  window.scrollY = 300;
  const start = currentPage();
  click(byDataId('to-b'));
  await until(() => currentPage().ui !== start.ui, 'the page for "/b"');
  assert.deepEqual(scrolls.at(-1), [0, 0]);
  assert.notEqual(window.history.state.agentUiEntry, firstEntry.agentUiEntry, 'the new page has an entry of its own');
  // On "/b" the visitor scrolled to 120 and went back: the window returns to 300.
  const secondEntry = window.history.state;
  window.scrollY = 120;
  const before = currentPage();
  setLocation('/');
  window.history.state = { agentUiEntry: firstEntry.agentUiEntry };
  for (const listener of [...listeners.popstate]) listener({ type: 'popstate' });
  await until(() => currentPage().ui !== before.ui, 'the page for "/"');
  assert.deepEqual(scrolls.at(-1), [0, 300]);
  // Forward again: the window returns to 120 on "/b".
  const back = currentPage();
  setLocation('/b');
  window.history.state = secondEntry;
  for (const listener of [...listeners.popstate]) listener({ type: 'popstate' });
  await until(() => currentPage().ui !== back.ui, 'the page for "/b"');
  assert.deepEqual(scrolls.at(-1), [0, 120]);
  // Leaving the document writes the position into its entry, for a reload or a return from another site.
  window.scrollY = 45;
  for (const listener of [...listeners.pagehide]) listener({ type: 'pagehide' });
  assert.deepEqual(window.history.state.agentUiScroll, { x: 0, y: 45 });
  assert.equal(window.history.state.agentUiEntry, secondEntry.agentUiEntry, 'the entry keeps its key');
  // The back/forward cache brings the document back: the plugin does not start again, pageshow restores the position.
  window.history.state = { ...window.history.state, site: 'kept' };
  for (const listener of [...listeners.pagehide]) listener({ type: 'pagehide' });
  assert.equal(window.history.state.site, 'kept', 'what the site keeps in the entry stays beside the plugin\'s keys');
  window.scrollY = 0;
  for (const listener of [...listeners.pageshow]) listener({ type: 'pageshow', persisted: false });
  const scrollsBefore = scrolls.length;
  for (const listener of [...listeners.pageshow]) listener({ type: 'pageshow', persisted: true });
  assert.deepEqual(scrolls.slice(scrollsBefore), [[0, 45]], 'only a page restored from the cache is scrolled back');
});

// ---- withPrefetch and withViewTransition: the two plugins that make a swap faster, and what each leaves alone ---------------
// The site is running (page A showing): the tests here navigate and always come back to page A, which the destroy test
// below needs, and which stays last. The tests above replaced the answers (the last one serves the documents only),
// so a test that fetches more than those documents puts the whole router back first.
const restoreAnswers = () => {
  answer = async (url) => {
    if (url in documents) return htmlResponse(documents[url]);
    if (url === '/missing') return htmlResponse('not found', { ok: false, status: 404 });
    if (url === '/gone') return htmlResponse('', { redirected: true });
    throw new Error(`unexpected request ${url}`);
  };
};

const hover = (target, extra = {}) => {
  const event = { type: 'pointerover', target, pointerType: 'mouse', ...extra };
  for (const listener of [...listeners.pointerover]) listener(event);
};
const fetchedCount = (url) => fetched.filter((fetchedUrl) => fetchedUrl === url).length;
// The tests before this one leave the site wherever they ended (the last one on "/b"): the tests here start from page A.
const goHome = async () => {
  if (!byDataId('back')) return;
  const before = currentPage();
  click(byDataId('back'));
  await until(() => currentPage().ui !== before.ui, 'the page to come home');
};

test('a hover prefetches the document of a soft link, and the click uses it without fetching again', async () => {
  await goHome();
  const fetchedBefore = fetchedCount('/b');
  const before = currentPage();
  hover(byDataId('to-b'));
  await until(() => fetchedCount('/b') === fetchedBefore + 1, 'the hover to fetch /b');
  click(byDataId('to-b'));
  await until(() => currentPage().ui !== before.ui, 'the page to be replaced');
  assert.equal(fetchedCount('/b'), fetchedBefore + 1, 'the click did not fetch what the hover brought');
  const onB = currentPage();
  click(byDataId('back'));
  await until(() => currentPage().ui !== onB.ui, 'the page to come back');
});

test('a failed prefetch is dropped, so the click fetches and falls back as it would without one', async () => {
  restoreAnswers();
  await goHome();
  hover(byDataId('to-missing')); // '/missing' answers 404: the prefetch resolves to nothing and is dropped
  await until(() => fetchedCount('/missing') >= 1, 'the hover to fetch /missing');
  const loadsBefore = assigned.length;
  click(byDataId('to-missing'));
  await until(() => assigned.length > loadsBefore, 'the page load');
  assert.match(warnings.at(-1), /the answer is 404/);
  const fetchedBefore = fetchedCount('/missing');
  hover(byDataId('to-missing'));
  await until(() => fetchedCount('/missing') === fetchedBefore + 1, 'a later hover to fetch /missing again');
});

test('a hover prefetches nothing for a touch pointer, another origin, a link without soft, or another target', async () => {
  await goHome();
  const before = fetched.length;
  hover(byDataId('external')); // another origin
  hover(byDataId('to-b'), { pointerType: 'touch' }); // a tap is followed by the click
  hover(byDataId('plain')); // a link without soft: the browser loads it
  hover(byDataId('new-tab')); // another target
  await sleep(5);
  assert.equal(fetched.length, before, JSON.stringify(fetched.slice(before)));
});

test('the swap runs as one View Transition where the browser has one, and reduced motion skips it', async () => {
  await goHome();
  const updates = [];
  shimDocument.startViewTransition = (update) => {
    updates.push(update);
    const result = update();
    return { updateCallbackDone: Promise.resolve(result), finished: Promise.resolve(result) };
  };
  const media = { reduced: false };
  window.matchMedia = (query) => ({ matches: media.reduced && query.includes('reduce'), media: query });
  try {
    hover(byDataId('to-b'));
    await until(() => fetchedCount('/b') >= 1, 'the hover');
    const before = currentPage();
    click(byDataId('to-b'));
    await until(() => currentPage().ui !== before.ui, 'the page to be replaced');
    assert.equal(updates.length, 1, 'the swap ran inside one transition');
    assert.equal(before.ui.destroyed, true, 'and the update did what the swap does');

    media.reduced = true;
    const onB = currentPage();
    click(byDataId('back'));
    await until(() => currentPage().ui !== onB.ui, 'the page to be replaced');
    assert.equal(updates.length, 1, 'reduced motion: no transition, the swap ran directly');
    assert.equal(currentPage().entry, before.entry, 'and back home again for the tests that follow');
  } finally {
    delete shimDocument.startViewTransition;
    delete window.matchMedia;
  }
});

test('an update that throws inside a View Transition ends in a page load, with the reason', async () => {
  await goHome();
  shimDocument.startViewTransition = (update) => {
    update();
    throw new Error('the transition broke');
  };
  window.matchMedia = () => ({ matches: false });
  try {
    const loadsBefore = assigned.length;
    click(byDataId('to-b'));
    await until(() => assigned.length > loadsBefore, 'the page load');
    assert.match(warnings.at(-1), /the transition broke/);
  } finally {
    delete shimDocument.startViewTransition;
    delete window.matchMedia;
  }
});

test('a hover whose fetch fails or is cancelled is silent, and the click fetches again and says why', async () => {
  const rejections = [];
  const onUnhandled = (reason) => rejections.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    await goHome();
    answer = async (url) => {
      if (url === '/slow') throw new Error('network down');
      return htmlResponse(documents[url]);
    };
    hover(byDataId('to-slow')); // the fetch of the hover throws: the prefetch resolves to nothing and is dropped
    await sleep(10);
    assert.deepEqual(rejections, [], 'the failed hover is not an unhandled rejection');
    const loadsBefore = assigned.length;
    click(byDataId('to-slow')); // the click fetches again, and the failure it meets is the one it reports
    await until(() => assigned.length > loadsBefore, 'the page load');
    assert.match(warnings.at(-1), /network down/);
  } finally {
    process.off('unhandledRejection', onUnhandled);
    restoreAnswers();
  }
});

test('a document older than a few seconds is not used: the click fetches what a load would show now, and a hover after that fetches again', async () => {
  restoreAnswers();
  await goHome();
  try {
    const fetchedBefore = fetchedCount('/b');
    hover(byDataId('to-b'));
    await until(() => fetchedCount('/b') === fetchedBefore + 1, 'the hover to fetch /b');
    clock.offset = 6000; // the visitor took longer than the document stays fresh
    const before = currentPage();
    click(byDataId('to-b'));
    await until(() => currentPage().ui !== before.ui, 'the page to be replaced');
    assert.equal(fetchedCount('/b'), fetchedBefore + 2, 'the stale document was not used');
    const onB = currentPage();
    click(byDataId('back'));
    await until(() => currentPage().ui !== onB.ui, 'the page to come back');

    clock.offset = 0;
    hover(byDataId('to-b'));
    await until(() => fetchedCount('/b') === fetchedBefore + 3, 'a hover to fetch /b');
    clock.offset = 6000;
    hover(byDataId('to-b')); // the one in hand is stale: this hover replaces it
    await until(() => fetchedCount('/b') === fetchedBefore + 4, 'a hover after it went stale to fetch again');
    clock.offset = 0;
    const home = currentPage();
    click(byDataId('to-b')); // the newest hover is fresh again at this clock: taken, not fetched
    await until(() => currentPage().ui !== home.ui, 'the page to be replaced');
    assert.equal(fetchedCount('/b'), fetchedBefore + 4);
    click(byDataId('back'));
    await until(() => currentPage().ui !== home.ui && byDataId('to-b') !== undefined, 'the page to come back');
  } finally {
    clock.offset = 0;
  }
});

test('the document a hover brought also gets its entry file hinted to the browser, once', async () => {
  restoreAnswers();
  await goHome();
  const savedC = documents['/c'];
  documents['/c'] = documentOf({ entry: '/assets/c.js', stylesheets: ['/assets/shared.css'] }); // an earlier test left /c without a page script
  const hints = () => head.childNodes.filter((node) => node.localName === 'link' && node.getAttribute('rel') === 'modulepreload').map((node) => node.getAttribute('href'));
  const hintsOfC = () => hints().filter((href) => href === 'http://localhost/assets/c.js');
  assert.equal(hintsOfC().length, 0, 'the entry of /c is not hinted before a hover');
  hover(byDataId('to-c'));
  await until(() => hintsOfC().length === 1, 'the entry of /c to be hinted');
  clock.offset = 6000; // stale: the next hover fetches again, and the entry is not hinted twice
  const fetchedBefore = fetchedCount('/c');
  hover(byDataId('to-c'));
  await until(() => fetchedCount('/c') === fetchedBefore + 1, 'the second hover to fetch');
  await sleep(5);
  clock.offset = 0;
  documents['/c'] = savedC;
  assert.equal(hintsOfC().length, 1);
});

test('a second navigation wins while the first waits to be shown: the stale update swaps nothing in', async () => {
  restoreAnswers();
  await goHome();
  const queued = [];
  shimDocument.startViewTransition = (update) => {
    queued.push(update);
    return { updateCallbackDone: Promise.resolve() };
  };
  window.matchMedia = () => ({ matches: false });
  try {
    const before = currentPage();
    const loadsBefore = assigned.length;
    click(byDataId('to-b'));
    await until(() => queued.length === 1, 'the first navigation to ask for its transition');
    click(byDataId('to-home')); // the visitor clicked again before the first was shown: this navigation is the newest
    await until(() => queued.length === 2, 'the second navigation to ask for its transition');
    queued[0](); // the stale update (page B) runs first
    assert.equal(currentPage().ui, before.ui, 'it swapped nothing in: the page that was showing keeps showing');
    queued[1]();
    assert.notEqual(currentPage().ui, before.ui, 'the newest navigation is shown');
    assert.equal(currentPage().entry, before.entry, 'and it is page A, not the stale page B');
    assert.equal(assigned.length, loadsBefore, 'and the stale one did not turn into a page load');
  } finally {
    delete shimDocument.startViewTransition;
    delete window.matchMedia;
  }
});

// A stand-in for the shell's app, for the plugins that are checked on their own: what they register, and what they refuse.
const standInApp = () => {
  const disposers = [];
  return { destroyed: false, dispatch() {}, onDestroy: (dispose) => disposers.push(dispose), destroy: () => disposers.forEach((dispose) => dispose()) };
};
const environment = () => ({ win: window, fetchFunction: window.fetch, shellName: 'main' });

test('the navigation alone listens to no hover and runs the swap directly: prefetch and View Transition are opt-in plugins', async () => {
  const app = standInApp();
  const hoversBefore = listeners.pointerover.length;
  navigation(environment())(app);
  assert.equal(listeners.pointerover.length, hoversBefore, 'a navigation without withPrefetch does not listen to hovers');
  assert.equal(typeof app.navigate, 'function');
  assert.equal(typeof app.softLinkTarget, 'function');
  app.destroy();
});

test('withPrefetch and withViewTransition refuse a shell without a navigation before them, naming the fix', () => {
  for (const [plugin, name] of [[prefetch, 'withPrefetch'], [viewTransition, 'withViewTransition']]) {
    assert.throws(
      () => plugin(environment())(standInApp()),
      new RegExp(`^Error: ${name}: the shell has no navigation to extend\\. List withNavigation before ${name} in the plugins of defineShell: plugins: \\[withNavigation, ${name}\\]$`),
    );
  }
});

test('extendNavigation takes document and swap functions only, and says what is wrong with anything else', () => {
  const app = standInApp();
  navigation(environment())(app);
  assert.throws(() => app.extendNavigation({ swpa: () => {} }), /extendNavigation: unknown key "swpa"\. Allowed keys: document, swap/);
  assert.throws(() => app.extendNavigation({ document: 'yes' }), /extendNavigation: document is string, not a function\. Give document a function, or leave it out/);
  app.destroy();
});

test('softLinkTarget reads a soft link the way the click does: key, hash, and whether it leads to the page showing', () => {
  const app = standInApp();
  navigation(environment())(app);
  const link = (attributes) => {
    const element = new ShimElement('a');
    element.setAttribute('data-soft', '');
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    return element;
  };
  assert.deepEqual(app.softLinkTarget(link({ href: '/b?x=1#top' })), { sitePath: '/b', search: '?x=1', hash: '#top', key: '/b?x=1', here: false });
  assert.equal(app.softLinkTarget(link({ href: window.location.pathname + window.location.search })).here, true);
  assert.equal(app.softLinkTarget(link({ href: 'https://example.com/' })), null);
  assert.equal(app.softLinkTarget(link({ href: '/b', target: '_blank' })), null);
  assert.equal(app.softLinkTarget(link({ href: '/b', download: '' })), null);
  assert.equal(app.softLinkTarget(link({})), null);
  assert.equal(app.softLinkTarget(new ShimElement('a')), null, 'a link not marked soft is the browser\'s');
  app.destroy();
});

test('fetchPlainDocument answers the text of a plain page and the reason for anything else', async () => {
  const plain = await fetchPlainDocument(async () => htmlResponse('<p>x</p>'), '/x');
  assert.deepEqual(plain, { text: '<p>x</p>', key: '/x' });
  assert.deepEqual(await fetchPlainDocument(async () => htmlResponse('', { ok: false, status: 404 }), '/x'), { reason: 'the answer is 404, not a plain page' });
  assert.deepEqual(await fetchPlainDocument(async () => htmlResponse('', { redirected: true }), '/x'), { reason: 'the answer is a redirect, not a plain page' }, 'a host that cannot say where a redirect led gets the reason');
  assert.deepEqual(await fetchPlainDocument(async () => ({ ...htmlResponse('x'), headers: { get: () => 'application/json' } }), '/x'), { reason: 'the answer is not HTML' });
  await assert.rejects(fetchPlainDocument(async () => { throw new Error('offline'); }, '/x'), /offline/);
});

// ---- a redirect of the server ----------------------------------------------------------------------------------------------

// What the browser's fetch answers after following a redirect: the document of the place it ended at, `redirected`, and its URL.
const redirectedTo = (to, text = documents[to.split(/[?#]/)[0]]) => htmlResponse(text, { redirected: true, url: `http://localhost${to}` });

test('fetchPlainDocument follows a redirect to this site, says where it ended, and refuses one that leaves the site or the base path', async () => {
  const options = { origin: 'http://localhost', basePath: '' };
  assert.deepEqual(await fetchPlainDocument(async () => redirectedTo('/b?y=2', '<p>b</p>'), '/old?x=1', options), { text: '<p>b</p>', key: '/b?y=2' });
  assert.deepEqual(await fetchPlainDocument(async () => htmlResponse('<p>x</p>', { redirected: true, url: 'https://example.com/b' }), '/old', options), { reason: 'the answer is a redirect to a place outside this site, not a plain page' });
  assert.deepEqual(await fetchPlainDocument(async () => htmlResponse('<p>x</p>', { redirected: true, url: 'not a url' }), '/old', options), { reason: 'the answer is a redirect to a place outside this site, not a plain page' });
  assert.deepEqual(await fetchPlainDocument(async () => htmlResponse('x', { redirected: true, url: 'http://localhost/gone', ok: false, status: 404 }), '/old', options), { reason: 'the answer is 404, not a plain page (after a redirect to /gone)' });
  // Below a base path the key is the site's own path, and a redirect out of the base leaves the site's pages.
  const below = { origin: 'http://localhost', basePath: '/shop' };
  assert.deepEqual(await fetchPlainDocument(async () => htmlResponse('<p>x</p>', { redirected: true, url: 'http://localhost/shop/b?y=2' }), '/old', below), { text: '<p>x</p>', key: '/b?y=2' });
  assert.deepEqual(await fetchPlainDocument(async () => htmlResponse('<p>x</p>', { redirected: true, url: 'http://localhost/elsewhere' }), '/old', below), { reason: 'the answer is a redirect to a place outside this site, not a plain page' });
});

test('a soft navigation follows a redirect to another page of the site: that page is shown in the shell that stays, at its own address', async () => {
  await goHome();
  const { shellApp } = currentPage();
  const before = currentPage();
  const assignedBefore = assigned.length;
  const historyBefore = history.length;
  answer = async (url) => (url === '/old?x=1' ? redirectedTo('/b?y=2') : url in documents ? htmlResponse(documents[url]) : htmlResponse('', { ok: false, status: 404 }));
  currentPage().ui.dispatch('route.go', { href: '/old?x=1#details' });
  await until(() => currentPage().ui !== before.ui, 'the page the redirect ends at');
  const now = currentPage();
  assert.equal(now.entry.path, '/b', 'the page of the place the redirect ends at');
  assert.equal(now.shellApp, shellApp, 'in the shell that stayed');
  assert.deepEqual(history.slice(historyBefore), ['/b?y=2#details'], 'the address is the place it ended at, and the #hash of the link stays');
  assert.equal(location.pathname, '/b');
  assert.equal(assigned.length, assignedBefore, 'no page load');
  assert.equal(shellApp.state().route.path, '/b', 'the shell was told the path of the page that is showing');
  restoreAnswers();
  await goHome();
});

test('a redirect to a page that has another shell is loaded at the place it ends at, and one that leaves the site is loaded as it was linked', async () => {
  await goHome();
  const { shellApp } = currentPage();
  const warningsBefore = warnings.length;
  documents['/c'] = documentOf({ entry: '/assets/c.js', stylesheets: ['/assets/shared.css'] }); // an earlier test left it without a script
  answer = async (url) => (url === '/old-c' ? redirectedTo('/c') : url === '/old-away' ? htmlResponse('x', { redirected: true, url: 'https://example.com/b' }) : htmlResponse(documents[url]));
  currentPage().ui.dispatch('route.go', { href: '/old-c' });
  await until(() => assigned.at(-1) === '/c', 'the normal page load of the place the redirect ends at');
  assert.match(warnings[warningsBefore], /soft navigation to \/c: that page has no shell, and this one has "main"\. Loading it as a normal page/);
  currentPage().ui.dispatch('route.go', { href: '/old-away' });
  await until(() => assigned.at(-1) === '/old-away', 'the normal page load of the link');
  assert.match(warnings.at(-1), /soft navigation to \/old-away: the answer is a redirect to a place outside this site, not a plain page/);
  assert.equal(location.pathname, '/', 'the address never moved for a page that was not shown');
  restoreAnswers();
});

test('a hover follows the redirect too, and the click takes that document and shows the place it ended at without fetching again', async () => {
  await goHome();
  const before = currentPage();
  const historyBefore = history.length;
  answer = async (url) => (url === '/b?old=1' ? redirectedTo('/b') : htmlResponse(documents[url]));
  const link = byDataId('to-b');
  link.setAttribute('href', '/b?old=1');
  hover(link);
  await until(() => fetchedCount('/b?old=1') === 1, 'the hover to fetch the old address');
  click(link);
  await until(() => currentPage().ui !== before.ui, 'the page the redirect ends at');
  assert.equal(fetchedCount('/b?old=1'), 1, 'the click took the document of the hover');
  assert.deepEqual(history.slice(historyBefore), ['/b'], 'and shows the place it ended at');
  link.setAttribute('href', '/b');
  restoreAnswers();
  await goHome();
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
