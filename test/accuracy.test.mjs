// "Where it is, what is wrong, how to fix it": mistakes that used to surface as a raw TypeError, or not at all, now fail at
// mount (or in the action that makes them) with a message that names the thing and says what to do.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app, validate } from '../src/ui.js';
import { createRoot } from './support/dom-shim.mjs';
import { pathToFileURL } from 'node:url';
import { expandComponents } from '../src/components.js';

const spec = { tag: 'p', children: 'x' };
// One namespace, "box", holding the state, derive and actions of a test; its keys are read inside it without a prefix.
const mount = ({ state, derive, actions, resources, spec: mountedSpec = spec, ...rest } = {}) => app({ dev: true, namespaces: { box: { state, derive, actions, resources } }, spec: mountedSpec, root: createRoot(), ...rest });
const mountError = (parts) => {
  try {
    mount(parts);
  } catch (error) {
    return error.message;
  }
  return null;
};

test('a derived value may read one that is declared later: order does not matter', () => {
  const ui = mount({ state: { n: 2 }, derive: { double: (get) => get('half') * 4, half: (get) => get('n') / 2 } });
  assert.deepEqual(ui.derived(), { box: { double: 4, half: 1 } });
});

test('a derived value that reads something that does not exist names itself, the key, and the near miss', () => {
  const message = mountError({ state: { count: 1 }, derive: { label: (get) => `n=${get('cuont')}` } });
  assert.match(message, /^derived "box\.label": get\("cuont"\): namespace "box" has no state key or derived value "cuont"\. Did you mean "count"\? It has: count, label$/);
});

test('derived values that depend on each other in a loop are reported with the loop', () => {
  assert.match(mountError({ derive: { a: (get) => get('b'), b: (get) => get('c'), c: (get) => get('a') } }), /a derived value cannot depend on itself: box\.a -> box\.b -> box\.c -> box\.a\. Break the loop/);
  assert.match(mountError({ derive: { a: (get) => get('a') } }), /a derived value cannot depend on itself: box\.a -> box\.a/);
});

test('a derived value that throws is named', () => {
  assert.match(mountError({ state: { rows: null }, derive: { total: (get) => get('rows').length } }), /^derived "box\.total": /);
});

test('a derived value with the name of a state key is refused instead of silently replacing the state', () => {
  assert.match(mountError({ state: { a: 1 }, derive: { a: () => 2 } }), /derive box\.a: has the same name as a state key of "box".*Rename one of them/);
});

test('state that is not JSON is refused with the path and what to store instead', () => {
  const problems = (state) => validate(spec, { namespaces: { box: { state } } });
  assert.match(problems({ run: () => {} })[0], /state box\.run: a function is not JSON\. Keep functions in `derive` and actions/);
  assert.match(problems({ when: new Date() })[0], /state box.when: Date is not a plain object.*value\.toISOString\(\)/);
  assert.match(problems({ rows: [1, { at: undefined }] })[0], /state box.rows\[1\]\.at: undefined is not JSON\. Use null/);
  assert.match(problems({ n: NaN })[0], /state box.n: NaN is not JSON/);
  assert.match(problems({ n: Infinity })[0], /state box.n: Infinity is not JSON/);
  assert.match(problems({ big: 10n })[0], /state box.big: a bigint is not JSON/);
  assert.match(problems({ pairs: new Map() })[0], /Map is not a plain object/);
  const loop = {};
  loop.self = loop;
  assert.match(problems({ loop })[0], /state box.loop\.self: it contains itself/);
  assert.deepEqual(problems({ a: null, b: [1, 'x', true, { c: [] }], d: 1.5, e: '' }), []);
});

test('an action that writes a key that does not exist, or a derived value, says so', () => {
  const ui = mount({
    state: { count: 0, name: '' },
    derive: { shout: (get) => get('name').toUpperCase() },
    actions: {
      typo: { args: {}, run: (store) => store.set('cuont', 1) },
      write: { args: {}, run: (store) => store.set('shout', 'x') },
      read: { args: {}, run: (store) => store.get('nothing') },
      fine: { args: {}, run: (store) => store.set('count', store.get('count') + 1) },
    },
  });
  const quiet = console.error;
  console.error = () => {};
  try {
    assert.match(ui.dispatch('box.typo'), /^box\.typo: store\.set\("cuont"\): namespace "box" has no state key or derived value "cuont"\. Did you mean "count"\?/);
    assert.match(ui.dispatch('box.write'), /^box\.write: store\.set\("shout"\): "shout" is a derived value and cannot be written\. Write the state it is computed from/);
    assert.match(ui.dispatch('box.read'), /^box\.read: store\.get\("nothing"\): namespace "box" has no state key/);
  } finally {
    console.error = quiet;
  }
  assert.equal(ui.dispatch('box.fine'), undefined);
  assert.equal(ui.state().box.count, 1);
  assert.equal(ui.state().box.name, ''); // the failed actions changed nothing
});

test('unknown keys get "Did you mean" in the spec validator and components', () => {
  const found = validate({ tag: 'div', chilren: 'x' }, { namespaces: {} });
  assert.match(found[0], /unknown key chilren \(allowed: .*\)\. Did you mean "children"\?/);
  assert.equal(validate({ tag: 'div', zzzzzzzz: 'x' }, { namespaces: {} })[0].includes('Did you mean'), false); // nothing close: no guess
  const components = { box: () => ({ tag: 'div' }) };
  assert.throws(() => expandComponents({ tag: 'main', children: [{ use: 'box', wiht: {} }] }, components), /unknown key wiht on a component use\. Did you mean "with"\? Allowed: use, with, children/);
});

// ---- the route names, the api tables and the resource URLs have to agree ------------------------------------------------

test('agent-ui check reports a resource that calls an endpoint nothing answers, with the page that made the request', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join, resolve } = await import('node:path');
  const { checkProject } = await import('../cli/check.mjs');
  const repository = resolve(import.meta.dirname, '..');
  const project = mkdtempSync(join(tmpdir(), 'agent-ui-check-'));
  const write = (name, text) => writeFileSync(join(project, name), text);
  const appModule = (url) => `
    import { definePage } from '${repository}/src/pages.js';
    import { withResources } from '${repository}/src/resources.js';
    const definition = definePage({
      head: { title: 'Home' },
      ready: (state) => state.item.loaded,
      plugins: [withResources],
      namespaces: {
        item: {
          state: { loaded: false },
          actions: {
            loading: { args: {}, run: () => {} },
            loaded: { args: { data: 'json' }, run: (store) => store.set('loaded', true) },
            failed: { args: { message: 'string' }, run: () => {} },
          },
          resources: [{ watch: [], request: () => ({ url: '${url}' }), onStart: 'loading', onSuccess: 'loaded', onError: 'failed' }],
        },
      },
    }, { path: '/', view: { tag: 'p', id: 'home', children: 'home' } });
    export const { create, describePage, namespaces, spec } = definition;
  `;
  try {
    mkdirSync(project, { recursive: true });
    // Any object with this shape is an api for the render server and for check.
    write('api.mjs', `
      export const createApi = () => ({
        apiBase: '/api',
        handle: ({ pathname }) => (pathname === '/api/item/1' ? { status: 200, body: { id: 1 } } : pathname.startsWith('/api/') ? { status: 404, body: {} } : null),
      });
    `);
    // The project's fetchFunction answers /api/ requests from its API module, in process (the framework has no default source).
    const { createApi } = await import(pathToFileURL(join(project, 'api.mjs')).href);
    const api = createApi();
    const fetchFunction = async (url) => {
      const answer = api.handle({ method: 'GET', pathname: new URL(url, 'http://localhost').pathname, body: {} });
      return answer ? Response.json(answer.body, { status: answer.status }) : new Response(null, { status: 404 });
    };
    const config = { outDir: 'dist', api: 'api.mjs', fetchFunction, pages: [{ name: 'index', path: '/', app: 'app.mjs', file: 'pages/page.js' }] };
    write('app.mjs', appModule('/api/item/1'));
    const good = await checkProject({ config, root: project });
    assert.deepEqual(good.problems, []);
    write('app-misspelt.mjs', appModule('/api/itme/1')); // the route name is misspelt in the URL (a new file: modules are cached by path)
    const bad = await checkProject({ config: { ...config, pages: [{ name: 'index', path: '/', app: 'app-misspelt.mjs', file: 'pages/page.js' }] }, root: project });
    assert.ok(bad.problems.some((problem) => /^\/ \/: GET \/api\/itme\/1 answered 404\. Endpoints are served below \/api\//.test(problem)), JSON.stringify(bad.problems));
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test('agent-ui check reports a duplicate list key inside a branch that is not shown, with the list and the data to fix', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join, resolve } = await import('node:path');
  const { checkProject } = await import('../cli/check.mjs');
  const repository = resolve(import.meta.dirname, '..');
  const project = mkdtempSync(join(tmpdir(), 'agent-ui-check-'));
  const appModule = (ids) => `
    import { definePage } from '${repository}/src/pages.js';
    const definition = definePage({
      head: { title: 'Home' },
      namespaces: { page: { state: { open: false, sections: ${JSON.stringify(ids.map((id) => ({ id })))} } } },
    }, { path: '/', view: { tag: 'main', id: 'home', children: [{ when: { state: 'page.open' }, children: [{ tag: 'ul', id: 'sections', children: [{ each: 'page.sections', key: 'id', template: { tag: 'li', children: 'section' } }] }] }] } });
    export const { create, describePage, namespaces, spec } = definition;
  `;
  const pagesFor = (app) => [{ name: 'index', path: '/', app, file: 'pages/page.js' }];
  const original = console.error;
  console.error = () => {};
  try {
    writeFileSync(join(project, 'unique.mjs'), appModule(['welcome-intro', 'welcome-closing']));
    writeFileSync(join(project, 'duplicate.mjs'), appModule(['welcome-closing', 'welcome-intro', 'welcome-closing']));
    const good = await checkProject({ config: { outDir: 'dist', pages: pagesFor('unique.mjs') }, root: project });
    assert.deepEqual(good.problems, []);
    const bad = await checkProject({ config: { outDir: 'dist', pages: pagesFor('duplicate.mjs') }, root: project });
    assert.equal(bad.problems.length, 1, JSON.stringify(bad.problems));
    assert.equal(bad.problems[0], '/ /: duplicate key welcome-closing in 0.0.when.0.0 (list "page.sections", items 0 and 2): the later item is not shown. The data holds two items with the same "id"; fix "page.sections" so that every item has its own "id"');
  } finally {
    console.error = original;
    rmSync(project, { recursive: true, force: true });
  }
});

test('an action that writes a value JSON cannot hold is refused in development, with the key and the fix', () => {
  const ui = mount({ state: { a: 1 }, actions: { bad: { args: {}, run: (store) => store.set('a', new Map()) } } });
  const message = ui.dispatch('box.bad');
  assert.match(message, /^box\.bad: store\.set\("a"\)/);
  assert.match(message, /Map/);
  assert.equal(ui.state().box.a, 1, 'the state was not changed');
});

test('a derived value read inside an action, or through derived(), reflects writes made just before (no settle needed)', () => {
  let seenInAction;
  const ui = mount({
    state: { n: 1 },
    derive: { double: (get) => get('n') * 2, quad: (get) => get('double') * 2 },
    actions: { go: { args: {}, run: (store) => { store.set('n', 5); seenInAction = [store.get('double'), store.get('quad')]; } } },
  });
  assert.equal(ui.dispatch('box.go'), undefined);
  assert.deepEqual(seenInAction, [10, 20]);
  assert.deepEqual(ui.derived(), { box: { double: 10, quad: 20 } });
});

test('an unrelated derived value that throws does not hijack the action that triggered the refresh', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    let seen;
    const ui = mount({
      state: { items: [{ name: 'a' }], n: 1 },
      derive: { first: (get) => get('items')[0].name, double: (get) => get('n') * 2 },
      actions: {
        empty: { args: {}, run: (store) => store.set('items', []) },
        bump: { args: {}, run: (store) => { store.set('n', 5); seen = store.get('double'); } },
        readFirst: { args: {}, run: (store) => { store.get('first'); } },
      },
    });
    ui.dispatch('box.empty');
    assert.equal(ui.dispatch('box.bump'), undefined, 'the broken derived value is not blamed on bump');
    assert.equal(seen, 10, 'and bump still sees its own value');
    // Asking for the broken value itself is that caller's problem, and the message names the value.
    assert.match(ui.dispatch('box.readFirst'), /^box\.readFirst: derived "box\.first": /);
  } finally {
    console.error = originalError;
  }
});

test('a failed refresh leaves the derived value queued, so the normal flush retries it', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const ui = mount({
      state: { items: [{ name: 'a' }] },
      derive: { first: (get) => get('items')[0].name },
      actions: {
        empty: { args: {}, run: (store) => store.set('items', []) },
        refill: { args: {}, run: (store) => store.set('items', [{ name: 'z' }]) },
        peek: { args: {}, run: (store) => { store.get('first'); } },
      },
    });
    ui.dispatch('box.empty');
    ui.dispatch('box.peek'); // fails inside the refresh
    ui.dispatch('box.refill');
    await ui.settle();
    assert.equal(ui.derived().box.first, 'z', 'the value recovered once the list was filled again');
  } finally {
    console.error = originalError;
  }
});

test("one app refreshing its derived values never runs another app's", () => {
  const calls = [];
  const first = mount({ state: { n: 1 }, derive: { double: (get) => { calls.push('first'); return get('n') * 2; } }, actions: { bump: { args: {}, run: (store) => store.set('n', 2) } } });
  const second = mount({ state: { m: 1 }, derive: { triple: (get) => { calls.push('second'); return get('m') * 3; } }, actions: { bump: { args: {}, run: (store) => store.set('m', 2) } } });
  calls.length = 0;
  first.dispatch('box.bump');
  second.dispatch('box.bump');
  assert.deepEqual(first.derived(), { box: { double: 4 } });
  assert.deepEqual(calls, ['first'], "the second app's derived value was not recomputed by the first app's read");
});

test('an effect that throws during a flush is reported and the other effects still run', async () => {
  const messages = [];
  const originalError = console.error;
  console.error = (message) => messages.push(message);
  try {
    const root = createRoot();
    const ui = app({
      namespaces: {
        box: {
          state: { items: [{ name: 'a' }], label: 'one' },
          derive: { first: (get) => get('items')[0].name },
          actions: { both: { args: {}, run: (store) => { store.set('items', []); store.set('label', 'two'); } } },
        },
      },
      spec: { tag: 'main', children: [{ tag: 'p', id: 'first', children: { state: 'box.first' } }, { tag: 'p', id: 'label', children: { state: 'box.label' } }] },
      root,
      dev: true,
    });
    ui.dispatch('box.both');
    await ui.settle();
    assert.equal(ui.outline()[0].children.find((node) => node.id === 'label').text, 'two', 'the unrelated binding updated');
    assert.ok(messages.some((message) => /derived "box\.first": /.test(message)), JSON.stringify(messages));
  } finally {
    console.error = originalError;
  }
});
