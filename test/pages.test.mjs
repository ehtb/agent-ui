// Pages (src/pages.js): definition, the checks and their messages, route params from the URL, ready / pending / status,
// and the static URLs derived from a page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentOf, definePage, pageOf } from '../src/pages.js';
import { validate } from '../src/validate.js';
import { app } from '../src/ui.js';
import { follow, withFollow } from '../src/follow.js';
import { resources } from '../src/resources.js';
import { createRoot, createWindow } from './support/dom-shim.mjs';

const baseView = { tag: 'section', id: 'the-view', children: 'content' };
const basePage = (extra = {}) => ({ head: { title: 'A page' }, ...extra });
// `extra` may carry `view`, `layout` and `pending`, which live in view.js; everything else is page.js.
const define = (extra = {}, path = '/') => {
  const { view = baseView, layout, pending, ...page } = extra;
  return definePage(basePage(page), { path, view, ...(layout !== undefined && { layout }), ...(pending !== undefined && { pending }) });
};
const expectError = (action, pattern) => assert.throws(action, (error) => pattern.test(error.message), String(pattern));
const open = async (definition, url, fetchFunction = async () => null) => {
  const ui = definition.create({ root: createRoot(), win: createWindow(url), fetchFunction, dev: true });
  await ui.settle();
  return ui;
};

test('a page is one app: its namespaces plus the framework\'s "route" namespace; the spec validates', () => {
  const definition = define({ namespaces: { cart: { state: { lines: [] } }, product: { state: { open: false } } } }, '/product/:id');
  assert.deepEqual(Object.keys(definition.namespaces), ['route', 'cart', 'product']);
  assert.deepEqual(definition.namespaces.route.state, { params: {}, hydrated: false });
  assert.deepEqual(validate(definition.spec, { namespaces: definition.namespaces }), []);
});

test('route.params holds the parameters of the URL the page was opened with', async () => {
  const definition = define({}, '/item/:id');
  assert.deepEqual((await open(definition, '/item/abc')).state().route.params, { id: 'abc' });
  assert.deepEqual((await open(definition, '/item/a%20b')).state().route.params, { id: 'a b' });
  assert.deepEqual((await open(definition, '/item/7/')).state().route.params, { id: '7' }); // a trailing slash is the same page
  assert.deepEqual((await open(define({}, '/docs/*path'), '/docs/guides/start')).state().route.params, { path: 'guides/start' });
  assert.deepEqual((await open(define({}, '/about'), '/about')).state().route.params, {});
});

test('the server\'s state is kept, and the URL decides the params', async () => {
  const definition = define({ namespaces: { box: { state: { text: 'default' } } } }, '/item/:id');
  const ui = definition.create({ root: createRoot(), win: createWindow('/item/9'), fetchFunction: async () => null, dev: true, initialState: { box: { text: 'from the server' }, route: { params: { id: 'stale' } } } });
  assert.equal(ui.state().box.text, 'from the server');
  assert.deepEqual(ui.state().route.params, { id: '9' });
});

test('the layout wraps the content; pages that share a layout share its ids', () => {
  const layout = (content) => ({ tag: 'main', id: 'shell', children: [{ tag: 'nav', id: 'shell-nav', children: 'nav' }, content] });
  const definition = define({ layout });
  assert.equal(definition.spec.id, 'shell');
  assert.equal(JSON.stringify(definition.spec).split('"the-view"').length - 1, 1);
  assert.deepEqual(validate(definition.spec, { namespaces: definition.namespaces }), []);
});

test('describePage gives the title and description for the current state', () => {
  const definition = define({ head: { title: (state) => `Item ${state.route.params.id}`, description: 'About the item' } }, '/item/:id');
  const empty = { html: {}, body: {}, tags: [], bodyTags: [] };
  assert.deepEqual(definition.describePage({ route: { params: { id: '7' } } }), { title: 'Item 7', description: 'About the item', ...empty });
  assert.deepEqual(define({ head: { title: 'Home' } }).describePage({ route: { params: {} } }), { title: 'Home', description: '', ...empty });
});

test('mistakes are reported with the page, what is wrong and how to fix it', () => {
  expectError(() => define({ hedd: {} }), /page "\/": unknown key "hedd"\. Did you mean "head"\? Allowed keys: head, namespaces/);
  expectError(() => definePage({ head: { title: 'x' }, view: baseView }, { path: '/' }), /"view" does not belong in page\.js\. Move it to the view\.js/);
  expectError(() => definePage({ namespaces: {} }, { path: '/' }), /page "\/": missing "head"\. Add `head/);
  expectError(() => definePage({ head: { title: 'x' } }, { path: '/' }), /missing "view"\. Export `const view/);
  expectError(() => definePage(basePage(), { path: '/', view: () => ({}) }), /"view" must be a spec, not a function/);
  expectError(() => define({ head: {} }), /head\.title is missing/);
  expectError(() => define({ head: { titel: 'x', title: 'y' } }), /head: unknown key "titel"\. Did you mean "title"\?/);
  expectError(() => definePage(basePage(), { path: '/', view: baseView, layout: 'site' }), /"layout" must be a function \(content\) => spec/);
  expectError(() => define({ namespaces: { route: {} } }), /namespace "route" is reserved\. The framework owns "route" \(route\.params/);
  expectError(() => define({ namespaces: { 'my-cart': {} } }), /namespace name "my-cart" is not allowed\. Names are letters and digits/);
  expectError(() => define({}, 'home'), /definePage: path "home" is not allowed/);
  expectError(() => define({}, '/docs/*path/more'), /path "\/docs\/\*path\/more" is not allowed.*"\*name" as the last segment/);
  expectError(() => definePage(null, { path: '/' }), /a page must be a plain object/);
});

test('ready, pending and status are checked, and pending needs ready', () => {
  expectError(() => define({ ready: true }), /"ready" must be a function \(state\) => boolean/);
  expectError(() => define({ status: 404 }), /"status" must be a function/);
  expectError(() => define({ pending: { tag: 'p', children: 'x' } }), /"pending" is given but "ready" is not\. Add `ready/);
  expectError(() => define({ ready: () => true, pending: () => ({}) }), /"pending" must be a spec \(an element\), not a function/);
  expectError(() => definePage({ head: { title: 'x' }, pending: { tag: 'p' } }, { path: '/', view: baseView }), /"pending" does not belong in page\.js\. Move it to the view\.js/);
});

const loadingPage = () =>
  define(
    {
      namespaces: { data: { state: { loaded: false }, actions: { loaded: { args: {}, run: (store) => store.set('loaded', true) } } } },
      view: { tag: 'section', id: 'item-view', children: 'item' },
      ready: (state) => state.data.loaded,
      pending: { tag: 'p', id: 'item-pending', children: 'Loading' },
      status: (state) => (state.data.loaded && state.route.params.id === 'missing' ? 404 : 200),
    },
    '/item/:id',
  );

test('a page shows its pending view until ready is true, then its content', async () => {
  const definition = loadingPage();
  assert.deepEqual(validate(definition.spec, { namespaces: definition.namespaces }), []);
  const ui = await open(definition, '/item/1');
  assert.equal(ui.derived().route.ready, false);
  assert.ok(JSON.stringify(ui.outline()).includes('item-pending'));
  assert.equal(JSON.stringify(ui.outline()).includes('item-view'), false);
  ui.dispatch('data.loaded');
  await ui.settle();
  assert.equal(ui.derived().route.ready, true);
  assert.equal(JSON.stringify(ui.outline()).includes('item-pending'), false);
  assert.ok(JSON.stringify(ui.outline()).includes('item-view'));
});

test('a page without ready counts as ready, and route.ready says so', async () => {
  const ui = await open(define(), '/');
  assert.equal(ui.derived().route.ready, true);
  assert.deepEqual([ui.isReady(), ui.getStatus()], [undefined, undefined]);
});

test('the app answers isReady and getStatus for its page', async () => {
  const item = await open(loadingPage(), '/item/missing');
  assert.deepEqual([item.isReady(), item.getStatus()], [false, 200]);
  item.dispatch('data.loaded');
  assert.deepEqual([item.isReady(), item.getStatus()], [true, 404]);
});

test('a ready or status that returns the wrong kind of value says what to return, ready as soon as the page starts', async () => {
  expectError(() => define({ ready: () => 'yes' }, '/a').create({ root: createRoot(), win: createWindow('/a'), fetchFunction: async () => null, dev: true }), /derived "route\.ready": page "\/a": ready\(state\) returned "yes", not true or false\. Return a boolean/);
  const ui = await open(define({ status: () => 'ok' }, '/a'), '/a');
  expectError(() => ui.getStatus(), /page "\/a": status\(state\) returned "ok", not an HTTP status\. Return a whole number/);
});

test('a page can declare shapes like any namespace: they are checked', () => {
  const definition = define({ namespaces: { list: { state: { rows: [] }, shapes: { rows: { fields: { id: 'number', name: 'string' } } } } } });
  const spec = { tag: 'ul', children: { each: 'list.rows', key: 'id', template: { tag: 'li', children: { item: 'nmae' } } } };
  assert.match(validate(spec, { namespaces: definition.namespaces })[0], /unknown item field nmae\. Did you mean "name"\?/);
});

test('the page keeps document.title current while its data arrives', async () => {
  const definition = define({ head: { title: (state) => (state.data.loaded ? 'Loaded' : 'Loading') }, namespaces: { data: { state: { loaded: false }, actions: { loaded: { args: {}, run: (store) => store.set('loaded', true) } } } } });
  const win = createWindow('/');
  win.document = { title: 'Loading' };
  const ui = definition.create({ root: createRoot(), win, fetchFunction: async () => null, dev: true });
  ui.dispatch('data.loaded');
  await ui.settle();
  assert.equal(win.document.title, 'Loaded');
});

// ---- there is no list of static URLs ---------------------------------------------------------------------------------

test('a page has no generate key: a static site names every page (agent-ui build --static), so there is nothing to list', () => {
  expectError(() => define({ generate: false }, '/hidden'), /page "\/hidden": unknown key "generate"\. Allowed keys: head, namespaces, plugins, ready, status, shell, debug/);
  expectError(() => define({ generate: () => [] }, '/a/:id'), /unknown key "generate"/);
  assert.equal(define({}, '/about').listStaticUrls, undefined);
});

test('the status of a page is read through the server-only half of pages', async () => {
  const ui = await open(define({ status: () => 418 }), '/');
  assert.equal(ui.getStatus(), 418);
});

test('a status that JSON cannot write is still reported with what it is', async () => {
  const ui = await open(define({ status: () => 1n }), '/');
  expectError(() => ui.getStatus(), /page "\/": status\(state\) returned bigint, not an HTTP status/);
});

test('plugins are listed by the page and receive the environment; declaring resources without the plugin is reported', async () => {
  const { withResources } = await import('../src/resources.js');
  const seen = [];
  const withProbe = (environment) => (api) => seen.push([environment.fetchFunction === probeFetch, api.keys()]);
  const probeFetch = async () => ({ ok: true, status: 200, json: async () => 'x' });
  const namespaces = {
    data: {
      state: { value: '' },
      actions: { loaded: { args: { data: 'json' }, run: (store, { data }) => store.set('value', data) }, loading: { args: {}, run() {} }, failed: { args: { message: 'string' }, run() {} } },
      resources: [{ watch: [], request: () => ({ url: '/x' }), onStart: 'loading', onSuccess: 'loaded', onError: 'failed' }],
    },
  };
  const probed = define({ plugins: [withProbe] });
  await open(probed, '/', probeFetch);
  assert.equal(seen.length, 1);
  assert.equal(seen[0][0], true); // the plugin received the environment the page was created with
  const loaded = define({ namespaces, plugins: [withResources] });
  const ui = await open(loaded, '/', probeFetch);
  await ui.settle();
  assert.equal(ui.state().data.value, 'x');
  expectError(() => define({ namespaces }).create({ root: createRoot(), win: createWindow('/'), fetchFunction: probeFetch, dev: true }), /namespace "data": declares resources, but no plugin loads them\. Add the resources plugin to plugins .* in a page write `plugins: \[withResources\]`/);
  expectError(() => define({ plugins: [1] }), /"plugins" must be a list of functions \(environment\) => plugin\. Write `plugins: \[withResources\]`/);
});

test('view, layout and pending belong in view.js, and a finished spec stands alone', () => {
  expectError(() => definePage({ head: { title: 'x' }, layout: (content) => content }, { path: '/', view: baseView }), /"layout" does not belong in page\.js\. Move it to the view\.js next to page\.js/);
  expectError(() => definePage(basePage(), { path: '/', view: baseView, spec: baseView }), /both "view" and "spec" are given\. Give "view" \(and "layout"\) to build the spec, or "spec" alone/);
  expectError(() => definePage(basePage(), { path: '/', spec: baseView, layout: (content) => content }), /"layout" is given with "spec"\. A finished "spec" already contains its layout and its pending view/);
  expectError(() => definePage({ ...basePage(), ready: () => true }, { path: '/', spec: baseView, pending: baseView }), /"pending" is given with "spec"/);
  assert.equal(definePage(basePage(), { path: '/', spec: baseView }).spec, baseView);
});

test('contentOf takes the exports of a view.js and refuses any other', () => {
  const layout = (content) => content;
  assert.deepEqual(contentOf({ view: baseView, layout }, 'pages/view.js'), { view: baseView, layout, pending: undefined, shell: undefined });
  expectError(() => contentOf({ view: baseView, pendng: baseView }, 'pages/about/view.js'), /pages\/about\/view\.js: unknown export "pendng"\. Did you mean "pending"\? Export only view, layout, pending, shell, paths from view\.js/);
});

test('pageOf reads the page of page.js and names the file when the export is misspelt or belongs to view.js', () => {
  expectError(() => pageOf({ pages: basePage() }, 'pages/about/page.js'), /pages\/about\/page\.js: does not export "page"\. Did you mean "page"\? Write `export const page = \{ head: \{ title: '\.\.\.' \} \}` in pages\/about\/page\.js/);
  expectError(() => pageOf({ view: baseView }, 'pages/about/page.js'), /pages\/about\/page\.js: exports "view" instead of "page"\. page\.js holds the page's behavior: write `export const page = \{ head: \{ title: '\.\.\.' \} \}`\. Export `view` from the view\.js next to it instead/);
  assert.equal(pageOf({ page: basePage() }, 'pages/about/page.js').head.title, 'A page');
});

test('plugins go on the side they belong to: a page factory in app(), a plugin in page.js, resources without withResources', () => {
  // A page factory in app() would return its plugin and install nothing: the mark says so.
  expectError(() => app({ dev: true, spec: baseView, root: createRoot(), plugins: [withFollow] }), /app: plugins\[0\] \("withFollow"\) is a page plugin factory\. A factory \(environment\) => plugin belongs in page\.js plugins; app\(\) takes the plugin itself: follow, moves, resources\(fetchFunction\), navigation/);
  const environment = () => ({ root: createRoot(), win: createWindow('/'), fetchFunction: async () => null, dev: true });
  // A page lists a factory, not the plugin: `follow` called with the environment fails on the api, with the way forward.
  expectError(() => define({ plugins: [() => 'nope'] }).create(environment()), /page "\/": plugins\[0\] returned string, not a plugin\. A page lists plugin factories, \(environment\) => plugin, for example plugins: \[withResources\]/);
  expectError(() => define({ plugins: [follow] }).create(environment()), /page "\/": plugins\[0\] \("follow"\) threw api\.handleProperty is not a function\. A page lists plugin factories/);
  // resources() in page.js takes the environment object as its fetch function: named when it is installed.
  const box = {
    state: { data: null },
    actions: { loading: { args: {}, run: () => {} }, loaded: { args: { data: 'json' }, run: () => {} }, failed: { args: { message: 'string' }, run: () => {} } },
    resources: [{ watch: [], request: () => ({ url: '/x' }), onStart: 'loading', onSuccess: 'loaded', onError: 'failed' }],
  };
  expectError(() => define({ namespaces: { box }, plugins: [resources] }).create(environment()), /^resources: fetchFunction is an object, not a function\. In a page\.js write `plugins: \[withResources\]`/);
});

test('a page path is judged by the grammar of URL patterns: its own mistakes are named, with the pattern\'s message', () => {
  expectError(() => define({}, '/a/:id/:id'), /path "\/a\/:id\/:id" is not allowed \(URL pattern "\/a\/:id\/:id": the parameter "id" is used twice/);
  expectError(() => define({}, '/a/:1x'), /path "\/a\/:1x" is not allowed \(URL pattern .*"\:1x" is not a parameter name/);
  expectError(() => define({}, '/a//b'), /path "\/a\/\/b" is not allowed/);
  expectError(() => define({}, '/a/'), /path "\/a\/" is not allowed/);
  expectError(() => define({}, '/a b'), /path "\/a b" is not allowed/);
  assert.doesNotThrow(() => define({}, '/docs/*path'));
  assert.doesNotThrow(() => define({}, '/event/:id'));
});

test('production checks the spec of a page once, and an initial state from a caller every time', () => {
  const definition = define({ namespaces: { note: { state: { text: '' } } } });
  const make = (dev, initialState) => definition.create({ root: createRoot(), win: createWindow('/'), dev, ...(initialState && { initialState }) });
  make(false).destroy();
  definition.spec.unknownKey = true; // what validate() refuses, so an app that was made did not check it
  make(false).destroy();
  assert.throws(() => make(true), /unknownKey/);
  assert.throws(() => make(false, { note: { missing: 1 } }), /no state key "missing"/);
});
