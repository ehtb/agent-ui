// Server-side rendering: same runtime, server DOM, HTML out, state transfer in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow, createRoot, findElements, fireEvent } from './support/dom-shim.mjs';
import { createFakeFetch, sleep } from './support/helpers.mjs';

const { renderPage, createServerWindow, stateScriptHtml } = await import('../server/render-page.js');
const { createServerDocument, serialize } = await import('../src/server-dom.js');
const { readServerState } = await import('../src/hydrate.js');
const { app } = await import('../src/ui.js');
const catalog = await import('./fixtures/catalog-app.js');
const items = [{ id: 1, name: 'Alpha' }, { id: 2, name: 'Beta' }, { id: 3, name: 'Gamma' }];
const itemsFetch = () => createFakeFetch((url) => (url === '/items.json' ? items : { ok: false, status: 404 }));

// The fixture's pages: the page that serves the URL is rendered for it.
const renderCatalog = (url, options = {}) => renderPage(catalog.pageFor(url).create, { dev: false, url, fetchFunction: itemsFetch(), ...options });

test('the server DOM matches an attribute by value too, refuses a selector it cannot match, and leaves a detached node alone', () => {
  const document = createServerDocument();
  const root = document.createElement('div');
  const save = document.createElement('button');
  save.setAttribute('data-id', 'save');
  const cancel = document.createElement('button');
  cancel.setAttribute('data-id', 'cancel');
  root.append(save, cancel);
  assert.deepEqual(root.querySelectorAll('[data-id="save"]'), [save]);
  assert.equal(save.closest('[data-id="save"]'), save);
  assert.equal(save.closest('[data-id="cancel"]'), null);
  assert.throws(() => root.querySelectorAll('button'), /querySelectorAll\("button"\): this DOM matches attribute selectors only, "\[name\]" and '\[name="value"\]'/);
  const detached = document.createElement('p');
  assert.doesNotThrow(() => detached.replaceWith(document.createElement('p')), 'a detached node is left alone, as Element.replaceWith does');
});

test('the test shim stops an event where a handler says stopPropagation, as a browser does', () => {
  const document = createServerDocument();
  const outer = document.createElement('div');
  const inner = document.createElement('button');
  outer.append(inner);
  const seen = [];
  outer.addEventListener('click', () => seen.push('outer'));
  inner.addEventListener('click', (event) => {
    seen.push('inner');
    event.stopPropagation();
  });
  fireEvent(inner, 'click');
  assert.deepEqual(seen, ['inner']);
});

test('server DOM serializes elements, escaping, void tags, boolean and value properties', () => {
  const document = createServerDocument();
  const root = document.createElement('div');
  app({ dev: true,
    namespaces: { form: { state: { text: '<b>"&"</b>', name: 'a"b', done: true, pick: 'two' } } },
    root,
    spec: {
      tag: 'form',
      id: 'f',
      children: [
        { tag: 'p', id: 'p', children: { state: 'form.text' } },
        { tag: 'input', id: 'i', props: { type: 'text', 'aria-label': 'name', value: { state: 'form.name' } } },
        { tag: 'input', id: 'c', props: { type: 'checkbox', 'aria-label': 'done', checked: { state: 'form.done' } } },
        { tag: 'select', id: 's', props: { 'aria-label': 'pick', value: { state: 'form.pick' } }, children: [{ tag: 'option', props: { value: 'one' }, children: 'One' }, { tag: 'option', props: { value: 'two' }, children: 'Two' }] },
        { when: { state: 'form.done' }, children: { tag: 'em', id: 'e', children: 'yes' } },
      ],
    },
  });
  const html = serialize(root);
  assert.match(html, /<p data-id="p">&lt;b&gt;"&amp;"&lt;\/b&gt;<\/p>/);
  assert.match(html, /<input data-id="i" type="text" aria-label="name" value="a&quot;b">/);
  assert.match(html, /<input data-id="c" type="checkbox" aria-label="done" checked>/);
  assert.match(html, /<option data-id="[^"]*" value="two" selected>Two<\/option>/);
  assert.doesNotMatch(html, /value="one"[^>]*selected/);
  assert.match(html, /<em data-id="e">yes<\/em>/);
  assert.ok(!html.includes('</input>'));
});

test('renderPage: the page reads route.params from the URL and the output equals what the client would render', async () => {
  const list = await renderCatalog('/');
  assert.equal(list.timedOut, false);
  assert.equal(list.state.catalog.status, 'ready');
  assert.equal(list.state.catalog.items.length, 3);
  assert.match(list.html, new RegExp(items[0].name));
  assert.match(list.html, /href="\/item\/\d+"/); // plain links to another page

  const detail = await renderCatalog('/item/3');
  assert.deepEqual(detail.state.route, { params: { id: '3' }, hydrated: false });
  assert.match(detail.html, /All items/);

  // Parity: mounting the same app on the shim DOM in the browser produces the same outline.
  const browserWindow = createWindow('/item/3');
  const browserRoot = createRoot();
  const client = catalog.item.create({ root: browserRoot, win: browserWindow, fetchFunction: itemsFetch(), dev: false });
  await sleep(20);
  await client.settle();
  assert.deepEqual(client.outline(), detail.ui.outline());
});

test('renderPage: a page that is not ready by the deadline renders what exists and says so', async () => {
  const hung = await renderPage(catalog.list.create, { dev: false, url: '/', fetchFunction: () => new Promise(() => {}), timeoutMs: 30 });
  assert.equal(hung.timedOut, true);
  assert.equal(hung.state.catalog.status, 'loading');
});

test('renderPage passes the request context to fetchFunction and writes the state script', async () => {
  const request = { method: 'GET', pathname: '/', search: '', query: new URLSearchParams(), headers: { authorization: 'Bearer x' }, cookies: {} };
  let requestFetch = null;
  let captured = null;
  const result = await renderPage(
    (environment) => {
      requestFetch = environment.fetchFunction;
      return app({ dev: false, root: environment.root, spec: { tag: 'p', id: 'page-text', children: 'page' } });
    },
    { dev: false, request, fetchFunction: async (...args) => { captured = args; return { ok: true, status: 200, json: async () => null }; } },
  );
  await requestFetch('/data.json', { method: 'GET' });
  assert.deepEqual(captured, ['/data.json', { method: 'GET' }, request]);
  assert.match(result.stateScript, /<script type="application\/json" id="agent-ui-state">/);
});

test('stateForBrowser keeps a server-only key out of the state script and cannot add a key', async () => {
  const request = { method: 'GET', pathname: '/account', search: '', query: new URLSearchParams(), headers: {}, cookies: {}, signal: null };
  let seen = null;
  const create = (environment) =>
    app({
      dev: false,
      namespaces: { account: { state: { name: '', token: '' } } },
      spec: { tag: 'p', id: 'account', children: { state: 'account.name' } },
      root: environment.root,
      initialState: environment.initialState,
    });
  const result = await renderPage(create, {
    dev: false,
    request,
    initialState: { account: { name: 'Ada', token: 'server-secret' } },
    stateForBrowser: (state, received) => {
      seen = received;
      return { account: { name: state.account.name } };
    },
  });
  assert.equal(seen, request);
  assert.equal(result.state.account.token, 'server-secret', 'the renderer still returns the full state to its caller');
  assert.match(result.stateScript, /"account":\{"name":"Ada"\}/);
  assert.doesNotMatch(result.stateScript, /server-secret/);
  await assert.rejects(
    renderPage(create, { dev: false, stateForBrowser: () => ({ account: { name: 'Ada', extra: 1 } }) }),
    /renderPage stateForBrowser: returned "account\.extra", which is not a state key the page declared\. Return only namespaces and keys of the rendered state/,
  );
  await assert.rejects(renderPage(create, { dev: false, stateForBrowser: () => 'hidden' }), /renderPage stateForBrowser: returned string, not a state object/);
  await assert.rejects(renderPage(create, { dev: false, stateForBrowser: () => ({ extra: {} }) }), /renderPage stateForBrowser: returned the namespace "extra", which the page did not declare/);
});

test('the signal of a render reaches the data requests of its resources', async () => {
  const { withResources } = await import('../src/resources.js');
  let requestSignal = null;
  let requestArgument = 'not called';
  const create = (environment) => {
    const ui = app({
      dev: false,
      namespaces: {
        items: {
          state: { list: [], status: 'idle' },
          actions: {
            loading: { args: {}, run: (store) => store.set('status', 'loading') },
            loaded: { args: { data: 'json' }, run: (store, { data }) => { store.set('list', data); store.set('status', 'ready'); } },
            failed: { args: { message: 'string' }, run: (store) => store.set('status', 'failed') },
          },
          resources: [{ watch: [], owns: ['list', 'status'], request: () => ({ url: '/items.json' }), onStart: 'loading', onSuccess: 'loaded', onError: 'failed' }],
        },
      },
      plugins: [withResources(environment)],
      spec: { tag: 'p', id: 'items', children: 'items' },
      root: environment.root,
    });
    ui.isReady = () => ui.state().items.status === 'ready';
    return ui;
  };
  const controller = new AbortController();
  const pending = renderPage(create, {
    dev: false,
    timeoutMs: 10_000,
    signal: controller.signal,
    fetchFunction: (url, init, requestArgumentFromSignal) => {
      requestSignal = init.signal;
      requestArgument = requestArgumentFromSignal;
      return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    },
  });
  await new Promise((done) => setTimeout(done, 5));
  controller.abort();
  await assert.rejects(pending, (error) => error.name === 'AbortError');
  assert.equal(requestSignal.aborted, true, 'the resource request sees the disconnect');
  assert.equal(requestArgument, undefined, 'without a request, the signal wrapper adds no null third argument');
});

test('renderPage stops on abort instead of waiting for a page or returning a partial render', async () => {
  let destroyed = false;
  const create = (environment) => {
    const ui = app({
      dev: false,
      namespaces: { n: { state: { a: 1 } } },
      spec: { tag: 'p', id: 'p', children: 'hi' },
      root: environment.root,
      plugins: [(api) => api.onDestroy(() => { destroyed = true; })],
    });
    ui.isReady = () => false;
    return ui;
  };
  const controller = new AbortController();
  const pending = renderPage(create, { dev: false, timeoutMs: 10_000, signal: controller.signal });
  await new Promise((done) => setTimeout(done, 5));
  controller.abort();
  await assert.rejects(pending, (error) => error.name === 'AbortError' && /closed before the page was finished/.test(error.message));
  assert.equal(destroyed, true, 'the app is ended when the visitor goes away');
  const already = new AbortController();
  already.abort();
  await assert.rejects(renderPage(create, { dev: false, signal: already.signal }), (error) => error.name === 'AbortError');
});

test('renderPage rejects when the client leaves during an async stateForBrowser', async () => {
  const create = (environment) => app({ dev: false, namespaces: { n: { state: { a: 1 } } }, spec: { tag: 'p', id: 'p', children: 'hi' }, root: environment.root });
  const controller = new AbortController();
  let release;
  let started;
  const entered = new Promise((resolve) => { started = resolve; });
  const pending = renderPage(create, {
    dev: false,
    signal: controller.signal,
    stateForBrowser: () => new Promise((resolve) => { release = resolve; started(); }),
  });
  await entered;
  controller.abort();
  release({ n: { a: 1 } });
  await assert.rejects(pending, (error) => error.name === 'AbortError');
});

test('state transfer: the state script is safe inside HTML and the client mounts from it', async () => {
  const script = stateScriptHtml({ note: '</script><b>' });
  assert.ok(!script.slice(0, -'</script>'.length).includes('</script>'));
  const page = await renderCatalog('/');
  const element = { textContent: JSON.stringify(page.state) };
  assert.deepEqual(readServerState({ getElementById: (id) => (id === 'agent-ui-state' ? element : null) }).route, { params: {}, hydrated: false });
  assert.deepEqual(readServerState({ getElementById: () => null }), {});
  assert.deepEqual(readServerState({ getElementById: () => ({ textContent: '{broken' }) }), {});

  // The client starts with the server state and renders it immediately, before any fetch.
  const fetchFunction = createFakeFetch(() => items);
  const client = catalog.list.create({ root: createRoot(), win: createWindow('/'), fetchFunction, dev: false, initialState: page.state });
  assert.equal(client.state().catalog.items.length, 3);
  assert.ok(client.outline()[0].children.length > 0);
});

test('hydration replaces server markup and keeps focus by data-id', () => {
  const root = createRoot();
  const serverNodes = createServerDocument();
  void serverNodes;
  root.append(globalThis.document.createTextNode('server markup'));
  const win = createWindow('/');
  const ui = catalog.list.create({ root, win, fetchFunction: itemsFetch(), dev: false });
  assert.ok(!root.textContent.includes('server markup'));
  assert.equal(ui.errors.length, 0);
});

test('hydration carries typed input and checked state over by data-id, until state writes the binding', async () => {
  const root = createRoot();
  const serverInput = globalThis.document.createElement('input');
  serverInput.setAttribute('data-id', 'draft');
  serverInput.value = 'typed before load';
  const serverBox = globalThis.document.createElement('input');
  serverBox.setAttribute('data-id', 'agree');
  serverBox.setAttribute('type', 'checkbox');
  serverBox.checked = true;
  const serverOrphan = globalThis.document.createElement('input');
  serverOrphan.setAttribute('data-id', 'gone'); // no counterpart in the client spec: dropped with the server markup
  serverOrphan.value = 'x';
  root.append(serverInput, serverBox, serverOrphan);

  const ui = app({ dev: true,
    namespaces: { form: { state: { draft: '', agree: false }, actions: { setDraft: { args: { value: 'string' }, run: (store, { value }) => store.set('draft', value) } } } },
    root,
    spec: {
      tag: 'form',
      id: 'f',
      children: [
        { tag: 'input', id: 'draft', props: { 'aria-label': 'draft', value: { state: 'form.draft' } } },
        { tag: 'input', id: 'agree', props: { type: 'checkbox', 'aria-label': 'agree', checked: { state: 'form.agree' } } },
      ],
    },
  });
  const fieldById = (id) => [...root.querySelectorAll('[data-id]')].find((element) => element.dataset.id === id);
  assert.equal(fieldById('draft').value, 'typed before load');
  assert.equal(fieldById('agree').checked, true);
  assert.equal(fieldById('gone'), undefined);
  assert.equal(ui.errors.length, 0);
  // A carried value is unsubmitted input: an action writing the bound state replaces it.
  ui.dispatch('form.setDraft', { value: 'from state' });
  await ui.settle();
  assert.equal(fieldById('draft').value, 'from state');
});

test('hydration tells the same field in different rows apart, by the row keys: each row keeps its own value and checked state', async () => {
  const items = [{ id: 'a', n: 12, on: true }, { id: 'b', n: 19, on: false }, { id: 'c', n: 7, on: true }];
  const namespaces = { rows: { state: { list: items } } };
  const spec = { tag: 'ul', id: 'list', children: { each: 'rows.list', key: 'id', template: { tag: 'li', id: 'row', children: [
    { tag: 'input', id: 'number', props: { type: 'number', 'aria-label': 'number', value: { item: 'n' } } },
    { tag: 'input', id: 'flag', props: { type: 'checkbox', 'aria-label': 'flag', checked: { item: 'on' } } },
  ] } } };
  // The server renders the page; the client then mounts into the same root, the way a browser takes over.
  const root = createRoot();
  app({ dev: true, namespaces, spec, root });
  const typed = findElements(root, (element) => element.dataset.id === 'number');
  typed[1].value = '20'; // the visitor typed into the second row before the app loaded
  app({ dev: true, namespaces, spec, root });
  assert.deepEqual(findElements(root, (element) => element.dataset.id === 'number').map((element) => element.value), ['12', '20', '7']);
  assert.deepEqual(findElements(root, (element) => element.dataset.id === 'flag').map((element) => element.checked), [true, false, true]);
});

test('createServerWindow exposes location parts for plugins', () => {
  const win = createServerWindow('/item/3?tab=a#top');
  assert.deepEqual([win.location.pathname, win.location.search, win.location.hash], ['/item/3', '?tab=a', '#top']);
});

test('renderPage refuses an option it does not know, with a suggestion', async () => {
  await assert.rejects(renderPage(() => assert.fail('never created'), { dev: false, fetchFuncton: () => {} }), /renderPage: unknown option "fetchFuncton"\. Did you mean "fetchFunction"\? Allowed options: url, fetchFunction, timeoutMs, dev, initialState, createShell, request, stateForBrowser, signal, basePath/);
});

test('the server window can add and remove listeners, and the environment of a render says isServerRendering', async () => {
  const win = createServerWindow('/');
  for (const target of [win, win.document]) {
    const listener = () => {};
    target.addEventListener('pagehide', listener);
    target.removeEventListener('pagehide', listener);
  }
  let seen = null;
  const spy = () => {}; // an app plugin installs its effects in its own body; returning a function is refused (it would be a page factory)
  await renderPage((environment) => {
    seen = environment.isServerRendering;
    return app({ dev: true, namespaces: { n: { state: { a: 1 } } }, root: environment.root, spec: { tag: 'p', id: 'p', children: 'hi' }, plugins: [spy] });
  }, { dev: false });
  assert.equal(seen, true);
});

test('a plugin that reaches for something the server window lacks fails the render with the fix, and the cause stays', async () => {
  const usesStorage = ({ win }) => () => win.localStorage.getItem('draft');
  const create = (environment) => app({ dev: true, namespaces: { n: { state: { a: 1 } } }, root: environment.root, spec: { tag: 'p', id: 'p', children: 'hi' }, plugins: [usesStorage(environment)] });
  await assert.rejects(
    renderPage(create, { dev: false }),
    (error) => /^renderPage: Cannot read properties of undefined \(reading 'getItem'\)\..*Return early from the plugin when the environment says `isServerRendering` \(`agent-ui explain browser-only-plugin`\)$/s.test(error.message) && error.cause instanceof TypeError,
  );
});

// ------------------------------------------------------------------------------------------------ build integration

const { injectMarkup } = await import('../server/document.mjs');
const { createStaticServer } = await import('../cli/static-handler.mjs');
const { createHotReload } = await import('../cli/hot-reload.mjs');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
const { join, resolve } = await import('node:path');
const { tmpdir } = await import('node:os');

test('injectMarkup puts markup inside the mount point and the state before the module script', () => {
  const page = '<body>\n<div id=app></div>\n<script type="module" src="a.js"></script>\n</body>';
  const result = injectMarkup(page, { html: '<p>hi</p>', stateScript: '<script id="s"></script>' });
  assert.ok(result.includes('<div id=app><!--ssr:start--><p>hi</p><!--ssr:end--></div>'));
  const again = injectMarkup(result, { html: '<p>new</p>', stateScript: '<script type="application/json" id="agent-ui-state">{}</script>' });
  assert.ok(again.includes('<p>new</p>') && !again.includes('<p>hi</p>') && again.split('agent-ui-state').length === 2); // idempotent: replaces, never stacks
  assert.ok(result.indexOf('id="s"') < result.indexOf('type="module"'));
  assert.throws(() => injectMarkup('<body></body>', { html: '', stateScript: '' }), /no <div id="app"> \(or <div id="shell"> for a page with a shell\) to render into/);
});

test('hot reload (cli/hot-reload.mjs, plugged into the static handler by its hooks): pages get the client script, /__dev/events says hello and streams what publish() sends, and the client holds no browser storage', async () => {
  const directory = resolve(mkdtempSync(join(tmpdir(), 'agent-ui-hot-')));
  writeFileSync(join(directory, 'p.html'), '<body><p>x</p></body>');
  writeFileSync(join(directory, 'a.js'), 'x');
  const plain = createStaticServer(directory);
  const hotReload = createHotReload();
  const hot = createStaticServer(directory, { intercept: hotReload.intercept, transformHtml: hotReload.transformHtml });
  await Promise.all([plain, hot].map((server) => new Promise((resolveListening) => server.listen(0, resolveListening))));
  try {
    const plainBase = `http://localhost:${plain.address().port}`;
    const hotBase = `http://localhost:${hot.address().port}`;
    assert.ok(!(await (await fetch(`${plainBase}/p.html`)).text()).includes('__dev'));
    const page = await (await fetch(`${hotBase}/p.html`)).text();
    assert.ok(page.includes('<script src="/__dev/client.js"></script>') && page.endsWith('</script></body>'));
    assert.equal(await (await fetch(`${hotBase}/a.js`)).text(), 'x'); // only HTML is modified
    const client = await (await fetch(`${hotBase}/__dev/client.js`)).text();
    assert.ok(client.includes("new EventSource('/__dev/events')"));
    assert.doesNotMatch(client, /sessionStorage|localStorage|indexedDB/, 'the page state is handed over in memory (src/hot.js), never stored');

    const reader = (await fetch(`${hotBase}/__dev/events`)).body.getReader();
    const read = async () => JSON.parse(new TextDecoder().decode((await reader.read()).value).replace(/^data: /, ''));
    const hello = await read();
    assert.match(hello.hello, /^\d+-\d+$/);
    assert.equal(hello.build, 0);
    hotReload.publish({ reload: false, css: {}, entries: {} });
    assert.deepEqual(await read(), { reload: false, css: {}, entries: {}, build: 1 });
    await reader.cancel();
    const reopened = (await fetch(`${hotBase}/__dev/events`)).body.getReader();
    const reopenedHello = JSON.parse(new TextDecoder().decode((await reopened.read()).value).replace(/^data: /, ''));
    assert.equal(reopenedHello.build, 1, 'a page that reconnects after missing broadcasts sees the build number');
    await reopened.cancel();
  } finally {
    hotReload.close();
    hot.closeAllConnections?.();
    plain.close();
    hot.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('browserEnvironment gathers the same fields the server passes to create()', async () => {
  const mountPoint = { id: 'app' };
  globalThis.window = { fetch: function () { return this === globalThis.window; } };
  globalThis.document = { getElementById: (id) => (id === 'app' ? mountPoint : { textContent: '{"route":"item"}' }) };
  try {
    const { browserEnvironment } = await import('../src/hydrate.js');
    const environment = browserEnvironment({ dev: true });
    assert.equal(environment.root, mountPoint);
    assert.equal('storage' in environment, false); // durable state lives on the server, so there is no storage to pass
    assert.equal(environment.fetchFunction(), true); // bound to window
    assert.deepEqual(environment.initialState, { route: 'item' });
    assert.equal(environment.serverRendered, true, 'the document carries state a server wrote');
    assert.equal(environment.dev, true, 'what the entry wrote down');
    globalThis.document = { getElementById: (id) => (id === 'app' ? mountPoint : null) };
    assert.equal(browserEnvironment({ dev: true }).serverRendered, false, 'a document with no state script was not server-rendered with data');
  } finally {
    globalThis.window = {};
    const { shimDocument } = await import('./support/dom-shim.mjs');
    globalThis.document = shimDocument;
  }
});

test('static server rewrites: a URL that matches a page pattern returns the page shell, files and other paths do not', async () => {
  const directory = resolve(mkdtempSync(join(tmpdir(), 'agent-ui-rewrite-')));
  writeFileSync(join(directory, 'item-id.html'), '<p>item</p>');
  writeFileSync(join(directory, 'docs-path.html'), '<p>docs</p>');
  writeFileSync(join(directory, 'index.html'), '<p>index</p>');
  writeFileSync(join(directory, 'data.json'), '{}');
  const rewrites = [{ pattern: '/item/:id', page: 'item-id.html' }, { pattern: '/docs/*path', page: 'docs-path.html' }];
  const server = createStaticServer(directory, { rewrites: () => rewrites });
  await new Promise((resolveListening) => server.listen(0, resolveListening));
  const base = `http://localhost:${server.address().port}`;
  const text = async (path) => [(await fetch(base + path)).status, await (await fetch(base + path)).text()];
  try {
    assert.deepEqual(await text('/item/3'), [200, '<p>item</p>']);
    assert.deepEqual(await text('/item/3/'), [200, '<p>item</p>']);
    assert.deepEqual(await text('/docs/a/b/c'), [200, '<p>docs</p>']);
    assert.deepEqual(await text('/'), [200, '<p>index</p>']);
    assert.equal((await fetch(`${base}/item`)).status, 404); // a parameter needs a segment
    assert.equal((await fetch(`${base}/item/3/4`)).status, 404); // and matches exactly one
    assert.equal((await fetch(`${base}/items/3`)).status, 404); // literal segments match whole segments
    assert.equal((await fetch(`${base}/item/missing.js`)).status, 404); // files are never rewritten
  } finally {
    server.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('renderPage waits for the page to say it is ready, and a timeout is reported', async () => {
  const { definePage } = await import('../src/pages.js');
  const { withResources } = await import('../src/resources.js');
  const { renderPage } = await import('../server/render-page.js');
  const pageFields = (ready) => ({
    head: { title: 'Home' },
    ready,
    namespaces,
    plugins: [withResources],
  });
  const pageView = { tag: 'p', id: 'items', children: { state: 'data.items' } };
  const namespaces = {
    data: {
      state: { items: 'none', done: false },
      actions: {
        loading: { args: {}, run: () => {} },
        loaded: { args: { data: 'json' }, run: (store, { data }) => { store.set('items', data); store.set('done', true); } },
        failed: { args: { message: 'string' }, run: () => {} },
      },
      resources: [{ watch: [], request: () => ({ url: '/items' }), onStart: 'loading', onSuccess: 'loaded', onError: 'failed' }],
    },
  };
  const slow = async () => {
    await sleep(30);
    return { ok: true, status: 200, json: async () => 'loaded' };
  };
  const waiting = definePage(pageFields((state) => state.data.done), { path: '/', view: pageView });
  const rendered = await renderPage(waiting.create, { dev: false, url: '/', fetchFunction: slow });
  assert.equal(rendered.timedOut, false);
  assert.match(rendered.html, /loaded/);
  const never = definePage(pageFields(() => false), { path: '/', view: pageView });
  const stuck = await renderPage(never.create, { dev: false, url: '/', fetchFunction: slow, timeoutMs: 40 });
  assert.equal(stuck.timedOut, true);
});

test('renderPage rejects when ready(state) throws after a state change, ends the app, and does not leave an uncaught timer error', async () => {
  let created = null;
  const create = (environment) => {
    const ui = app({ dev: true,
      namespaces: { page: { state: { done: false }, actions: { finish: { args: {}, run: (store) => store.set('done', true) } } } },
      spec: { tag: 'p', id: 'note', children: { state: 'page.done' } },
      root: environment.root,
      plugins: [(api) => environment.win.setTimeout(() => api.dispatch('page.finish'), 0)],
    });
    ui.isReady = () => {
      if (ui.state().page.done) throw new Error('ready exploded');
      return false;
    };
    created = ui;
    return ui;
  };
  await assert.rejects(renderPage(create, { dev: false, url: '/', timeoutMs: 1000 }), /ready exploded/);
  assert.equal(created.destroyed, true, 'the app whose ready threw is ended');
});

test('disabled controls are disabled in the server-rendered HTML, before any script runs', async () => {
  const { app } = await import('../src/ui.js');
  const { renderPage } = await import('../server/render-page.js');
  const page = await renderPage(
    (env) =>
      app({ dev: true,
        namespaces: { page: { state: { busy: true } } },
        spec: { tag: 'div', children: [{ tag: 'button', id: 'static-off', props: { disabled: true }, children: 'a' }, { tag: 'button', id: 'bound', props: { disabled: { state: 'page.busy' } }, children: 'b' }, { tag: 'button', id: 'on', children: 'c' }] },
        root: env.root,
      }),
    { dev: false },
  );
  assert.match(page.html, /<button data-id="static-off" disabled>a<\/button>/);
  assert.match(page.html, /<button data-id="bound" disabled>b<\/button>/);
  assert.match(page.html, /<button data-id="on">c<\/button>/);
});

test('the static handler sends the right content type for the files of a built site', async () => {
  const directory = resolve(mkdtempSync(join(tmpdir(), 'agent-ui-mime-')));
  const expected = { 'a.svg': 'image/svg+xml', 'a.png': 'image/png', 'a.woff2': 'font/woff2', 'a.txt': 'text/plain; charset=utf-8', 'a.wasm': 'application/wasm', 'a.unknown': 'application/octet-stream' };
  for (const name of Object.keys(expected)) writeFileSync(join(directory, name), 'x');
  const server = createStaticServer(directory);
  await new Promise((resolveListening) => server.listen(0, resolveListening));
  try {
    for (const [name, type] of Object.entries(expected)) assert.equal((await fetch(`http://localhost:${server.address().port}/${name}`)).headers.get('content-type'), type, name);
  } finally {
    server.closeAllConnections?.();
    server.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('transformHtml reaches every HTML the handler sends from disk', async () => {
  const directory = resolve(mkdtempSync(join(tmpdir(), 'agent-ui-transform-')));
  writeFileSync(join(directory, 'p.html'), '<body>p</body>');
  const server = createStaticServer(directory, { transformHtml: (html) => html.replace('</body>', '<!--t--></body>') });
  await new Promise((resolveListening) => server.listen(0, resolveListening));
  try {
    const base = `http://localhost:${server.address().port}`;
    for (const [path, text] of [['/p.html', 'p']]) {
      assert.equal(await (await fetch(base + path)).text(), `<body>${text}<!--t--></body>`, path);
    }
  } finally {
    server.closeAllConnections?.();
    server.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
