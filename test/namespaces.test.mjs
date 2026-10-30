// Namespaces: every key and action belongs to one namespace, an action writes only its own, and `calls` is the way to
// change another one. These tests assert the messages too, because they are what an agent reads (AGENTS.md, rule 12).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fireEvent, findElements } from './support/dom-shim.mjs';
import { mountSpec } from './support/helpers.mjs';

const { app, mergeInitialState } = await import('../src/ui.js');
const { resources } = await import('../src/resources.js');

const noop = { tag: 'p', children: 'x' };
const quiet = (callback) => {
  const original = console.error;
  console.error = () => {};
  try {
    return callback();
  } finally {
    console.error = original;
  }
};

// Two namespaces that need each other: adding a todo clears the search box.
const todoNamespaces = () => ({
  todos: {
    state: { items: [], draft: '' },
    derive: { visible: (get) => get('items').filter((todo) => todo.text.includes(get('search.query'))) },
    actions: {
      add: {
        args: { text: 'string' },
        calls: ['search.clear'],
        run: (store, { text }, call) => {
          store.set('items', [...store.get('items'), { id: store.get('items').length + 1, text }]);
          call('search.clear', {});
        },
      },
    },
  },
  search: {
    state: { query: '' },
    actions: {
      set: { args: { value: 'string' }, run: (store, { value }) => store.set('query', value) },
      clear: { args: {}, run: (store) => store.set('query', '') },
    },
  },
});

test('state(), derived() and actions() show the namespaces; keys are qualified everywhere outside a namespace', async () => {
  const { ui } = mountSpec({ namespaces: todoNamespaces(), spec: noop });
  assert.deepEqual(ui.state(), { todos: { items: [], draft: '' }, search: { query: '' } });
  assert.deepEqual(ui.derived(), { todos: { visible: [] }, search: {} });
  assert.deepEqual(ui.actions(), { 'todos.add': { text: 'string' }, 'search.set': { value: 'string' }, 'search.clear': {} });
  assert.deepEqual(ui.keys(), ['todos.items', 'todos.draft', 'search.query', 'todos.visible']);
  assert.equal(ui.get('search.query'), '');
  assert.throws(() => ui.get('query'), /get\("query"\): there is no namespace "query"/);
});

test('an action reads and writes its own namespace unqualified, and reads other namespaces qualified', () => {
  const seen = [];
  const { ui } = mountSpec({
    namespaces: {
      a: { state: { n: 1 }, actions: { go: { args: {}, run: (store) => { seen.push(store.get('n'), store.get('b.m')); store.set('n', 2); } } } },
      b: { state: { m: 10 } },
    },
    spec: noop,
  });
  assert.equal(ui.dispatch('a.go'), undefined);
  assert.deepEqual(seen, [1, 10]);
  assert.deepEqual(ui.state(), { a: { n: 2 }, b: { m: 10 } });
});

test('writing another namespace is refused and names the way out: calls, or move the state', () => {
  const { ui } = mountSpec({
    namespaces: {
      todos: { actions: { sneaky: { args: {}, run: (store) => store.set('search.query', 'x') } } },
      search: { state: { query: '' }, actions: { clear: { args: {}, run() {} } } },
    },
    spec: noop,
  });
  const message = quiet(() => ui.dispatch('todos.sneaky'));
  assert.equal(
    message,
    'todos.sneaky: store.set("search.query"): state key "search.query" belongs to namespace "search", and todos.sneaky belongs to "todos". An action writes only its own namespace. If this change follows from todos.sneaky, list one of the actions of "search" in calls and use call(...) (search.clear); if it does not, the state is in the wrong namespace: move it, or derive it',
  );
  assert.equal(ui.state().search.query, '');
});

test('one form for each key: an own key written with its namespace, and a derived or unknown name, are refused with the fix', () => {
  const { ui } = mountSpec({
    namespaces: {
      todos: {
        state: { draft: '', items: [] },
        derive: { count: (get) => get('items').length },
        actions: {
          qualified: { args: {}, run: (store) => store.set('todos.draft', 'x') },
          qualifiedRead: { args: {}, run: (store) => store.get('todos.draft') },
          typo: { args: {}, run: (store) => store.set('draf', 'x') },
          unknownNamespace: { args: {}, run: (store) => store.get('serch.query') },
          derived: { args: {}, run: (store) => store.set('count', 3) },
        },
      },
      search: { state: { query: '' } },
    },
    spec: noop,
  });
  quiet(() => {
    assert.equal(ui.dispatch('todos.qualified'), 'todos.qualified: store.set("todos.draft"): "todos.draft" is in this namespace ("todos"). Write "draft" without the namespace; only other namespaces are written with it');
    assert.match(ui.dispatch('todos.qualifiedRead'), /store\.get\("todos\.draft"\): "todos\.draft" is in this namespace/);
    assert.match(ui.dispatch('todos.typo'), /store\.set\("draf"\): namespace "todos" has no state key or derived value "draf"\. Did you mean "draft"\? It has: draft, items, count/);
    assert.match(ui.dispatch('todos.unknownNamespace'), /store\.get\("serch\.query"\): there is no namespace "serch"\. Did you mean "search"\? Namespaces: todos, search/);
    assert.match(ui.dispatch('todos.derived'), /store\.set\("count"\): "count" is a derived value and cannot be written/);
  });
});

test('derived values read their own namespace plain and other namespaces qualified, across namespaces', async () => {
  const { ui } = mountSpec({ namespaces: todoNamespaces(), spec: noop });
  ui.dispatch('todos.add', { text: 'milk' });
  ui.dispatch('todos.add', { text: 'bread' });
  ui.dispatch('search.set', { value: 'mi' });
  assert.deepEqual(ui.derived().todos.visible.map((todo) => todo.text), ['milk']);
  const broken = quiet(() =>
    assert.throws(
      () =>
        mountSpec({
          namespaces: { a: { state: { n: 1 }, derive: { double: (get) => get('a.n') * 2 } } },
          spec: noop,
        }),
      /derived "a\.double": get\("a\.n"\): "a\.n" is in this namespace \("a"\)\. Write "n" without the namespace/,
    ),
  );
  void broken;
});

test('calls: the called action writes its own namespace inside the caller, one flush, one log entry', async () => {
  const { ui } = mountSpec({ namespaces: todoNamespaces(), spec: noop });
  ui.dispatch('search.set', { value: 'mi' });
  assert.equal(ui.dispatch('todos.add', { text: 'milk' }), undefined);
  assert.deepEqual(ui.state().search, { query: '' }); // cleared by the called action
  assert.equal(ui.state().todos.items.length, 1);
  assert.deepEqual(ui.log.map(([name]) => name), ['search.set', 'todos.add']); // the call is part of todos.add, not a log entry of its own
  await ui.settle();
  // Replay needs only the outer action: it repeats the call.
  const replayed = await ui.replay();
  assert.deepEqual(replayed.search, { query: '' });
  assert.equal(replayed.todos.items.length, 1);
});

test('call() only accepts what calls lists, with the arguments the called action declares', () => {
  const { ui } = mountSpec({
    namespaces: {
      a: {
        actions: {
          unlisted: { args: {}, run: (store, args, call) => call('b.set', { value: 'x' }) },
          typo: { args: {}, calls: ['b.set'], run: (store, args, call) => call('b.st', { value: 'x' }) },
          wrongArgument: { args: {}, calls: ['b.set'], run: (store, args, call) => call('b.set', { value: 1 }) },
        },
      },
      b: { state: { value: '' }, actions: { set: { args: { value: 'string' }, run: (store, { value }) => store.set('value', value) } } },
    },
    spec: noop,
  });
  quiet(() => {
    assert.match(ui.dispatch('a.unlisted'), /^a\.unlisted: call\("b\.set"\): a\.unlisted does not list it in calls\. Add it: calls: \['b\.set'\]$/);
    assert.match(ui.dispatch('a.typo'), /call\("b\.st"\): a\.typo does not list it in calls\. Did you mean "b\.set"\? Add it: calls: \['b\.set', 'b\.st'\]/);
    assert.match(ui.dispatch('a.wrongArgument'), /call\("b\.set"\): b\.set\.value: want string, got number/);
  });
  assert.equal(ui.state().b.value, '');
});

test('a failure anywhere in an action, or in an action it called, leaves no write behind', () => {
  const { ui } = mountSpec({
    namespaces: {
      a: {
        state: { n: 0 },
        actions: {
          selfish: { args: {}, run: (store) => { store.set('n', 1); throw new Error('boom'); } },
          viaCall: { args: {}, calls: ['b.fail'], run: (store, args, call) => { store.set('n', 2); call('b.fail', {}); } },
          caught: { args: {}, calls: ['b.fail'], run: (store, args, call) => { store.set('n', 3); try { call('b.fail', {}); } catch { /* the called action's writes are already undone */ } } },
        },
      },
      b: { state: { m: 0 }, actions: { fail: { args: {}, run: (store) => { store.set('m', 9); throw new Error('inner'); } } } },
    },
    spec: noop,
  });
  quiet(() => {
    assert.equal(ui.dispatch('a.selfish'), 'a.selfish: boom');
    assert.deepEqual(ui.state(), { a: { n: 0 }, b: { m: 0 } });
    assert.equal(ui.dispatch('a.viaCall'), 'a.viaCall: b.fail: inner');
    assert.deepEqual(ui.state(), { a: { n: 0 }, b: { m: 0 } }); // the caller's own write is undone too
  });
  assert.equal(ui.dispatch('a.caught'), undefined);
  assert.deepEqual(ui.state(), { a: { n: 3 }, b: { m: 0 } }); // only the failed call was undone
  assert.deepEqual(ui.log.map(([name]) => name), ['a.caught']);
});

test('nothing renders between the writes of an action and the actions it calls', async () => {
  const seen = [];
  const namespaces = todoNamespaces();
  const { ui } = mountSpec({
    namespaces,
    spec: { tag: 'p', children: { join: [{ state: 'todos.items.length' }, '/', { state: 'search.query' }] } },
  });
  ui.dispatch('search.set', { value: 'q' });
  await ui.settle();
  ui.watch(['todos.items', 'search.query'], (values) => seen.push([values['todos.items'].length, values['search.query']]));
  seen.length = 0;
  ui.dispatch('todos.add', { text: 'a' });
  await ui.settle();
  assert.deepEqual(seen, [[1, '']]); // never [1, 'q'] or [0, '']: the watcher runs once, after both writes
});

test('a list of handlers runs in order, each its own logged action, arguments read before the first runs', async () => {
  const { ui, root } = mountSpec({
    namespaces: {
      form: {
        state: { draft: 'hello', saved: [] },
        actions: {
          save: { args: { text: 'string' }, run: (store, { text }) => store.set('saved', [...store.get('saved'), text]) },
          reset: { args: {}, run: (store) => store.set('draft', '') },
          fail: { args: {}, run: () => { throw new Error('nope'); } },
        },
      },
    },
    spec: {
      tag: 'div',
      children: [
        { tag: 'button', id: 'both', on: { click: [['form.reset'], ['form.save', { text: { state: 'form.draft' } }]] }, children: 'go' },
        { tag: 'button', id: 'stops', on: { click: [['form.fail'], ['form.reset']] }, children: 'stop' },
      ],
    },
  });
  const [both, stops] = findElements(root, (element) => element.localName === 'button');
  fireEvent(both, 'click');
  assert.deepEqual(ui.state().form, { draft: '', saved: ['hello'] }); // save got "hello", read before reset ran
  assert.deepEqual(ui.log.map(([name]) => name), ['form.reset', 'form.save']);
  assert.deepEqual(ui.tree().map((entry) => entry.on.click), [['form.reset', 'form.save'], ['form.fail', 'form.reset']]);
  ui.errors.length = 0;
  quiet(() => fireEvent(stops, 'click'));
  assert.deepEqual(ui.log.map(([name]) => name), ['form.reset', 'form.save']); // the failing action stopped the list
  assert.equal(ui.errors.length, 1);
});

test('the same namespace object mounted under two names gives two independent copies', () => {
  const disclosure = {
    state: { open: false },
    derive: { label: (get) => (get('open') ? 'Hide' : 'Show') },
    actions: { toggle: { args: {}, run: (store) => store.set('open', !store.get('open')) } },
  };
  const { ui } = mountSpec({ namespaces: { sidebar: disclosure, help: disclosure }, spec: { tag: 'p', children: { state: 'help.label' } } });
  ui.dispatch('help.toggle');
  assert.deepEqual(ui.state(), { sidebar: { open: false }, help: { open: true } });
  assert.deepEqual(ui.derived(), { sidebar: { label: 'Show' }, help: { label: 'Hide' } });
});

test('initialState lays over the declared state by namespace and key; unknown ones are refused with a suggestion', () => {
  const { ui } = mountSpec({ namespaces: todoNamespaces(), initialState: { search: { query: 'q' } }, spec: noop });
  assert.deepEqual(ui.state(), { todos: { items: [], draft: '' }, search: { query: 'q' } });
  assert.throws(() => mountSpec({ namespaces: todoNamespaces(), initialState: { search: { quary: 'q' } }, spec: noop }), /initialState\.search\.quary: "search" has no state key "quary"\. Did you mean "query"\?/);
  assert.deepEqual(mergeInitialState({ a: { x: 1, y: 1 } }, { a: { y: 2 }, b: { z: 3 } }, undefined), { a: { x: 1, y: 2 }, b: { z: 3 } });
});

test('resources declared in a namespace need the resources plugin, and say so', () => {
  const namespaces = {
    items: {
      state: { list: [] },
      actions: { loading: { args: {}, run() {} }, loaded: { args: { data: 'json' }, run() {} }, failed: { args: { message: 'string' }, run() {} } },
      resources: [{ watch: [], request: () => null, onStart: 'loading', onSuccess: 'loaded', onError: 'failed' }],
    },
  };
  assert.throws(() => mountSpec({ namespaces, spec: noop }), /namespace "items": declares resources, but no plugin loads them\. Add the resources plugin to plugins \(resources\(fetchFunction\), imported from @ehtb\/agent-ui\/resources\); in a page write `plugins: \[withResources\]`/);
  assert.doesNotThrow(() => mountSpec({ namespaces, spec: noop, plugins: [resources(async () => ({}))] }));
});

test('a resource watches other namespaces by qualified key and drives actions of its own namespace only', async () => {
  const requests = [];
  const namespaces = {
    filters: { state: { category: 'a' }, actions: { set: { args: { value: 'string' }, run: (store, { value }) => store.set('category', value) } } },
    products: {
      state: { list: [], status: 'idle' },
      actions: {
        loading: { args: {}, run: (store) => store.set('status', 'loading') },
        loaded: { args: { data: 'json' }, run: (store, { data }) => { store.set('list', data); store.set('status', 'ready'); } },
        failed: { args: { message: 'string' }, run: (store) => store.set('status', 'failed') },
      },
      resources: [{ watch: ['filters.category'], owns: ['list', 'status'], request: (values) => ({ url: `/p?c=${values['filters.category']}` }), onStart: 'loading', onSuccess: 'loaded', onError: 'failed' }],
    },
  };
  const fetchFunction = async (url) => {
    requests.push(url);
    return { ok: true, status: 200, json: async () => [url] };
  };
  const { ui } = mountSpec({ namespaces, spec: noop, plugins: [resources(fetchFunction)] });
  await ui.settle();
  ui.dispatch('filters.set', { value: 'b' });
  for (let round = 0; round < 4; round++) await ui.settle();
  assert.deepEqual(requests, ['/p?c=a', '/p?c=b']);
  assert.deepEqual(ui.state().products.list, ['/p?c=b']);
  const bad = (resource) => () => mountSpec({ namespaces: { ...namespaces, products: { ...namespaces.products, resources: [resource] } }, spec: noop, plugins: [resources(fetchFunction)] });
  const base = namespaces.products.resources[0];
  assert.throws(bad({ ...base, onStart: 'products.loading' }), /onStart must be the verb of an action of "products", got "products\.loading"/);
  assert.throws(bad({ ...base, owns: ['filters.category'] }), /owns key "filters\.category" is written with a namespace\. A resource owns state of its own namespace only/);
  assert.throws(bad({ ...base, watch: ['products.list'] }), /watch key "products\.list" is in this namespace\. Write "list" without the namespace/);
  assert.throws(bad({ ...base, watch: ['filters.categroy'] }), /watch key "filters\.categroy" is not a state key or derived value\. Did you mean "filters\.category"\?/);
});

test('a resource with revalidate: "never" trusts server-rendered state on mount, and loads after a watched key changes', async () => {
  const namespaces = () => ({
    items: {
      state: { query: 'a', list: [], status: 'idle' },
      actions: {
        setQuery: { args: { value: 'string' }, run: (store, { value }) => store.set('query', value) },
        loading: { args: {}, run: (store) => store.set('status', 'loading') },
        loaded: { args: { data: 'json' }, run: (store, { data }) => { store.set('list', data); store.set('status', 'ready'); } },
        failed: { args: { message: 'string' }, run: (store) => store.set('status', 'failed') },
      },
      resources: [{
        watch: ['query'],
        owns: ['list', 'status'],
        revalidate: 'never',
        request: (values) => ({ url: `/items?q=${values.query}` }),
        onStart: 'loading',
        onSuccess: 'loaded',
        onError: 'failed',
      }],
    },
  });
  const requests = [];
  const fetchFunction = async (url) => {
    requests.push(url);
    return { ok: true, status: 200, json: async () => ['from the browser'] };
  };
  const { ui } = mountSpec({
    namespaces: namespaces(),
    initialState: { items: { list: ['from the server'], status: 'ready' } },
    spec: noop,
    plugins: [resources(fetchFunction, { serverRendered: true })],
  });
  await ui.settle();
  assert.deepEqual(requests, [], 'the server already loaded it: the browser does not ask again on mount');
  assert.deepEqual(ui.state().items, { query: 'a', list: ['from the server'], status: 'ready' });
  ui.dispatch('items.setQuery', { value: 'b' });
  for (let round = 0; round < 4; round++) await ui.settle();
  assert.deepEqual(requests, ['/items?q=b'], 'a real change to a watched key still loads');
  assert.deepEqual(ui.state().items.list, ['from the browser']);

  const freshRequests = [];
  const fresh = mountSpec({
    namespaces: namespaces(),
    spec: noop,
    plugins: [resources(async (url) => { freshRequests.push(url); return { ok: true, status: 200, json: async () => [] }; })],
  });
  await fresh.ui.settle();
  assert.deepEqual(freshRequests, ['/items?q=a'], 'without server-rendered state the resource loads on mount as usual');
});

test('revalidate and its requirement on owns are checked when the app mounts', () => {
  const namespaces = {
    items: {
      state: { list: [], status: 'idle' },
      actions: {
        loading: { args: {}, run() {} },
        loaded: { args: { data: 'json' }, run() {} },
        failed: { args: { message: 'string' }, run() {} },
      },
      resources: [{ watch: [], request: () => null, onStart: 'loading', onSuccess: 'loaded', onError: 'failed' }],
    },
  };
  const install = (resource) => () => mountSpec({ namespaces: { ...namespaces, items: { ...namespaces.items, resources: [resource] } }, spec: noop, plugins: [resources(async () => ({}))] });
  const base = namespaces.items.resources[0];
  assert.throws(install({ ...base, revalidate: 'sometimes' }), /"revalidate" is "sometimes"\. Write revalidate: 'never' to trust the state a server render embedded, or leave it out/);
  assert.throws(install({ ...base, revalidate: 'never' }), /"revalidate: 'never'" needs "owns"\. List the state keys the server render wrote/);
});

test('app() keeps the namespaces it was given readable for plugins, and rejects a non-object', () => {
  const { ui } = mountSpec({ namespaces: todoNamespaces(), spec: noop });
  assert.deepEqual(Object.keys(ui.namespaces()), ['todos', 'search']);
  assert.throws(() => app({ dev: true, namespaces: [], spec: noop, root: mountSpec({ spec: noop }).root }), /namespaces: must be an object of namespace name to \{ state, derive, actions, resources, shapes, rowState \}/);
});

// ---- preventDefault with several handlers, derived reads inside actions, cycles across namespaces, ownership in calls ----

test('submit is prevented by default, a handler can opt out with preventDefault: false, and with a list the stated options decide', () => {
  const run = (submit) => {
    const { root } = mountSpec({
      namespaces: { a: { actions: { first: { args: {}, run() {} } } }, b: { actions: { second: { args: {}, run() {} } } } },
      spec: { tag: 'form', id: 'f', on: { submit }, children: 'x' },
    });
    const prevented = [];
    fireEvent(root.firstChild, 'submit', { preventDefault: () => prevented.push(true) });
    return prevented.length === 1;
  };
  assert.equal(run(['a.first']), true, 'a single submit handler: prevented by default');
  assert.equal(run(['a.first', {}, { preventDefault: false }]), false, 'a single handler can opt out');
  assert.equal(run([['a.first'], ['b.second']]), true, 'a list that states nothing: prevented by default');
  assert.equal(run([['a.first', {}, { preventDefault: false }], ['b.second']]), false, 'an opt-out in a list is not overridden by the handler that says nothing');
  assert.equal(run([['a.first', {}, { preventDefault: false }], ['b.second', {}, { preventDefault: true }]]), true, 'any handler that states true prevents');
});

test('store.get of a derived value inside an action sees the writes just made, also after a call and across namespaces', () => {
  const seen = [];
  const { ui } = mountSpec({
    namespaces: {
      a: {
        state: { n: 1 },
        derive: { double: (get) => get('n') * 2, plusB: (get) => get('n') + get('b.m') },
        actions: { go: { args: {}, calls: ['b.bump'], run: (store, args, call) => { store.set('n', 5); seen.push(store.get('double')); call('b.bump', {}); seen.push(store.get('plusB'), store.get('b.triple')); } } },
      },
      b: { state: { m: 10 }, derive: { triple: (get) => get('m') * 3 }, actions: { bump: { args: {}, run: (store) => store.set('m', store.get('m') + 1) } } },
    },
    spec: noop,
  });
  assert.equal(ui.dispatch('a.go'), undefined);
  assert.deepEqual(seen, [10, 16, 33]);
});

test('derived values that depend on each other across namespaces in a loop are reported with the qualified loop', () => {
  assert.throws(
    () => mountSpec({ namespaces: { a: { derive: { x: (get) => get('b.y') } }, b: { derive: { y: (get) => get('a.x') } } }, spec: noop }),
    /a derived value cannot depend on itself: a\.x -> b\.y -> a\.x\. Break the loop/,
  );
});

test('a called action that writes a key owned by a resource is refused, and the caller\'s own writes are undone too', async () => {
  const namespaces = {
    caller: { state: { n: 0 }, actions: { go: { args: {}, calls: ['box.tamper'], run: (store, args, call) => { store.set('n', 1); call('box.tamper', {}); } } } },
    box: {
      state: { query: 'a', data: null },
      actions: {
        tamper: { args: {}, run: (store) => store.set('data', 'illegal') },
        loading: { args: {}, run() {} },
        loaded: { args: { data: 'json' }, run: (store, { data }) => store.set('data', data) },
        failed: { args: { message: 'string' }, run() {} },
      },
      resources: [{ watch: ['query'], owns: ['data'], request: () => null, onStart: 'loading', onSuccess: 'loaded', onError: 'failed' }],
    },
  };
  const { ui } = mountSpec({ namespaces, spec: noop, plugins: [resources(async () => ({}))] });
  const message = quiet(() => ui.dispatch('caller.go'));
  assert.match(message, /^caller\.go: box\.tamper: store\.set\("data"\): state key "data" is owned by namespace "box" resource #1/);
  assert.deepEqual(ui.state(), { caller: { n: 0 }, box: { query: 'a', data: null } });
});
