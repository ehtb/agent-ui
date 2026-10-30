// Plugins: resources (async data), windowEvents.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from './support/dom-shim.mjs';
import { mountSpec, flushAsync, createFakeFetch, deferred, sleep, assertRepeatable } from './support/helpers.mjs';

const { resources } = await import('../src/resources.js');
const { windowEvents } = await import('../src/window-events.js');

// ---------------------------------------------------------------------------------------------------- resources

const searchApp = (fetchFunction, { delayMs, request, response } = {}) =>
  mountSpec({
    namespaces: {
      box: {
        state: { query: 'a', status: 'idle', data: null, message: '' },
        actions: {
          querySet: { args: { value: 'string' }, run: (store, { value }) => store.set('query', value) },
          searchLoading: { args: {}, run: (store) => store.set('status', 'loading') },
          searchLoaded: { args: { data: 'json' }, run: (store, { data }) => { store.set('status', 'ready'); store.set('data', data); } },
          searchFailed: { args: { message: 'string' }, run: (store, { message }) => { store.set('status', 'failed'); store.set('message', message); } },
        },
        resources: [{
        watch: ['query'],
        request: request ?? (({ query }) => ({ url: `/search?q=${query}` })),
        onStart: 'searchLoading',
        onSuccess: 'searchLoaded',
        onError: 'searchFailed',
        ...(delayMs && { delayMs }),
        ...(response && { response }),
      }],
      },
    },
    spec: { tag: 'p', children: { state: 'box.status' } },
    plugins: [
      resources(fetchFunction),
    ],
  });

test('resources: loads on mount, goes loading -> ready, response data arrives through a logged action', async () => {
  const fetchFunction = createFakeFetch((url) => ({ url, hits: 3 }));
  const { ui } = searchApp(fetchFunction);
  assert.equal(ui.state().box.status, 'loading');
  await flushAsync(ui);
  assert.equal(ui.state().box.status, 'ready');
  assert.deepEqual(ui.state().box.data, { url: '/search?q=a', hits: 3 });
  assert.deepEqual(ui.log.map(([name]) => name), ['box.searchLoading', 'box.searchLoaded']);
  assert.equal(fetchFunction.calls[0].options.method, 'GET');
});

test('resources: a response that the check function throws on goes to onError with its message, onSuccess does not run', async () => {
  const response = (data) => {
    if (typeof data.hits !== 'number') throw new Error('hits: expected number');
  };
  const fetchFunction = createFakeFetch((url) => (url.endsWith('q=bad') ? { hits: 'many' } : { hits: 3 }));
  const { ui } = searchApp(fetchFunction, { response });
  await flushAsync(ui);
  assert.equal(ui.state().box.status, 'ready');
  ui.dispatch('box.querySet', { value: 'bad' });
  await flushAsync(ui);
  assert.deepEqual([ui.state().box.status, ui.state().box.message], ['failed', 'the response from /search?q=bad does not fit: hits: expected number']);
  assert.deepEqual(ui.state().box.data, { hits: 3 });
  assert.equal(ui.log.filter(([name]) => name === 'box.searchLoaded').length, 1);
});

test('resources: "response" must be a function', () => {
  assert.throws(() => searchApp(createFakeFetch(() => ({})), { response: { list: 'string' } }), /"response" is \{"list":"string"\}\. Write a function that throws when the data does not fit/);
});

test('resources: changes to watched keys reload; failures (HTTP, network) become failed actions with a message', async () => {
  const fetchFunction = createFakeFetch((url) => {
    if (url.endsWith('q=500')) return { ok: false, status: 500 };
    if (url.endsWith('q=down')) return new Error('network down');
    return { fine: true };
  });
  const { ui } = searchApp(fetchFunction);
  await flushAsync(ui);
  ui.dispatch('box.querySet', { value: '500' });
  await flushAsync(ui);
  assert.deepEqual([ui.state().box.status, ui.state().box.message], ['failed', 'HTTP 500']);
  ui.dispatch('box.querySet', { value: 'down' });
  await flushAsync(ui);
  assert.deepEqual([ui.state().box.status, ui.state().box.message], ['failed', 'network down']);
  ui.dispatch('box.querySet', { value: 'ok' });
  await flushAsync(ui);
  assert.equal(ui.state().box.status, 'ready');
  assert.equal(fetchFunction.calls.length, 4);
});

test('resources: only the latest request counts (a slow older response never overwrites a newer one)', async () => {
  const slow = deferred();
  const fetchFunction = createFakeFetch((url) => (url.endsWith('q=slow') ? slow : { answer: url }));
  const { ui } = searchApp(fetchFunction);
  await flushAsync(ui);
  ui.dispatch('box.querySet', { value: 'slow' });
  await flushAsync(ui);
  ui.dispatch('box.querySet', { value: 'fast' });
  await flushAsync(ui);
  assert.deepEqual(ui.state().box.data, { answer: '/search?q=fast' });
  slow.resolve({ answer: 'stale' });
  await flushAsync(ui);
  assert.deepEqual(ui.state().box.data, { answer: '/search?q=fast' });
});

test('resources: a null request cancels what is in flight and loads nothing', async () => {
  const pending = deferred();
  const fetchFunction = createFakeFetch((url) => (url.endsWith('q=a') ? pending : { ok: 1 }));
  const { ui } = searchApp(fetchFunction, { request: ({ query }) => (query === 'none' ? null : { url: `/search?q=${query}` }) });
  assert.equal(ui.state().box.status, 'loading');
  ui.dispatch('box.querySet', { value: 'none' });
  await flushAsync(ui);
  pending.resolve({ late: true });
  await flushAsync(ui);
  assert.equal(ui.state().box.data, null); // the late response was ignored
  assert.equal(fetchFunction.calls.length, 1);
});

test('resources: delayMs debounces bursts into one request', async () => {
  const fetchFunction = createFakeFetch(() => ({ ok: true }));
  const { ui } = mountSpec({
    namespaces: {
      box: {
        state: { query: '', status: 'idle' },
        actions: {
          querySet: { args: { value: 'string' }, run: (store, { value }) => store.set('query', value) },
          searchLoading: { args: {}, run: (store) => store.set('status', 'loading') },
          searchLoaded: { args: { data: 'json' }, run: (store) => store.set('status', 'ready') },
          searchFailed: { args: { message: 'string' }, run: (store) => store.set('status', 'failed') },
        },
        resources: [{ watch: ['query'], delayMs: 15, request: ({ query }) => ({ url: `/s?q=${query}` }), onStart: 'searchLoading', onSuccess: 'searchLoaded', onError: 'searchFailed' }],
      },
    },
    spec: { tag: 'p', children: 'x' },
    plugins: [
      resources(fetchFunction),
    ],
  });
  for (const value of ['r', 're', 'rea', 'reac', 'react']) ui.dispatch('box.querySet', { value });
  await ui.settle();
  await sleep(40);
  await flushAsync(ui);
  assert.deepEqual(fetchFunction.calls.map((call) => call.url), ['/s?q=react']);
});

test('resources: POST bodies are sent as JSON with a content-type header', async () => {
  const fetchFunction = createFakeFetch(() => ({ saved: true }));
  searchApp(fetchFunction, { request: () => ({ url: '/save', method: 'POST', body: { name: 'x' } }) });
  const { options } = fetchFunction.calls[0];
  assert.equal(options.method, 'POST');
  assert.equal(options.body, '{"name":"x"}');
  assert.equal(options.headers['content-type'], 'application/json');
});

test('resources: replay rebuilds the state from the logged responses without touching the network', async () => {
  const fetchFunction = createFakeFetch((url) => ({ url }));
  const { ui } = searchApp(fetchFunction);
  await flushAsync(ui);
  ui.dispatch('box.querySet', { value: 'b' });
  await flushAsync(ui);
  const before = JSON.stringify(ui.state());
  const callsBefore = fetchFunction.calls.length;
  const replayed = await ui.replay();
  await flushAsync(ui);
  assert.equal(JSON.stringify(replayed), before);
  assert.equal(fetchFunction.calls.length, callsBefore);
});

test('resources: actions must exist and declare the exact argument shapes, checked at install', async () => {
  const install = (overrides) => () =>
    mountSpec({
      namespaces: {
        box: {
          state: { query: '' },
          actions: {
            start: { args: {}, run() {} },
            done: { args: { data: 'json' }, run() {} },
            fail: { args: { message: 'string' }, run() {} },
            wrongDone: { args: { data: 'string' }, run() {} },
          },
          resources: [{ watch: ['query'], request: () => null, onStart: 'start', onSuccess: 'done', onError: 'fail', ...overrides }],
        },
      },
      spec: { tag: 'p', children: 'x' },
      plugins: [resources(createFakeFetch(() => ({})))],
    });
  assert.doesNotThrow(install({}));
  assert.throws(install({ onSuccess: 'wrongDone' }), /action box\.wrongDone must declare args {"data":"json"}/);
  assert.throws(install({ onError: 'missing' }), /onError action "missing" does not exist in "box"/);
});

test('resources: unknown keys, missing keys and unknown watch keys say what to write', () => {
  const install = (overrides, omit) => () => {
    const definition = { watch: ['query'], request: () => null, onStart: 'start', onSuccess: 'done', onError: 'fail', ...overrides };
    if (omit) delete definition[omit];
    return mountSpec({
      namespaces: {
        box: {
          state: { query: '' },
          actions: { start: { args: {}, run() {} }, done: { args: { data: 'json' }, run() {} }, fail: { args: { message: 'string' }, run() {} } },
          resources: [definition],
        },
      },
      spec: { tag: 'p', children: 'x' },
      plugins: [resources(createFakeFetch(() => ({})))],
    });
  };
  assert.throws(install({ delay: 5 }), /unknown key "delay"\. Did you mean "delayMs"\? Allowed keys: watch, request, onStart, onSuccess, onError, onCancel, onIdle, owns, response, delayMs/);
  assert.throws(install({}, 'onError'), /"onError" is missing\. Add "onError"/);
  assert.throws(install({ watch: ['quary'] }), /watch key "quary" is not a state key or derived value\. Did you mean "query"\? Known keys: query/);
});

const cancellableApp = (fetchFunction, { withOnCancel = true } = {}) =>
  mountSpec({
    namespaces: {
      box: {
        state: { query: 'a', paused: false, status: 'idle', data: null },
        actions: {
          querySet: { args: { value: 'string' }, run: (store, { value }) => store.set('query', value) },
          searchPause: { args: {}, run: (store) => store.set('paused', true) },
          searchLoading: { args: {}, run: (store) => store.set('status', 'loading') },
          searchLoaded: { args: { data: 'json' }, run: (store, { data }) => { store.set('status', 'ready'); store.set('data', data); } },
          searchFailed: { args: { message: 'string' }, run: (store) => store.set('status', 'failed') },
          searchCancelled: { args: {}, run: (store) => store.set('status', 'idle') },
        },
        resources: [{
        watch: ['query', 'paused'],
        request: ({ query, paused }) => (paused ? null : { url: `/s?q=${query}` }),
        onStart: 'searchLoading',
        onSuccess: 'searchLoaded',
        onError: 'searchFailed',
        ...(withOnCancel ? { onCancel: 'searchCancelled' } : {}),
      }],
      },
    },
    spec: { tag: 'p', children: 'x' },
    plugins: [
      resources(fetchFunction),
    ],
  });

test('resources: every request gets an AbortSignal, aborted when a newer request replaces it', async () => {
  const gates = [deferred(), deferred()];
  const fetchFunction = createFakeFetch(() => gates[fetchFunction.calls.length - 1]);
  const { ui } = cancellableApp(fetchFunction);
  await ui.settle();
  ui.dispatch('box.querySet', { value: 'b' });
  await ui.settle();
  const [first, second] = fetchFunction.calls.map((call) => call.options.signal);
  assert.equal(first.aborted, true);
  assert.equal(second.aborted, false);
  gates[0].resolve({ old: true });
  gates[1].resolve({ fresh: true });
  await flushAsync(ui);
  assert.deepEqual(ui.state().box.data, { fresh: true });
  assert.equal(ui.state().box.status, 'ready');
  assert.deepEqual(ui.log.map((entry) => entry.name ?? entry[0]).filter((name) => name === 'box.searchCancelled' || name === 'box.searchFailed'), []);
});

test('resources: an aborting fetch is not reported as an error and a null request aborts and runs onCancel', async () => {
  // A fetch that rejects the way the browser does when its signal is aborted.
  const fetchFunction = createFakeFetch(
    (url, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('The operation was aborted.')))),
  );
  const { ui } = cancellableApp(fetchFunction);
  await ui.settle();
  assert.equal(ui.state().box.status, 'loading');
  ui.dispatch('box.searchPause', {});
  await flushAsync(ui);
  assert.equal(fetchFunction.calls[0].options.signal.aborted, true);
  assert.equal(ui.state().box.status, 'idle'); // onCancel reset it; no onError was logged
  assert.equal(ui.errors.length, 0);
});

test('resources: onCancel does not run when nothing is in flight, and a definition without it still cancels', async () => {
  const settled = cancellableApp(createFakeFetch(() => ({ done: true })));
  await flushAsync(settled.ui);
  assert.equal(settled.ui.state().box.status, 'ready');
  settled.ui.dispatch('box.searchPause', {});
  await flushAsync(settled.ui);
  assert.equal(settled.ui.state().box.status, 'ready'); // the request had settled: nothing to cancel

  const gate = deferred();
  const withoutHook = createFakeFetch(() => gate);
  const { ui } = cancellableApp(withoutHook, { withOnCancel: false });
  await ui.settle();
  ui.dispatch('box.searchPause', {});
  await flushAsync(ui);
  assert.equal(withoutHook.calls[0].options.signal.aborted, true);
  gate.resolve({ late: true });
  await flushAsync(ui);
  assert.equal(ui.state().box.data, null);
});

test('resources: onCancel is checked like the other actions, and replay does not run it against the network', async () => {
  const install = (onCancel) => () =>
    mountSpec({
      namespaces: {
        box: {
          state: { query: '' },
          actions: { start: { args: {}, run() {} }, done: { args: { data: 'json' }, run() {} }, fail: { args: { message: 'string' }, run() {} }, wrongCancel: { args: { value: 'string' }, run() {} } },
          resources: [{ watch: ['query'], request: () => null, onStart: 'start', onSuccess: 'done', onError: 'fail', onCancel }],
        },
      },
      spec: { tag: 'p', children: 'x' },
      plugins: [resources(createFakeFetch(() => ({})))],
    });
  assert.throws(install('missing'), /onCancel action "missing" does not exist in "box"/);
  assert.throws(install('wrongCancel'), /action box\.wrongCancel must declare args {} \(found {\"value\":\"string\"}\)/);
  assert.throws(install('box.start'), /onCancel must be the verb of an action of "box", got "box\.start"\. Write the action's name without the namespace/);

  const gate = deferred();
  const fetchFunction = createFakeFetch(() => gate);
  const { ui } = cancellableApp(fetchFunction);
  await ui.settle();
  ui.dispatch('box.searchPause', {});
  await flushAsync(ui);
  const callsBefore = fetchFunction.calls.length;
  const replayed = await ui.replay();
  await flushAsync(ui);
  assert.equal(replayed.box.status, 'idle');
  assert.equal(fetchFunction.calls.length, callsBefore);
});

test('resources: onIdle runs when request becomes null after a request started or settled, and not at initial null', async () => {
  const fetchFunction = createFakeFetch((url) => ({ url }));
  const { ui } = mountSpec({
    namespaces: {
      box: {
        state: { query: '', status: 'idle', data: null },
        actions: {
          querySet: { args: { value: 'string' }, run: (store, { value }) => store.set('query', value) },
          searchLoading: { args: {}, run: (store) => store.set('status', 'loading') },
          searchLoaded: { args: { data: 'json' }, run: (store, { data }) => { store.set('status', 'ready'); store.set('data', data); } },
          searchFailed: { args: { message: 'string' }, run: (store) => store.set('status', 'failed') },
          searchIdle: { args: {}, run: (store) => { store.set('status', 'idle'); store.set('data', null); } },
        },
        resources: [{
        watch: ['query'],
        request: ({ query }) => (query ? { url: `/s?q=${query}` } : null),
        onStart: 'searchLoading',
        onSuccess: 'searchLoaded',
        onError: 'searchFailed',
        onIdle: 'searchIdle',
      }],
      },
    },
    spec: { tag: 'p', children: 'x' },
    plugins: [
      resources(fetchFunction),
    ],
  });
  await flushAsync(ui);
  assert.deepEqual(ui.log, []); // initial null at mount does not log onIdle
  ui.dispatch('box.querySet', { value: 'ada' });
  await flushAsync(ui);
  assert.deepEqual(ui.state().box.data, { url: '/s?q=ada' });
  ui.dispatch('box.querySet', { value: '' });
  await flushAsync(ui);
  assert.equal(ui.state().box.status, 'idle');
  assert.equal(ui.state().box.data, null);
  assert.deepEqual(ui.log.map(([name]) => name), ['box.querySet', 'box.searchLoading', 'box.searchLoaded', 'box.querySet', 'box.searchIdle']);
});

test('resources: owns refuses writes from other actions and checks keys at install', async () => {
  const fetchFunction = createFakeFetch((url) => ({ url, count: fetchFunction.calls.length }));
  const { ui } = mountSpec({
    namespaces: {
      box: {
        state: { query: 'ada', status: 'idle', data: null },
        actions: {
          querySet: { args: { value: 'string' }, run: (store, { value }) => store.set('query', value) },
          searchTamper: { args: {}, run: (store) => store.set('data', 'illegal') },
          searchLoading: { args: {}, run: (store) => store.set('status', 'loading') },
          searchLoaded: { args: { data: 'json' }, run: (store, { data }) => { store.set('status', 'ready'); store.set('data', data); } },
          searchFailed: { args: { message: 'string' }, run: (store) => store.set('status', 'failed') },
        },
        resources: [{
        watch: ['query'],
        owns: ['data', 'status'],
        request: ({ query }) => ({ url: `/s?q=${query}` }),
        onStart: 'searchLoading',
        onSuccess: 'searchLoaded',
        onError: 'searchFailed',
      }],
      },
    },
    spec: { tag: 'p', children: 'x' },
    plugins: [
      resources(fetchFunction),
    ],
  });
  await flushAsync(ui);
  assert.equal(fetchFunction.calls.length, 1);
  ui.dispatch('box.querySet', { value: 'alan' });
  await flushAsync(ui);
  assert.equal(fetchFunction.calls.length, 2);
  // Writing an owned key from another action is refused with both sides named:
  const quiet = console.error;
  console.error = () => {};
  try {
    assert.match(
      ui.dispatch('box.searchTamper', {}),
      /^box\.searchTamper: store\.set\("data"\): state key "data" is owned by namespace "box" resource #1 \(box\.searchLoading\) and can only be written by its lifecycle actions \(box\.searchLoading, box\.searchLoaded, box\.searchFailed\)\. To change what namespace "box" resource #1 \(box\.searchLoading\) loads, write one of its watched keys \(query\) from the action; the resource then loads again and its lifecycle actions update the owned keys$/,
    );
  } finally {
    console.error = quiet;
  }
  assert.deepEqual(ui.state().box.data, { url: '/s?q=alan', count: 2 });

  // Install-time checks for owns and onIdle:
  const install = (overrides, second) => () =>
    mountSpec({
      namespaces: {
        box: {
          state: { query: '', data: null },
          derive: { label: (get) => get('query') },
          actions: {
            start: { args: {}, run() {} },
            done: { args: { data: 'json' }, run() {} },
            fail: { args: { message: 'string' }, run() {} },
            otherStart: { args: {}, run() {} },
          },
          resources: [
          { watch: ['query'], request: () => null, onStart: 'start', onSuccess: 'done', onError: 'fail', ...overrides },
          ...(second ? [second] : []),
        ],
        },
      },
      spec: { tag: 'p', children: 'x' },
      plugins: [
        resources(createFakeFetch(() => ({}))),
      ],
    });
  assert.throws(install({ owns: 'data' }), /"owns" must be a list of state keys/);
  assert.throws(install({ owns: ['label'] }), /owns key "label" is a derived value, not a state key/);
  assert.throws(install({ owns: ['dta'] }), /owns key "dta" is not a state key of "box"\. Did you mean "data"\? State keys of "box": query, data/);
  assert.throws(install({ owns: ['query'] }), /key "query" is in both "watch" and "owns"/);
  assert.throws(
    install({ owns: ['data'] }, { watch: ['query'], owns: ['data'], request: () => null, onStart: 'otherStart', onSuccess: 'done', onError: 'fail' }),
    /namespace "box" resource #2 \(box\.otherStart\): state key "data" is already owned by namespace "box" resource #1 \(box\.start\)/,
  );
  assert.throws(install({ reloadOn: ['reload'] }), /unknown key "reloadOn"\. Allowed keys: watch, request, onStart, onSuccess, onError, onCancel, onIdle, owns, response, delayMs/);
  assert.throws(install({ onIdle: 'missing' }), /onIdle action "missing" does not exist in "box"/);
});

test('assertRepeatable passes on idempotent actions and names the key that changed on non-idempotent ones', async () => {
  const { ui } = mountSpec({
    namespaces: {
      box: {
        state: { selected: 'a', count: 0 },
        actions: {
          itemSelect: { args: { id: 'string' }, run: (store, { id }) => store.set('selected', id) },
          countBump: { args: {}, run: (store) => store.set('count', store.get('count') + 1) },
        },
      },
    },
    spec: { tag: 'p', children: 'x' },
  });
  await assertRepeatable(ui, 'box.itemSelect', { id: 'b' });
  await assert.rejects(
    () => assertRepeatable(ui, 'box.countBump', {}),
    /assertRepeatable\("box\.countBump"\): repeating the action changed state key "box\.count" from 1 to 2\. Make "box\.countBump" idempotent, or if it resets a resource's state, declare owns on the resource and change a watched key instead/,
  );
});

// ------------------------------------------------------------------------------------------------ windowEvents

const windowApp = (win, handlers) =>
  mountSpec({
    namespaces: {
      box: {
        state: { width: 0, height: 0, online: true, hits: [] },
        actions: {
          viewportSet: { args: { width: 'number', height: 'number' }, run: (store, { width, height }) => { store.set('width', width); store.set('height', height); } },
          networkSet: { args: { online: 'boolean' }, run: (store, { online }) => store.set('online', online) },
          shortcutHit: { args: { name: 'string' }, run: (store, { name }) => store.set('hits', [...store.get('hits'), name]) },
        },
      },
    },
    spec: { tag: 'p', children: 'x' },
    plugins: [windowEvents(win, handlers)],
  });

test('windowEvents: window events become actions with {event} paths and literals; chords and options work', async () => {
  const win = createWindow();
  const { ui } = windowApp(win, {
    resize: ['box.viewportSet', { width: { event: 'target.innerWidth' }, height: { event: 'target.innerHeight' } }],
    offline: ['box.networkSet', { online: false }],
    online: ['box.networkSet', { online: true }],
    'keydown.Control+k': ['box.shortcutHit', { name: 'palette' }, { preventDefault: true }],
    'keydown.Escape': ['box.shortcutHit', { name: 'escape' }],
  });
  win.fireWindowEvent('resize', { target: { innerWidth: 800, innerHeight: 600 } });
  win.fireWindowEvent('offline');
  assert.deepEqual([ui.state().box.width, ui.state().box.height, ui.state().box.online], [800, 600, false]);
  win.fireWindowEvent('online');
  assert.equal(ui.state().box.online, true);

  let prevented = false;
  win.fireWindowEvent('keydown', { key: 'k', ctrlKey: true, preventDefault: () => (prevented = true) });
  win.fireWindowEvent('keydown', { key: 'Escape' });
  win.fireWindowEvent('keydown', { key: 'k' }); // no plain handler registered: ignored
  assert.deepEqual(ui.state().box.hits, ['palette', 'escape']);
  assert.equal(prevented, true);
});

test('windowEvents: unknown actions and mismatched arguments fail at install', () => {
  assert.throws(() => windowApp(createWindow(), { resize: ['nope', {}] }), /unknown action nope/);
  assert.throws(() => windowApp(createWindow(), { resize: ['box.viewportSet', { width: 1 }] }), /windowEvents resize: missing argument height for box\.viewportSet/);
  assert.throws(() => windowApp(createWindow(), { resize: ['box.viewportSet', { width: 1, height: 2, depth: 3 }] }), /windowEvents resize: unknown argument depth for box\.viewportSet \(declared: width, height\)/);
});

test('resources: a request in flight that becomes null runs onCancel and then onIdle', async () => {
  const gate = deferred();
  const { ui } = mountSpec({
    namespaces: {
      box: {
        state: { query: 'a', paused: false, status: 'idle', data: 'old' },
        actions: {
          searchPause: { args: {}, run: (store) => store.set('paused', true) },
          searchLoading: { args: {}, run: (store) => store.set('status', 'loading') },
          searchLoaded: { args: { data: 'json' }, run: (store, { data }) => store.set('data', data) },
          searchFailed: { args: { message: 'string' }, run() {} },
          searchCancelled: { args: {}, run: (store) => store.set('status', 'cancelled') },
          searchIdle: { args: {}, run: (store) => store.set('data', null) },
        },
        resources: [{
        watch: ['query', 'paused'],
        owns: ['status', 'data'],
        request: ({ paused }) => (paused ? null : { url: '/s' }),
        onStart: 'searchLoading',
        onSuccess: 'searchLoaded',
        onError: 'searchFailed',
        onCancel: 'searchCancelled',
        onIdle: 'searchIdle',
      }],
      },
    },
    spec: { tag: 'p', children: 'x' },
    plugins: [
      resources(createFakeFetch(() => gate)),
    ],
  });
  await ui.settle();
  ui.dispatch('box.searchPause', {});
  await flushAsync(ui);
  assert.deepEqual(ui.log.map(([name]) => name), ['box.searchLoading', 'box.searchPause', 'box.searchCancelled', 'box.searchIdle']);
  assert.equal(ui.state().box.data, null);
});

test('api.watch: claiming a state key that another watch owns fails naming both sides', () => {
  const claim = (where) => ({ keys: ['data'], where, allowedActions: [], message: () => 'refused' });
  assert.throws(
    () =>
      mountSpec({
        namespaces: {
          box: {
            state: { data: null },
          },
        },
        spec: { tag: 'p', children: 'x' },
        plugins: [
          (api) => {
            api.watch(['box.data'], () => {}, { owns: claim('plugin one') });
            api.watch(['box.data'], () => {}, { owns: claim('plugin two') });
          },
        ],
      }),
    /plugin two: state key "data" is already owned by plugin one\. Give each resource its own state keys, or remove the duplicate from "owns"/,
  );
});

test('resources: a missing fetch function and a bad delayMs fail at install, naming the resource', () => {
  const namespaces = (delayMs) => ({
    box: {
      state: { query: 'a', data: null },
      actions: {
        loading: { args: {}, run() {} },
        loaded: { args: { data: 'json' }, run: (store, { data }) => store.set('data', data) },
        failed: { args: { message: 'string' }, run() {} },
      },
      resources: [{ watch: ['query'], request: () => ({ url: '/x' }), onStart: 'loading', onSuccess: 'loaded', onError: 'failed', ...(delayMs !== undefined && { delayMs }) }],
    },
  });
  const mount = (delayMs, fetchFunction) => () => mountSpec({ namespaces: namespaces(delayMs), spec: { tag: 'p', children: 'x' }, plugins: [resources(fetchFunction)] });
  assert.throws(mount(undefined, null), /namespace "box" resource #1 \(box\.loading\): there is no fetch function \(got null\)\. Pass one: resources\(fetch\)/);
  assert.throws(mount(undefined, 'fetch'), /there is no fetch function \(got string\)/);
  assert.throws(mount('200', async () => ({})), /"delayMs" is "200"\. Write a number of milliseconds, 0 or more/);
  assert.throws(mount(-5, async () => ({})), /"delayMs" is -5/);
  assert.doesNotThrow(mount(200, async () => ({})));
  assert.doesNotThrow(mount(0, async () => ({})), '0 means no debounce');
});

test('resources: a response that arrives while the app replays its log is not dispatched', async () => {
  const gate = deferred();
  const { ui } = searchApp(createFakeFetch(() => gate));
  await ui.settle();
  // A log long enough that the replay is still running when the response comes in.
  const replayed = Array.from({ length: 40 }, () => ['box.querySet', { value: 'a' }]);
  const replaying = ui.replay(replayed);
  gate.resolve({ rows: 1 });
  await replaying;
  await flushAsync(ui);
  assert.equal(ui.log.some(([name]) => name === 'box.searchLoaded'), false, 'the response is not logged on top of the replayed log');
  assert.equal(ui.state().box.data, null);
});

test('windowEvents: event names, chords, handler shapes and argument sources are checked at install, one line per problem', () => {
  const install = (handlers) => () => windowApp(createWindow(), handlers);
  assert.throws(install({ resiz: ['box.networkSet', { online: true }] }), /windowEvents resiz: unknown event "resiz"\. Did you mean "resize"\?/);
  assert.throws(install({ 'keydown.Shift+Control+k': ['box.shortcutHit', { name: 'x' }] }), /modifiers must be unique and in the order Control\+Alt\+Shift\+Meta/);
  assert.throws(install({ 'resize.Enter': ['box.shortcutHit', { name: 'x' }] }), /only keydown and keyup accept a key/);
  assert.throws(install({ offline: ['box.networkSet', null] }), /windowEvents offline: arguments must be an object of argument names to values, got null/);
  assert.throws(install({ offline: ['box.networkSet', { online: false }, 'x'] }), /options must be an object/);
  assert.throws(install({ offline: ['box.networkSet', { online: false }, { preventDefalt: true }] }), /options: unknown key preventDefalt .*Did you mean "preventDefault"/);
  assert.throws(install({ offline: 'box.networkSet' }), /a handler is \[actionName, args\?, options\?\]/);
  assert.throws(install({ offline: ['box.networkSet', { online: { state: 'box.online' } }] }), /there is no state, item or row to read at a window event/);
  assert.throws(install({ offline: ['box.networkSet', { online: { event: 'x', extra: 1 } }] }), /exactly \{ event: "path" \}/);
  assert.throws(install({ offline: ['box.networkSet', { online: { event: 1 } }] }), /exactly \{ event: "path" \}/);
  assert.throws(install({ toString: ['box.networkSet', { online: true }] }), /unknown event "toString"/);
  assert.throws(install({ resiz: ['nope', {}], offline: ['box.networkSet', null] }), (error) => error.message.split('\n').length === 3, 'every problem is reported, not only the first');
  assert.doesNotThrow(install({ visibilitychange: ['box.networkSet', { online: true }], 'keydown.Control+Shift+k': ['box.shortcutHit', { name: 'x' }] }));
});

test('resources: a fetchFunction that throws before it returns a promise is a failed request, not an exception', async () => {
  const { ui } = searchApp(() => { throw new Error('no network layer'); });
  await flushAsync(ui);
  assert.equal(ui.state().box.status, 'failed');
  assert.equal(ui.state().box.message, 'no network layer');
});

test('resources: request() must answer { url, method?, headers?, body? }; a missing url or an unknown key is named with the fix', () => {
  const mount = (request) => () => searchApp(createFakeFetch(() => ({})), { request });
  assert.throws(mount(() => ({ path: '/x' })), /namespace "box" resource #1 \(box\.searchLoading\): request\(\) returned no "url" \(got undefined\)\. Return \{ url: "\/api\/items" \}/);
  assert.throws(mount(() => ({ url: '/x', header: {} })), /request\(\) returned the unknown key "header"\. Did you mean "headers"\? Allowed keys: url, method, headers, body/);
  assert.throws(mount(() => '/x'), /request\(\) returned "\/x"\. Return \{ url, method\?, headers\?, body\? \}, or null/);
});

test('resources: with a delay, the answer to an older request does not show while the newer one waits', async () => {
  const slow = deferred();
  const fetchFunction = createFakeFetch((url) => (url.endsWith('q=a') ? slow : { url }));
  const { ui } = searchApp(fetchFunction, { delayMs: 20 });
  await sleep(40); // the first request (q=a) is in flight
  ui.dispatch('box.querySet', { value: 'b' });
  slow.resolve({ url: 'old' });
  await sleep(5);
  assert.notDeepEqual(ui.state().box.data, { url: 'old' }, 'the old answer arrived inside the debounce window and was dropped');
  await sleep(60);
  await flushAsync(ui);
  assert.deepEqual(ui.state().box.data, { url: '/search?q=b' });
});

test('resources: a request in flight when a replay starts does not land on the replayed state, also when no watched key changes', async () => {
  const answer = deferred();
  const { ui } = mountSpec({
    namespaces: {
      box: {
        state: { data: null, count: 0 },
        actions: {
          bump: { args: {}, run: (store) => store.set('count', store.get('count') + 1) },
          loading: { args: {}, run() {} },
          loaded: { args: { data: 'json' }, run: (store, { data }) => store.set('data', data) },
          failed: { args: { message: 'string' }, run() {} },
        },
        resources: [{ watch: [], request: () => ({ url: '/once' }), onStart: 'loading', onSuccess: 'loaded', onError: 'failed' }],
      },
    },
    spec: { tag: 'p', children: 'x' },
    plugins: [resources(() => answer)],
  });
  await ui.replay([['box.bump', {}]]);
  answer.resolve({ ok: true, json: async () => ({ late: true }) });
  await flushAsync(ui);
  assert.equal(ui.state().box.data, null, 'the late answer was dropped');
  assert.equal(ui.state().box.count, 1);
});

test('resources: a request() answer that is falsy but not null (false, 0, undefined) is refused instead of meaning "nothing to load"', () => {
  for (const answer of [false, 0, undefined, '']) {
    assert.throws(() => searchApp(createFakeFetch(() => ({})), { request: () => answer }), /request\(\) returned/, String(answer));
  }
});
