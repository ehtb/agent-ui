// Runtime-level tests on a small list app (test/fixtures/list-app.js): validator catalogue, attributes, signals, keyed rows, frozen state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findElements, createRoot, fireEvent } from './support/dom-shim.mjs';

const { validate, app, signal, effect, settle } = await import('../src/ui.js');
const basic = await import('./fixtures/list-app.js');
const context = { namespaces: basic.namespaces };

test('validate: every defect class is reported with a spec path', () => {
  const problemsFor = (spec, overrides = {}) => validate(spec, { ...context, ...overrides });

  assert.match(problemsFor({ tag: 'blink' })[0], /^\$: bad tag blink/);
  assert.match(problemsFor({ tag: 'input' })[0], /input needs aria-label/);
  assert.match(problemsFor({ tag: 'button' })[0], /button needs text or aria-label/);
  assert.match(problemsFor({ tag: 'div', children: { state: 'nope' } })[0], /unknown state nope/);
  assert.match(
    problemsFor({ tag: 'button', children: 'x', on: { click: ['missing.action'] } })[0],
    /unknown action missing\.action/,
  );
  assert.match(
    problemsFor({ tag: 'button', children: 'x', on: { hover: ['todos.remove'] } })[0],
    /bad event hover/,
  );
  assert.match(problemsFor({ tag: 'div', children: { item: 'text' } })[0], /item binding outside each/);
  assert.match(problemsFor({ each: 'todos.visible', key: 'id', template: 'x' })[0], /must be one element/);
  assert.match(problemsFor({ each: 'todos.visible', template: { tag: 'li' } })[0], /needs key/);
  assert.match(problemsFor({ tag: 'div', children: { when: 'todos.draft', children: 'x' } })[0], /needs a binding/);
  assert.match(problemsFor({ tag: 'div', children: { equals: [1] } })[0], /equals needs \[x, y\]/);
  assert.match(problemsFor({ tag: 'div', classes: { active: 'x' } })[0], /needs a binding/);
  assert.match(
    problemsFor({ tag: 'div' }, { namespaces: { bad: { actions: { amount: { args: { size: 'integer' }, run() {} } } } } })[0],
    /action bad\.amount\.size: bad type integer/,
  );
  assert.deepEqual(problemsFor(basic.spec), []);
});

test('app() refuses to mount an invalid spec and throws the problems as lines, with the list on the error', () => {
  assert.throws(
    () => app({ dev: true, ...context, spec: { tag: 'blink' }, root: createRoot() }),
    (error) => /^app: the spec has 1 problem:\n\$: bad tag blink/.test(error.message) && Array.isArray(error.problems),
  );
});

test('attributes: booleans set or remove plain attributes, but aria-* keep "true"/"false"', async () => {
  const root = createRoot();
  const ui = basic.create({ root, dev: true });
  await ui.settle();

  const filterButtons = () => findElements(root, (element) => element.localName === 'button' && 'aria-pressed' in element.attributes);
  assert.deepEqual(filterButtons().map((button) => button.attributes['aria-pressed']), ['true', 'false', 'false']);

  ui.dispatch('todos.add', { text: 'a' });
  await ui.settle();
  const label = findElements(root, (element) => element.localName === 'span')[0];
  assert.equal(label.hasAttribute('data-done'), false);
  ui.dispatch('todos.toggle', { id: 1 });
  await ui.settle();
  assert.equal(label.attributes['data-done'], '');
});

test('signals: updates are batched, and disposed effects stop running', async () => {
  const counter = signal(1);
  let runs = 0;
  const dispose = effect(() => {
    counter.get();
    runs++;
  });
  counter.set(2);
  counter.set(3);
  await settle();
  assert.equal(runs, 2); // initial run + one batched re-run for two sets
  dispose();
  counter.set(4);
  await settle();
  assert.equal(runs, 2);
});

test('keyed rows: removal keeps the other row nodes; bad calls are reported as errors', async () => {
  const root = createRoot();
  const ui = basic.create({ root, dev: true });
  for (const text of ['a', 'b', 'c']) ui.dispatch('todos.add', { text });
  await ui.settle();

  const rows = () => findElements(root, (element) => element.localName === 'li' && element.parentElement.localName === 'ul');
  const rowsBefore = rows();
  ui.dispatch('todos.remove', { id: 2 });
  await ui.settle();
  assert.equal(rows()[0], rowsBefore[0]);
  assert.equal(rows()[1], rowsBefore[2]);

  assert.ok(ui.dispatch('todos.add', { text: 1 }));
  assert.match(ui.errors.pop(), /todos\.add\.text: want string, got number/);
  assert.ok(ui.dispatch('does.not.exist'));
  ui.errors.length = 0;
  assert.equal(ui.dispatch('todos.toggle', { id: 1 }), undefined);
});

test('dev mode freezes state: an in-place mutation inside an action is caught, logged and leaves state untouched', async () => {
  const namespaces = {
    ...basic.namespaces,
    todos: { ...basic.namespaces.todos, actions: { ...basic.namespaces.todos.actions, mutate: { args: {}, run: (store) => store.get('items').push({ id: 9 }) } } },
  };
  const ui = app({ namespaces, spec: basic.spec, root: createRoot(), dev: true });
  ui.dispatch('todos.add', { text: 'a' });
  assert.match(ui.dispatch('todos.mutate'), /todos\.mutate: .*(not extensible|read only)/i);
  assert.equal(ui.state().todos.items.length, 1);
  assert.ok(!ui.log.some(([name]) => name === 'todos.mutate'));
});

test('an app with no actions (a page that only displays state) mounts and renders', async () => {
  const { app } = await import('../src/ui.js');
  const ui = app({ namespaces: { page: { state: { title: 'static' } } }, spec: { tag: 'p', children: { state: 'page.title' } }, root: createRoot(), dev: true });
  await ui.settle();
  assert.deepEqual(ui.actions(), {});
  assert.equal(ui.errors.length, 0);
});

test('handler arguments: a literal JSON object or array reaches the action unchanged', async () => {
  const root = createRoot();
  const seen = [];
  const ui = app({ dev: true,
    namespaces: {
      box: {
        state: { count: 0 },
        actions: {
          take: { args: { data: 'json' }, run: (store, { data }) => { seen.push(data); store.set('count', store.get('count') + 1); } },
        },
      },
    },
    spec: {
      tag: 'div',
      children: [
        { tag: 'button', id: 'object', children: 'o', on: { click: ['box.take', { data: { any: ['json'] } }] } },
        { tag: 'button', id: 'array', children: 'a', on: { click: ['box.take', { data: [1, { two: 2 }] }] } },
      ],
    },
    root,
  });
  const [objectButton, arrayButton] = findElements(root, (element) => element.localName === 'button');
  fireEvent(objectButton, 'click');
  fireEvent(arrayButton, 'click');
  await ui.settle();
  assert.deepEqual(seen, [{ any: ['json'] }, [1, { two: 2 }]]);
  assert.equal(ui.state().box.count, 2);
  assert.deepEqual(ui.errors, []);
});

test('handler arguments: a failure while reading them is reported, not thrown from the listener', async () => {
  const root = createRoot();
  let ran = 0;
  const ui = app({ dev: true,
    namespaces: { box: { state: {}, actions: { take: { args: { value: 'string' }, run: () => { ran++; } } } } },
    spec: { tag: 'button', children: 'x', on: { click: ['box.take', { value: { event: 'target.value' } }] } },
    root,
  });
  const button = findElements(root, (element) => element.localName === 'button')[0];
  Object.defineProperty(button, 'value', { get() { throw new Error('boom'); } });
  const originalError = console.error;
  console.error = () => {};
  try {
    fireEvent(button, 'click');
  } finally {
    console.error = originalError;
  }
  assert.equal(ran, 0);
  assert.deepEqual(ui.errors, ['box.take.value: cannot read the argument at event time (boom). Check that the {state}, {item} or {event} path exists']);
});

test('handler arguments: a submit handler still prevents the default when an argument cannot be read', async () => {
  const root = createRoot();
  const ui = app({ dev: true,
    namespaces: { box: { state: {}, actions: { take: { args: { value: 'string' }, run() {} } } } },
    spec: { tag: 'form', id: 'f', children: 'x', on: { submit: ['box.take', { value: { event: 'target.value' } }] } },
    root,
  });
  const form = findElements(root, (element) => element.localName === 'form')[0];
  Object.defineProperty(form, 'value', { get() { throw new Error('boom'); } });
  const prevented = [];
  const originalError = console.error;
  console.error = () => {};
  try {
    fireEvent(form, 'submit', { preventDefault: () => prevented.push(true) });
  } finally {
    console.error = originalError;
  }
  assert.equal(prevented.length, 1);
  assert.match(ui.errors[0], /cannot read the argument at event time/);
});
