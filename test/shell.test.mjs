// Shells (src/shell.js): the part of a document that stays while the page changes. Definition and its messages, the pairing of a
// shell's behavior (page.js) with its content (view.js), what the shell reads from the page, and rendering a page inside its shell on the server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow, findByTag } from './support/dom-shim.mjs';
import { flushAsync } from './support/helpers.mjs';

const { defineShell } = await import('../src/shell.js');
const { definePage } = await import('../src/pages.js');
const { pageSlot, main, header, footer, a, p, span, state, when, each, li, ul, div } = await import('../src/spec.js');
const { destroyApps, renderPage } = await import('../server/render-page.js');
const { injectMarkup, renderDocument } = await import('../server/document.mjs');

const expectError = (action, pattern) => assert.throws(action, (error) => pattern.test(error.message), String(pattern));

const frame = { state: { cartCount: 0 }, actions: { setCartCount: { args: { count: 'number' }, run: (store, { count }) => store.set('cartCount', count) } } };
const makeShell = (extra = {}) => defineShell({ name: 'main', namespaces: { frame }, reads: [{ watch: ['cart.count'], action: 'frame.setCartCount', args: { count: 'cart.count' } }], ...extra });
const shellView = () => ({ name: 'main', view: main({ id: 'frame-root' }, header({ id: 'frame-header' }, a({ id: 'home', href: '/' }, 'Home'), span({ id: 'badge' }, 'Cart ', state('frame.cartCount'), ' on ', state('route.path'))), pageSlot(), footer({ id: 'frame-footer' }, 'Footer')) });

const cart = { state: { lines: [{ id: 1, quantity: 2 }, { id: 2, quantity: 3 }] }, derive: { count: (get) => get('lines').reduce((sum, line) => sum + line.quantity, 0) }, actions: { empty: { args: {}, run: (store) => store.set('lines', []) } } };
const pageView = { tag: 'section', id: 'page-view', children: { state: 'cart.count' } };
const define = (shellOverride, pageExtra = {}, content = { view: pageView, shell: shellView() }) =>
  definePage({ head: { title: 'A page' }, namespaces: { cart }, shell: shellOverride, ...pageExtra }, { path: '/', ...content });

// ---------------------------------------------------------------------------------------------------- defineShell

test('defineShell refuses what it cannot use, naming the key and the fix', () => {
  expectError(() => defineShell(null), /defineShell: the argument must be an object\. Write defineShell\(\{ name: 'main'/);
  expectError(() => defineShell({ name: 'main', plugns: [] }), /defineShell: unknown key "plugns"\. Did you mean "plugins"\? Allowed keys: name, namespaces, plugins, reads/);
  expectError(() => defineShell({}), /defineShell: name undefined is not allowed\. Write letters and digits, starting with a lowercase letter/);
  expectError(() => defineShell({ name: 'Main' }), /name "Main" is not allowed/);
  expectError(() => defineShell({ name: 'main', namespaces: { route: { state: {} } } }), /shell "main": namespace "route" is reserved\. The framework owns "route" in a shell \(route\.path/);
  expectError(() => defineShell({ name: 'main', namespaces: { 'a-b': { state: {} } } }), /namespace name "a-b" is not allowed/);
  expectError(() => defineShell({ name: 'main', plugins: [1] }), /shell "main": "plugins" must be a list of functions \(environment\) => plugin\. Write plugins: \[withNavigation\]/);
  expectError(() => defineShell({ name: 'main', reads: {} }), /"reads" must be a list of \{ watch, action, args \}/);
  expectError(() => defineShell({ name: 'main', namespaces: { frame }, reads: [{ wacth: [], action: 'frame.setCartCount', args: {} }] }), /shell "main" reads\[0\]: unknown key "wacth"\. Did you mean "watch"\? Allowed keys: watch, action, args/);
  expectError(() => defineShell({ name: 'main', namespaces: { frame }, reads: [{ watch: ['cart.count'], action: 'frame.setCount', args: {} }] }), /reads\[0\]: action "frame\.setCount" is not an action of the shell\. Actions of the shell: route\.arrive, frame\.setCartCount/);
});

test('the shell app has the framework\'s route namespace with the path of the page, and its own namespaces', async () => {
  const shell = makeShell();
  const { root } = { root: (await import('./support/dom-shim.mjs')).createRoot() };
  const shellApp = shell.createApp({ root, win: createWindow('/product/3'), fetchFunction: null, dev: true }, shellView().view);
  assert.deepEqual(shellApp.state(), { route: { path: '/product/3' }, frame: { cartCount: 0 } });
  shellApp.dispatch('route.arrive', { path: '/checkout' });
  assert.equal(shellApp.state().route.path, '/checkout');
  assert.equal(shell.name, 'main');
});

// ---------------------------------------------------------------------------------------------------- pairing

test('page.js and view.js name the same shell, once, and the page\'s place is one element outside every when and each', () => {
  const shell = makeShell();
  assert.equal(define(shell).createShell !== undefined, true);
  assert.equal(define(shell).shellName, 'main');
  assert.equal(define(undefined, {}, { view: pageView }).createShell, undefined, 'a page without a shell has none');
  expectError(() => define(shell, {}, { view: pageView }), /page "\/": page\.js names the shell "main", but view\.js exports no shell\. Add `export const shell = shellView` to view\.js/);
  expectError(() => define(undefined, {}, { view: pageView, shell: shellView() }), /view\.js exports a shell, but page\.js has none\. Add `shell`/);
  expectError(() => define({ name: 'main' }), /"shell" must come from defineShell/);
  expectError(() => define(shell, {}, { view: pageView, shell: { name: 'other', view: shellView().view } }), /page\.js uses the shell "main", view\.js the content of "other"\. Both must name the same shell/);
  expectError(() => define(shell, {}, { view: pageView, shell: { name: 'main' } }), /the shell exported by view\.js must be \{ name, view \}/);
  expectError(() => define(shell, {}, { view: pageView, shell: { name: 'main', view: div({ id: 'x' }, 'no place for the page') } }), /the view of shell "main" has 0 places for the page \(an element with the HTML id "app"\)\. Write pageSlot\(\)/);
  expectError(() => define(shell, {}, { view: pageView, shell: { name: 'main', view: div(null, pageSlot(), pageSlot()) } }), /has 2 places for the page/);
  expectError(() => define(shell, {}, { view: pageView, shell: { name: 'main', view: div(null, when(state('frame.cartCount'), pageSlot())) } }), /the page's place in shell "main" is inside a when or an each\. The page stays in one place while the shell lives/);
  expectError(() => define(shell, {}, { view: pageView, shell: { name: 'main', view: div(null, each('frame.items', 'id', li(null, pageSlot()))) } }), /inside a when or an each/);
});

// ---------------------------------------------------------------------------------------------------- the shell reads the page

test('what the shell reads from the page is sent at once and follows the page, and stops when the page app is destroyed', async () => {
  const shell = makeShell();
  const definition = define(shell);
  const environment = { win: createWindow('/'), fetchFunction: async () => null, dev: true };
  const { createRoot } = await import('./support/dom-shim.mjs');
  const shellRoot = createRoot();
  const shellApp = definition.createShell({ dev: true, ...environment, root: shellRoot });
  const slot = findByTag(shellRoot, 'div')[0];
  const pageApp = definition.create({ dev: true, ...environment, root: slot, shell: shellApp });
  await flushAsync(pageApp);
  assert.equal(shellApp.state().frame.cartCount, 5, 'the first value is sent when the page starts');
  pageApp.dispatch('cart.empty', {});
  await flushAsync(pageApp);
  assert.equal(shellApp.state().frame.cartCount, 0);
  pageApp.destroy();
  assert.equal(slot.childNodes.length, 0);
  assert.equal(shellApp.destroyed, false, 'the shell outlives the page');
  assert.equal(findByTag(shellRoot, 'header').length, 1);
  const after = definition.create({ dev: true, ...environment, root: slot, shell: shellApp });
  await flushAsync(after);
  assert.equal(shellApp.state().frame.cartCount, 5, 'the next page starts reading again');
});

test('a page that lacks a key the shell reads fails when it starts, naming the shell, the read and the fix', async () => {
  const { createRoot } = await import('./support/dom-shim.mjs');
  const definition = definePage({ head: { title: 'x' }, shell: makeShell() }, { path: '/', view: { tag: 'section', id: 'plain', children: 'no cart here' }, shell: shellView() });
  const environment = { win: createWindow('/'), fetchFunction: async () => null, dev: false };
  const shellRoot = createRoot();
  const shellApp = definition.createShell({ dev: true, ...environment, root: shellRoot });
  expectError(
    () => definition.create({ dev: true, ...environment, root: findByTag(shellRoot, 'div')[0], shell: shellApp }),
    /shell "main" reads\[0\]: watch key "cart\.count" is not a state key or derived value of the "from" app\. Keys: route\.params.*The page must have every key the shell reads: list its namespace in the page's namespaces/,
  );
});

test('when one read cannot be made, the ones already started are stopped, the page app is not left mounted, and a dispatch-time failure is not blamed on a missing key', async () => {
  const { createRoot } = await import('./support/dom-shim.mjs');
  const environment = { win: createWindow('/'), fetchFunction: async () => null, dev: true };
  const start = (reads, namespaces = { frame }) => {
    const shell = defineShell({ name: 'main', namespaces, reads });
    const definition = define(shell);
    const shellRoot = createRoot();
    const shellApp = definition.createShell({ dev: true, ...environment, root: shellRoot });
    const slot = findByTag(shellRoot, 'div')[0];
    return { shellApp, slot, create: () => definition.create({ dev: true, ...environment, root: slot, shell: shellApp }) };
  };
  const good = { watch: ['cart.count'], action: 'frame.setCartCount', args: { count: 'cart.count' } };
  const missing = { watch: ['cart.nope'], action: 'frame.setCartCount', args: { count: 'cart.nope' } };
  const { shellApp, slot, create } = start([good, missing]);
  expectError(create, /shell "main" reads\[1\]: watch key "cart\.nope" is not a state key.*The page must have every key the shell reads/);
  assert.equal(slot.childNodes.length, 0, 'the page app that could not be read was destroyed');
  const before = shellApp.state().frame.cartCount;
  assert.equal(before, 5, 'the first read had started before the second failed');

  // A failure that is not about a key: the action refuses the value when it is sent.
  const strict = { state: { cartCount: 0 }, actions: { setCartCount: { args: { count: 'number' }, run: () => { throw new Error('refused'); } } } };
  const failing = start([good], { frame: strict });
  expectError(failing.create, /shell "main" reads\[0\]: cart\.count -> frame\.setCartCount: frame\.setCartCount: refused$/);
});

test('the first page of a document: the shell is started through the window it is given, window.__shell goes when the shell is destroyed, and a shell that cannot be made leaves the page\'s element where it was', async () => {
  const { ShimElement, shimDocument } = await import('./support/dom-shim.mjs');
  const body = new ShimElement('body');
  shimDocument.getElementById = (id) => (body.attributes.id === id ? body : body.findById(id));
  const win = { ...createWindow('/'), document: shimDocument };
  const slot = new ShimElement('div');
  slot.attributes.id = 'app';
  body.append(slot);
  const definition = define(makeShell());
  const shell = makeShell();
  const running = shell.start(definition, { root: slot, win, fetchFunction: async () => null, dev: true });
  assert.equal(win.__shell, running.shellApp);
  assert.equal(running.slot, slot);
  running.shellApp.destroy();
  assert.equal('__shell' in win, false, 'the shell\'s global is removed with the shell');

  const broken = { ...definition, createShell: () => { throw new Error('the shell cannot start'); } };
  const body2 = new ShimElement('body');
  const slot2 = new ShimElement('div');
  slot2.attributes.id = 'app';
  body2.append(slot2);
  shimDocument.getElementById = (id) => (body2.attributes.id === id ? body2 : body2.findById(id));
  expectError(() => shell.start(broken, { root: slot2, win: { ...win, document: shimDocument }, fetchFunction: async () => null, dev: true }), /the shell cannot start/);
  assert.equal(slot2.parentNode, body2, 'the page\'s element is back where it was');
  assert.deepEqual(body2.childNodes, [slot2], 'the shell\'s root that was made for the failed shell is not left beside it');
});

test('a page that cannot start inside a shell this call made stops that shell and puts the page\'s element back', async () => {
  const { ShimElement, shimDocument } = await import('./support/dom-shim.mjs');
  const body = new ShimElement('body');
  shimDocument.getElementById = (id) => (body.attributes.id === id ? body : body.findById(id));
  const win = { ...createWindow('/'), document: shimDocument };
  const slot = new ShimElement('div');
  slot.attributes.id = 'app';
  body.append(slot);
  const definition = define(makeShell());
  const shell = makeShell();
  const broken = { ...definition, mount: () => { throw new Error('the page cannot start'); } };
  expectError(() => shell.start(broken, { root: slot, win, fetchFunction: async () => null, dev: true }), /the page cannot start/);
  assert.equal('__shell' in win, false, 'the shell that was made is stopped, not left running');
  assert.equal(slot.parentNode, body, 'the page\'s element is back where it was');
  assert.deepEqual(body.childNodes, [slot], 'and the root of the shell is gone');
});

test('a page that cannot start inside the shell the server wrote stays in the shell\'s slot, and the shell stays', async () => {
  const { ShimElement, shimDocument } = await import('./support/dom-shim.mjs');
  const body = new ShimElement('body');
  shimDocument.getElementById = (id) => (body.attributes.id === id ? body : body.findById(id));
  const win = { ...createWindow('/'), document: shimDocument };
  const shellRoot = new ShimElement('div');
  shellRoot.attributes.id = 'shell';
  const frame = new ShimElement('main');
  const slot = new ShimElement('div');
  slot.attributes.id = 'app';
  frame.append(slot);
  shellRoot.append(frame);
  body.append(shellRoot);
  const definition = define(makeShell());
  const broken = { ...definition, mount: () => { throw new Error('the page cannot start'); } };
  expectError(() => makeShell().start(broken, { root: slot, win, fetchFunction: async () => null, dev: true }), /the page cannot start/);
  assert.equal(slot.parentNode.localName, 'main', 'the page\'s element is where the shell\'s slot was, inside the shell\'s markup');
  assert.deepEqual(shellRoot.childNodes.map((node) => node.localName), ['main'], 'and nothing was put beside the shell');
});

// ---------------------------------------------------------------------------------------------------- the server

test('the server renders the shell with the page inside it, from the page\'s state, and the document mounts at the shell', async () => {
  const definition = define(makeShell());
  const result = await renderPage(definition.create, { dev: false, url: '/product/3', createShell: definition.createShell });
  assert.equal(result.shell, true);
  assert.match(result.html, /<main data-id="frame-root"><header data-id="frame-header">.*<span data-id="badge">Cart 5 on \/product\/3<\/span>.*<div data-id="page-slot" id="app"><section data-id="page-view">5<\/section><\/div><footer data-id="frame-footer">Footer<\/footer><\/main>/);
  assert.deepEqual(result.state.cart.lines.length, 2, 'the state carried to the browser is the page\'s');
  const template = '<body>\n<div id="app"></div>\n<script type="module" src="/assets/index.js"></script>\n</body>';
  const document = renderDocument(template, result);
  assert.match(document, /<div id="shell"><!--ssr:start--><main data-id="frame-root">/);
  assert.equal(document.includes('<div id="app"></div>'), false, 'the template\'s own mount point was replaced by the shell\'s');
  assert.ok(document.indexOf('id="agent-ui-state"') < document.indexOf('type="module"'));
  // Idempotent, and a page that has no shell goes back to the plain mount point.
  assert.equal(renderDocument(document, result), document);
  const plain = await renderPage(define(undefined, {}, { view: pageView }).create, { dev: false, url: '/' });
  assert.match(renderDocument(document, plain), /<div id="app"><!--ssr:start--><section data-id="page-view">/);
});

test('injectMarkup keeps the template\'s own spelling of the mount point when it fits', () => {
  assert.ok(injectMarkup('<body><div id=app></div><script type="module" src="a.js"></script></body>', { html: 'x', stateScript: '' }).includes('<div id=app><!--ssr:start-->x'));
  assert.ok(injectMarkup('<body><div id=app></div><script type="module" src="a.js"></script></body>', { html: 'x', stateScript: '', shell: true }).includes('<div id="shell"><!--ssr:start-->x'));
});

test('renderPage says what is missing when the shell has no place for the page', async () => {
  const definition = define(makeShell());
  const { app } = await import('../src/ui.js');
  await assert.rejects(
    renderPage(definition.create, { dev: false, url: '/', createShell: ({ root }) => app({ dev: true, namespaces: {}, spec: p(null, 'no slot'), root }) }),
    /renderPage: the shell's markup has no element with the id "app" for the page\. Put pageSlot\(\)/,
  );
});

// ---------------------------------------------------------------------------------------------------- route.go

test('route.go exists on a page with a shell: the shell\'s navigate when it has one, a normal page load when it has none, and nothing during a replay', async () => {
  const { createRoot } = await import('./support/dom-shim.mjs');
  const assigned = [];
  const win = { ...createWindow('/'), location: { pathname: '/', search: '', hash: '', assign: (href) => assigned.push(href) } };
  const definition = define(makeShell());
  const start = async () => {
    const shellRoot = createRoot();
    const shellApp = definition.createShell({ win, fetchFunction: null, dev: true, root: shellRoot });
    const page = definition.create({ root: findByTag(shellRoot, 'div')[0], win, fetchFunction: async () => null, dev: true, shell: shellApp });
    return { shellApp, page };
  };

  const { page: withoutNavigation } = await start(); // the shell lists no navigation plugin: it has no `navigate`
  assert.equal(withoutNavigation.dispatch('route.go', { href: '/about' }), undefined);
  await withoutNavigation.settle();
  assert.deepEqual(assigned, ['/about']);
  withoutNavigation.dispatch('route.go', { href: '/about' });
  await withoutNavigation.settle();
  assert.deepEqual(assigned, ['/about', '/about'], 'a second request for the same place is a change too (the count)');
  assert.deepEqual(withoutNavigation.state().route.destination, { href: '/about', count: 2 });
  await withoutNavigation.replay(); // quiet while replaying: nothing is navigated by a replay
  assert.equal(assigned.length, 2);

  const { shellApp, page } = await start();
  const navigated = [];
  shellApp.navigate = (href) => navigated.push(href); // what src/navigation.js adds
  page.dispatch('route.go', { href: '/checkout' });
  await page.settle();
  assert.deepEqual(navigated, ['/checkout']);
  assert.equal(assigned.length, 2, 'with a shell that navigates, nothing is a hard load');
  assert.match(page.dispatch('route.go', {}) ?? '', /route\.go/);

  const plain = define(undefined, {}, { view: pageView }).create({ root: createRoot(), win, fetchFunction: async () => null, dev: true });
  assert.match(plain.dispatch('route.go', { href: '/x' }) ?? '', /unknown action route\.go/);
  assert.deepEqual(plain.state().route, { params: {}, hydrated: false }, 'a page without a shell has the route namespace it always had');
});

test('renderPage ends the shell and the page it started when it throws, and hands both back when it does not', async () => {
  const ended = [];
  const counting = (name) => () => (api) => api.onDestroy(() => ended.push(name));
  const shell = makeShell({ plugins: [counting('shell')] });
  const failing = define(shell, { plugins: [counting('page'), () => () => { throw new Error('page plugin failed'); }] });
  await assert.rejects(renderPage(failing.create, { dev: false, url: '/', createShell: failing.createShell }), /page plugin failed/);
  assert.deepEqual(ended.sort(), ['page', 'shell'], 'both are ended, once each (the page ends itself when it fails to start)');
  ended.length = 0;
  const fine = define(shell, { plugins: [counting('page')] });
  const result = await renderPage(fine.create, { dev: false, url: '/', createShell: fine.createShell });
  assert.deepEqual(ended, [], 'a finished render is handed back running: the caller ends it');
  result.ui.destroy();
  result.shellApp.destroy();
  assert.deepEqual(ended.sort(), ['page', 'shell']);
});

test('destroyApps ends the shell even when the page\'s cleanup throws, and the error is not lost', async () => {
  const ended = [];
  const shell = makeShell({ plugins: [() => (api) => api.onDestroy(() => ended.push('shell'))] });
  const broken = define(shell, { plugins: [() => (api) => api.onDestroy(() => { throw new Error('page cleanup failed'); })] });
  const result = await renderPage(broken.create, { dev: false, url: '/', createShell: broken.createShell });
  assert.throws(() => destroyApps(result.ui, result.shellApp), /page cleanup failed/);
  assert.deepEqual(ended, ['shell']);
});
