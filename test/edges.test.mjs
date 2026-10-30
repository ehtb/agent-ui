// Regression tests for the edges of the runtime that the happy-path suites did not reach: a binding `class` next to `classes`,
// malformed handlers reaching validate(), names that exist on every object (toString), duplicate each keys, spec error text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoot, findElements } from './support/dom-shim.mjs';
import { assertNoErrors, mountSpec } from './support/helpers.mjs';

const { validate, app } = await import('../src/ui.js');
const { div, ul, li, state, item, equals, each, when } = await import('../src/spec.js');

const counter = {
  t: {
    state: { base: 'box', on: true, items: [{ id: 1 }, { id: 1 }] },
    actions: { go: { args: { n: 'string' }, run() {} }, noop: { args: {}, run() {} } },
  },
};

test('class as a binding next to classes renders the resolved class, not [object Object]', async () => {
  const { ui, root } = mountSpec({ namespaces: counter, spec: div({ id: 'box', class: state('t.base'), classes: { active: state('t.on') } }) });
  await ui.settle();
  const [box] = findElements(root, (element) => element.getAttribute('id') === 'box' || element.getAttribute('data-id') === 'box');
  assert.equal(box.getAttribute('class'), 'box active');
});

test('validate reports a handler whose arguments are not an object instead of throwing', () => {
  for (const bad of ['oops', null, 5, ['x']]) {
    const problems = validate({ tag: 'button', children: 'x', on: { click: ['t.go', bad] } }, { namespaces: counter });
    assert.ok(problems.length, `a handler with arguments ${JSON.stringify(bad)} is a problem`);
    assert.match(problems[0], /arguments must be an object/);
  }
  const options = validate({ tag: 'button', children: 'x', on: { click: ['t.noop', {}, 'oops'] } }, { namespaces: counter });
  assert.match(options[0], /options must be an object/);
});

test('names every object has (toString, constructor) are unknown actions and keys, with the normal message', async () => {
  const { ui } = mountSpec({ namespaces: counter, spec: div(null, 'x') });
  assert.match(ui.dispatch('toString'), /unknown action toString/);
  assert.match(ui.dispatch('constructor'), /unknown action constructor/);
  assert.throws(() => ui.get('toString'), /no namespace "toString"|toString/);
  assert.throws(() => ui.get('toString'), (error) => !(error instanceof TypeError));
});

test('a duplicate each key is refused in development and the first row is kept', async () => {
  const spec = ul(null, each('t.items', 'id', li(null, 'row')));
  const errors = [];
  const original = console.error;
  console.error = (message) => errors.push(message);
  try {
    const { ui, root } = mountSpec({ namespaces: counter, spec });
    await ui.settle();
    assert.equal(findElements(root, (element) => element.localName === 'li').length, 1);
    assert.ok(ui.errors.some((message) => /duplicate key 1/.test(message)));
  } finally {
    console.error = original;
  }
});

test('app() throws the spec problems as readable lines and keeps the list on the error', () => {
  try {
    app({ dev: true, namespaces: counter, spec: { tag: 'blink' }, root: createRoot() });
    assert.fail('should throw');
  } catch (error) {
    assert.match(error.message, /^app: the spec has 1 problem/);
    assert.match(error.message, /\n\$: bad tag blink/);
    assert.deepEqual(error.problems.length, 1);
  }
});

test('an app whose plugin throws while starting leaves nothing running', async () => {
  const seen = [];
  let cleanedUp = false;
  const plugins = [
    (api) => {
      api.watch(['t.base'], ({ 't.base': base }) => seen.push(base));
      api.onDestroy(() => { cleanedUp = true; });
    },
    () => { throw new Error('the plugin cannot start'); },
  ];
  const root = createRoot();
  assert.throws(() => app({ dev: true, namespaces: counter, spec: div(null, 'x'), root, plugins }), /the plugin cannot start/);
  assert.equal(cleanedUp, true, 'what the first plugin registered is let go of');
  assert.equal(root.__app, undefined);
  assert.deepEqual(seen, ['box'], 'the watch ran once at start and never again');
});

test('a prop that is not an attribute of HTML is refused with the nearest name; data-* and aria-* are allowed when well formed', () => {
  const problemsOf = (props) => validate({ tag: 'div', props }, { namespaces: counter });
  assert.match(problemsOf({ classs: 'x' })[0], /\$\.props\.classs: unknown attribute "classs"\. Did you mean "class"\?/);
  assert.match(problemsOf({ tabIndex: 0 })[0], /unknown attribute "tabIndex"\. Did you mean "tabindex"\?/);
  assert.deepEqual(problemsOf({ class: 'x', 'data-test-id': 'a', 'aria-hidden': 'true', role: 'note', tabindex: 0, title: 't' }), []);
  assert.deepEqual(problemsOf({ focus: true }), [], 'focus, follow and soft are the attributes of agent-ui itself');
});

test('a builder refuses an attribute that is not HTML at the call that wrote it', () => {
  assert.throws(() => div({ classs: 'x' }), /div\(\.\.\.\): unknown attribute "classs"\. Did you mean "class"\?/);
  assert.doesNotThrow(() => div({ domId: 'a', 'data-x': 1, 'aria-label': 'l', class: 'c', style: 's' }));
});

test('a duplicate key names the list, its two positions and the data to fix', async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const { ui } = mountSpec({ namespaces: counter, spec: ul(null, each('t.items', 'id', li(null, 'row'))) });
    await ui.settle();
    assert.deepEqual(ui.errors, ['duplicate key 1 in 0.0 (list "t.items", items 0 and 1): the later item is not shown. The data holds two items with the same "id"; fix "t.items" so that every item has its own "id"']);
  } finally {
    console.error = original;
  }
});

test('a list inside a branch that is not shown is checked when the app mounts, and a shown list is reported once', async () => {
  const namespaces = {
    page: {
      state: { open: false, sections: [{ id: 'welcome-closing' }, { id: 'intro' }, { id: 'welcome-closing' }], missing: [{ id: 'a' }, {}] },
      derive: { shown: (get) => get('sections') },
      actions: { show: { args: {}, run: (store) => store.set('open', true) } },
    },
  };
  const spec = div(
    null,
    when(state('page.open'), ul(null, each('page.shown', 'id', li(null, 'row')))),
    when(state('page.open'), div(null, ul(null, each('page.missing', 'id', li(null, 'row')))), ul(null, each('page.sections', 'id', li(null, 'shown')))),
  );
  const original = console.error;
  console.error = () => {};
  try {
    const { ui } = mountSpec({ namespaces, spec });
    await ui.settle();
    // page.sections is shown (the otherwise branch) and reports itself once; the two hidden lists are found by the check at mount.
    assert.deepEqual([...ui.errors].sort(), [
      'duplicate key welcome-closing in 0.0.when.0.0 (list "page.shown", items 0 and 2): the later item is not shown. The data holds two items with the same "id"; fix "page.shown" so that every item has its own "id"',
      'duplicate key welcome-closing in 0.1.otherwise.0.0 (list "page.sections", items 0 and 2): the later item is not shown. The data holds two items with the same "id"; fix "page.sections" so that every item has its own "id"',
      'item without usable key "id" in 0.1.when.0.0.0',
    ]);
    // Opening the branch renders the two lists the check had reported: they are not reported again.
    assert.equal(ui.dispatch('page.show'), undefined);
    await ui.settle();
    assert.equal(ui.errors.length, 3, ui.errors.join('\n'));
    // A problem that appears after the first render is reported by the renderer, once.
    ui.dispatch('page.show');
    await ui.settle();
    assert.equal(ui.errors.length, 3);
  } finally {
    console.error = original;
  }
});

test('assertNoErrors passes on a clean app and fails with the messages the app reported', async () => {
  const clean = mountSpec({ namespaces: counter, spec: div(null, 'x') });
  await clean.ui.settle();
  assertNoErrors(clean.ui);
  const original = console.error;
  console.error = () => {};
  try {
    const { ui } = mountSpec({ namespaces: counter, spec: ul(null, each('t.items', 'id', li(null, 'row'))) });
    await ui.settle();
    assert.throws(() => assertNoErrors(ui), /^Error: assertNoErrors: the app reported 1 error:\nduplicate key 1 in 0\.0 \(list "t\.items", items 0 and 1\)/);
  } finally {
    console.error = original;
  }
});

test('a list below an each is checked when its row renders, once per row, and not also at mount', async () => {
  const namespaces = { page: { state: { rows: [{ id: 1 }, { id: 2 }], sections: [{ id: 'a' }, { id: 'a' }] } } };
  const spec = ul(null, each('page.rows', 'id', li(null, ul(null, each('page.sections', 'id', li(null, 'section'))))));
  const original = console.error;
  console.error = () => {};
  try {
    const { ui } = mountSpec({ namespaces, spec });
    await ui.settle();
    assert.equal(ui.errors.length, 2, ui.errors.join('\n'));
  } finally {
    console.error = original;
  }
});

// The check at mount counts what it found for a list that is not shown. That count is only good for the data the list has when it first renders.
const hiddenListApp = () => {
  const namespaces = {
    page: {
      state: { open: false, sections: [{ id: 'a' }, { id: 'a' }] },
      actions: {
        show: { args: {}, run: (store) => store.set('open', true) },
        setSections: { args: { ids: 'json' }, run: (store, { ids }) => store.set('sections', ids.map((id) => ({ id }))) },
      },
    },
  };
  const spec = div(null, when(state('page.open'), ul(null, each('page.sections', 'id', li(null, 'row')))));
  const { ui } = mountSpec({ namespaces, spec });
  return ui;
};
const quietly = async (run) => {
  const original = console.error;
  console.error = () => {};
  try {
    return await run();
  } finally {
    console.error = original;
  }
};

test('data fixed before the branch opens, and broken again later, is reported when it breaks again', async () => {
  await quietly(async () => {
    const ui = hiddenListApp();
    await ui.settle();
    assert.equal(ui.errors.length, 1, 'the duplicate is found at mount');
    ui.dispatch('page.setSections', { ids: ['a', 'b'] });
    ui.dispatch('page.show');
    await ui.settle();
    assert.equal(ui.errors.length, 1, 'the list rendered with good data: nothing new');
    ui.dispatch('page.setSections', { ids: ['a', 'a'] });
    await ui.settle();
    assert.equal(ui.errors.length, 2, ui.errors.join('\n'));
    assert.match(ui.errors[1], /^duplicate key a in 0\.0\.when\.0\.0 \(list "page\.sections", items 0 and 1\)/);
  });
});

test('a duplicate that moved before the branch opened is reported at its new positions', async () => {
  await quietly(async () => {
    const ui = hiddenListApp();
    await ui.settle();
    ui.dispatch('page.setSections', { ids: ['x', 'y', 'a', 'a'] });
    ui.dispatch('page.show');
    await ui.settle();
    assert.equal(ui.errors.length, 2, ui.errors.join('\n'));
    assert.match(ui.errors[0], /items 0 and 1\)/, 'what was true at mount stays in the record');
    assert.match(ui.errors[1], /items 2 and 3\)/);
  });
});

test('a Date, Map, Set or class instance is not a plain object, so two different dates are not "the same value"', async () => {
  const { isPlainObject, isSameValue } = await import('../src/spec-core.js');
  for (const value of [new Date(1), new Map(), new Set(), /x/, new (class Box {})(), [], null, 'x', 3]) assert.equal(isPlainObject(value), false, String(value));
  for (const value of [{}, { a: 1 }, Object.create(null), JSON.parse('{"a":[1]}')]) assert.equal(isPlainObject(value), true);
  assert.equal(isSameValue(new Date(1), new Date(2), 2), false);
  assert.equal(isSameValue({ a: { b: 1 } }, { a: { b: 1 } }, 2), true);
});

test('app.get with a key that is not a string, or a name every object has, is an unknown key, not a TypeError', () => {
  const { ui } = mountSpec({ namespaces: counter, spec: div(null, 'x') });
  for (const key of [undefined, 3, null, 'toString', 'constructor']) assert.throws(() => ui.get(key), /get\(".*"\): /, String(key));
});

test('the command line and spec patches treat toString and constructor as unknown, with the normal message', async () => {
  const { parseArguments, UsageError } = await import('../cli/arguments.mjs');
  assert.throws(() => parseArguments(['--constructor'], { out: 'text' }), (error) => error instanceof UsageError && /unknown option --constructor/.test(error.message));
  const { patchSpec } = await import('../src/spec-tools.js');
  const result = patchSpec({ tag: 'p', id: 'x', children: 'x' }, [{ op: 'toString' }]);
  assert.equal(result.ok, false);
  assert.match(result.problems[0], /unknown operation "toString"/);
});

test('validate refuses a literal that is not JSON, an empty item or event path, an empty when, and a call to a namespace with a dotted name', () => {
  const namespaces = { t: { state: { a: 1 }, actions: { go: { args: { n: 'string' }, run() {} } } } };
  const problems = (spec, extra = namespaces) => validate(spec, { namespaces: extra });
  assert.match(problems({ tag: 'p', id: 'x', props: { title: NaN }, children: 'x' }).join('\n'), /title: NaN is not a literal/);
  assert.match(problems({ tag: 'p', id: 'x', props: { title: () => 'x' }, children: 'x' }).join('\n'), /title: .* is not a literal/);
  assert.match(problems({ tag: 'p', id: 'x', children: { equals: [{ state: 't.a' }, Infinity] } }).join('\n'), /operand Infinity is not a literal/);
  assert.match(problems({ tag: 'ul', id: 'u', children: { each: 't.a', key: '.', template: { tag: 'li', children: { item: '' } } } }).join('\n'), /item needs a field name/);
  assert.match(problems({ tag: 'button', id: 'b', children: 'go', on: { click: ['t.go', { n: { event: '' } }] } }).join('\n'), /event needs a path string/);
  assert.match(problems({ tag: 'div', id: 'd', children: { when: { state: 't.a' }, children: [] } }).join('\n'), /when needs children or otherwise/);
  const dotted = { 'my.ns': { state: {}, actions: { go: { args: {}, run() {} } } }, t: { state: {}, actions: { call: { args: {}, calls: ['my.ns.go'], run() {} } } } };
  const lines = problems({ tag: 'p', id: 'x', children: 'x' }, dotted);
  assert.ok(lines.some((line) => /"my\.ns" is not allowed/.test(line)), lines.join('\n'));
});

test('the mode is always written down: app(), renderPage() and browserEnvironment() have no default for dev, and name the fix', async () => {
  const spec = div(null, 'x');
  for (const dev of [undefined, 'true', 1, null]) {
    assert.throws(() => app({ namespaces: {}, spec, root: createRoot(), ...(dev === undefined ? {} : { dev }) }), /^Error: app: dev is .*\. Pass dev: true while developing .* and dev: false in production\. There is no default/s, String(dev));
  }
  assert.doesNotThrow(() => app({ namespaces: {}, spec, root: createRoot(), dev: false }).destroy());
  const { renderPage } = await import('../server/render-page.js');
  await assert.rejects(renderPage(() => assert.fail('never created'), { url: '/' }), /renderPage: dev is missing\. Pass dev: true to render with the development checks/);
});
