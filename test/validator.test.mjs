// Negative tests: every mistake an agent can plausibly make must fail at mount with a spec path, not render nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { validate, app } = await import('../src/ui.js');
const { createRoot } = await import('./support/dom-shim.mjs');

const context = {
  namespaces: {
    form: {
      state: { name: '', rows: [], count: 0 },
      derive: { upper: (get) => get('name').toUpperCase() },
      actions: {
        save: { args: { name: 'string', age: 'number' }, run() {} },
        ping: { args: {}, run() {} },
        load: { args: { data: 'json' }, run() {} },
      },
    },
  },
};
const problems = (spec) => validate(spec, context);
const expectProblem = (spec, pattern) => {
  const found = problems(spec);
  assert.ok(found.some((message) => pattern.test(message)), `expected ${pattern}, got ${JSON.stringify(found)}`);
};

test('typos in spec keys are reported with the allowed keys', () => {
  expectProblem({ tag: 'div', chilren: 'x' }, /\$: unknown key chilren \(allowed: tag, props, children, id, classes, on, transition\)/);
  expectProblem({ tag: 'div', children: { when: { state: 'form.name' }, child: 'x' } }, /unknown key child \(allowed: when, children, otherwise\)/);
  expectProblem({ tag: 'ul', children: { each: 'form.rows', key: 'id', templat: { tag: 'li' } } }, /unknown key templat/);
  expectProblem({ tag: 'ul', children: { each: 'form.rows', key: 'id' } }, /each template must be one element/);
  expectProblem({ tag: 'div', children: { text: 'x' } }, /bad node \(expected tag, each, when or a binding, got keys text\)/);
  expectProblem({ tag: 'div', children: { when: { state: 'form.name' } } }, /when needs children or otherwise/);
});

test('bindings: exactly one operator, correct operand counts, no object operands', () => {
  expectProblem({ tag: 'p', children: { state: 'name', not: { state: 'form.name' } } }, /a binding has exactly one key/);
  expectProblem({ tag: 'p', children: { greaterThan: [1] } }, /greaterThan needs \[x, y\]/);
  expectProblem({ tag: 'p', children: { and: [{ state: 'form.name' }] } }, /and needs a list of at least 2 operands/);
  expectProblem({ tag: 'p', children: { join: [] } }, /join needs a list of operands/);
  expectProblem({ tag: 'p', children: { equals: [{ foo: 1 }, 2] } }, /operand must be a binding or a literal/);
  expectProblem({ tag: 'p', children: { state: 'nothing.deep' } }, /unknown state nothing\.deep\. There is no namespace "nothing"\. Namespaces: form/);
  expectProblem({ tag: 'p', children: { state: 'name' } }, /unknown state name\. A state binding is written namespace\.key\. Did you mean "form\.name"\?/);
  expectProblem({ tag: 'p', children: { state: 'form.nmae' } }, /unknown state form\.nmae\. Namespace "form" has no state key or derived value "nmae"\. Did you mean "name"\? It has: name, rows, count, upper/);
  expectProblem({ tag: 'p', children: { item: 'x' } }, /item binding outside each/);
  assert.deepEqual(problems({ tag: 'p', children: { join: [{ state: 'form.upper' }, ' / ', { length: { state: 'form.rows' } }] } }), []);
});

test('handler arguments cannot be operators: only literals, {event}, {state} and {item} exist at event time', () => {
  const button = (argument) => ({ tag: 'button', children: 'go', on: { click: ['form.save', { name: argument, age: 1 }] } });
  expectProblem(button({ not: { state: 'form.name' } }), /an action argument can be a literal, \{event: path\}, \{state: key\}, \{item: field\} or \{row: name\.field\}, not \{not: \.\.\.\}/);
  assert.deepEqual(problems(button({ state: 'form.name' })), []);
  assert.deepEqual(problems(button({ event: 'target.value' })), []);
});

test('handlers: action must exist; arguments must match the declaration in name and literal type', () => {
  const button = (handler) => ({ tag: 'button', children: 'go', on: { click: handler } });
  expectProblem(button(['nope']), /unknown action nope\. Actions are written namespace\.verb: form\.save, form\.ping, form\.load/);
  expectProblem(button(['form.sve', {}]), /unknown action form\.sve\. Did you mean "form\.save"\?/);
  expectProblem(button(['form.save', { name: 'x' }]), /missing argument age for form\.save/);
  expectProblem(button(['form.save', { name: 'x', age: 3, extra: 1 }]), /unknown argument extra for form\.save \(declared: name, age\)/);
  expectProblem(button(['form.save', { name: 'x', age: 'three' }]), /form\.save expects number, got a literal string/);
  expectProblem(button(['form.ping', { surprise: true }]), /unknown argument surprise for form\.ping \(declared: none\)/);
  expectProblem(button('form.ping'), /handler must be \[actionName, args\?, options\?\] or a list of those/);
  expectProblem(button(['form.ping', {}, { prevent: true }]), /unknown key prevent/);
  expectProblem(button(['form.save', { name: { state: 'form.name' }, age: { event: 5 } }]), /event needs a path string/);
  assert.deepEqual(problems(button(['form.save', { name: { state: 'form.name' }, age: 3 }])), []);
  assert.deepEqual(problems(button(['form.load', { data: { any: ['json'] } }])), []);
});

test('several handlers on one event: a list of at least two, each checked, a list of one refused', () => {
  const button = (handler) => ({ tag: 'button', children: 'go', on: { click: handler } });
  assert.deepEqual(problems(button([['form.ping'], ['form.save', { name: 'a', age: 1 }]])), []);
  expectProblem(button([['form.ping'], ['form.nope']]), /\.on\.click\[1\]: unknown action form\.nope/);
  expectProblem(button([['form.save', { name: 'a' }], ['form.ping']]), /\.on\.click\[0\]: missing argument age for form\.save/);
  expectProblem(button([['form.ping']]), /a list of one handler is the handler itself/);
  expectProblem(button([]), /handler must be \[actionName, args\?, options\?\] or a list of those/);
});

test('events and key chords: known event names, keys only on keydown/keyup, canonical modifier order', () => {
  const input = (on) => ({ tag: 'input', props: { 'aria-label': 'x' }, on });
  expectProblem(input({ hover: ['form.ping'] }), /bad event hover/);
  expectProblem(input({ 'click.Enter': ['form.ping'] }), /only keydown and keyup accept a key/);
  expectProblem(input({ 'keydown.Shift+Control+k': ['form.ping'] }), /modifiers must be unique and in the order Control\+Alt\+Shift\+Meta/);
  expectProblem(input({ 'keydown.Shift+Shift+k': ['form.ping'] }), /modifiers must be unique/);
  assert.deepEqual(problems(input({ 'keydown.Control+Alt+Shift+Meta+k': ['form.ping'], 'keyup.Escape': ['form.ping'], submit: ['form.ping'], focusin: ['form.ping'] })), []);
});

test('props: wrong names from other frameworks, object values, unsafe URLs', () => {
  expectProblem({ tag: 'div', props: { className: 'x' } }, /props\.className: use "class"/);
  expectProblem({ tag: 'label', props: { htmlFor: 'x' }, children: 'l' }, /props\.htmlFor: use "for"/);
  expectProblem({ tag: 'button', props: { onClick: 'x' }, children: 'b' }, /events go in the "on" key/);
  expectProblem({ tag: 'div', props: { style: { color: 'red' } } }, /props\.style: must be a literal or a binding \(build a style string with join\)/);
  expectProblem({ tag: 'a', props: { href: 'javascript:alert(1)' }, children: 'x' }, /unsafe URL/);
  expectProblem({ tag: 'a', props: { href: 'data:text/html;base64,AAAA' }, children: 'x' }, /unsafe URL/);
  assert.deepEqual(problems({ tag: 'div', props: { style: { join: ['width:', { length: { state: 'form.rows' } }, 'px'] } } }), []);
});

test('accessibility and structure rules', () => {
  expectProblem({ tag: 'select' }, /select needs aria-label/);
  expectProblem({ tag: 'textarea' }, /textarea needs aria-label/);
  expectProblem({ tag: 'input' }, /input needs aria-label/);
  expectProblem({ tag: 'img', props: { src: '/a.png' } }, /img needs alt/);
  expectProblem({ tag: 'a', props: { href: '#/' } }, /a needs text or aria-label/);
  expectProblem({ tag: 'img', props: { alt: '' }, children: 'x' }, /img cannot have children/);
  expectProblem({ tag: 'hr', children: 'x' }, /hr cannot have children/);
  expectProblem({ tag: 'blink' }, /bad tag blink/);
  assert.deepEqual(problems({ tag: 'input', props: { type: 'hidden' } }), []);
  assert.deepEqual(problems({ tag: 'img', props: { src: '/a.png', alt: '' } }), []);
});

test('explicit ids must be unique non-empty strings', () => {
  expectProblem({ tag: 'div', children: [{ tag: 'p', id: 'same', children: 'a' }, { tag: 'p', id: 'same', children: 'b' }] }, /duplicate id same/);
  expectProblem({ tag: 'div', id: '' }, /id must be a non-empty string/);
});

test('namespace declarations are checked: names, keys, shapes, derive and actions', () => {
  const bad = validate({ tag: 'p', children: 'x' }, {
    namespaces: {
      broken: {
        state: {},
        derive: { broken: 'not a function' },
        actions: { noRun: { args: {} }, badType: { args: { amount: 'integer' }, run() {} } },
      },
    },
  });
  assert.ok(bad.includes('action broken.noRun: run must be a function'));
  assert.ok(bad.includes('action broken.badType.amount: bad type integer'));
  assert.ok(bad.includes('derive broken.broken: must be a function (get) => value'));
});

test('namespace names, state keys and action verbs are identifiers, with the fix in the message', () => {
  const found = validate({ tag: 'p', children: 'x' }, { namespaces: { 'todo-list': { state: {} }, ok: { state: { 'next-id': 1 }, actions: { 'add.item': { args: {}, run() {} } } } } });
  assert.match(found[0], /namespace: "todo-list" is not allowed\. A namespace name is the first half of every state key and action name \("todos\.add"\).* Write "todoList"/);
  assert.match(found.join('\n'), /namespace "ok" state key: "next-id" is not allowed\..* Write "nextId"/);
  assert.match(found.join('\n'), /namespace "ok" action: "add\.item" is not allowed\..* Write "addItem"/);
});

test('a namespace with an unknown key suggests the right one', () => {
  const found = validate({ tag: 'p', children: 'x' }, { namespaces: { todos: { state: {}, action: {} } } });
  assert.deepEqual(found, ['namespace "todos": unknown key "action". Did you mean "actions"? Allowed keys: state, derive, actions, resources, shapes, rowState']);
});

test('a derived value and a state key of one namespace cannot share a name', () => {
  const found = validate({ tag: 'p', children: 'x' }, { namespaces: { todos: { state: { count: 1 }, derive: { count: () => 2 } } } });
  assert.match(found[0], /derive todos\.count: has the same name as a state key of "todos"/);
});

test('calls: the target must exist, live in another namespace, not call on, and not repeat', () => {
  const run = () => {};
  const found = validate({ tag: 'p', children: 'x' }, {
    namespaces: {
      todos: { actions: { add: { args: {}, calls: ['search.clr', 'todos.other', 'search.clear', 'search.clear', 'filter.reset'], run }, other: { args: {}, run } } },
      search: { actions: { clear: { args: {}, run } } },
      filter: { actions: { reset: { args: {}, calls: ['search.clear'], run } } },
    },
  });
  assert.match(found[0], /action todos\.add: calls\[0\] "search\.clr" is not an action\. Did you mean "search\.clear"\?/);
  assert.match(found[1], /calls\[1\] "todos\.other" is in the same namespace "todos"\. calls is for actions of other namespaces/);
  assert.match(found[2], /calls\[3\] "search\.clear" is listed twice/);
  assert.match(found.join('\n'), /calls\[4\] "filter\.reset" itself declares calls\. A called action cannot call further actions \(one level only\)/);
});

test('initialState: only declared namespaces and keys, with suggestions', () => {
  const found = validate({ tag: 'p', children: 'x' }, { ...context, initialState: { fom: { name: 'x' }, form: { nmae: 'y', count: 2 } } });
  assert.match(found[0], /initialState: unknown namespace "fom"\. Did you mean "form"\?/);
  assert.match(found[1], /initialState\.form\.nmae: "form" has no state key "nmae"\. Did you mean "name"\?/);
  assert.equal(found.length, 2);
});

test('a clean spec has no problems', () => {
  const spec = { tag: 'main', children: [{ tag: 'h1', children: 'Hello' }, { tag: 'input', props: { 'aria-label': 'Name', value: { state: 'form.name' } } }] };
  assert.deepEqual(validate(spec, { namespaces: { form: { state: { name: '' } } } }), []);
});

test('a handler that names an action when none are declared is reported, not a crash', () => {
  const found = validate({ tag: 'button', on: { click: ['go'] }, children: 'x' }, { namespaces: {} });
  assert.ok(found.some((message) => /unknown action go/.test(message)), JSON.stringify(found));
});

test('an unknown state key in a binding suggests the nearest one', () => {
  const found = problems({ tag: 'p', children: { state: 'form.cuont' } });
  assert.ok(found.some((message) => /unknown state form\.cuont\. Namespace "form" has no state key or derived value "cuont"\. Did you mean "count"\?/.test(message)), JSON.stringify(found));
});

test('an action without args is refused: write args: {} for an action without arguments', () => {
  const found = validate({ tag: 'p', children: 'x' }, { namespaces: { form: { actions: { reset: { run() {} } } } } });
  assert.ok(found.some((message) => /action form\.reset: args is required and must be an object\. Write args: {}/.test(message)), JSON.stringify(found));
});

test('unknown options of app() and validate() are refused, an old state/derive/actions shape with the way forward', () => {
  const spec = { tag: 'p', children: 'x' };
  assert.deepEqual(validate(spec, { namespces: {} }), ['validate: unknown context key "namespces". Did you mean "namespaces"? Allowed keys: namespaces, initialState']);
  assert.match(validate(spec, { state: {}, actions: {} })[0], /unknown context key "state"\. Allowed keys: namespaces, initialState$/);
  assert.throws(() => app({ dev: true, state: {}, spec, root: createRoot() }), /app: unknown option "state"\. .*Allowed options: namespaces, initialState, spec, root, plugins, dev, debug, basePath$/);
  assert.throws(() => app({ dev: true, namespces: {}, spec, root: createRoot() }), /app: unknown option "namespces"\. Did you mean "namespaces"\?/);
});

test('state paths with empty segments, and malformed actions, are reported without crashing', () => {
  assert.match(problems({ tag: 'p', children: { state: 'form.rows.' } })[0], /state form\.rows\. has an empty path segment/);
  assert.match(problems({ tag: 'p', children: { state: 'form.rows..id' } })[0], /empty path segment/);
  const found = validate(spec0(), { namespaces: { a: { actions: 'oops' }, b: { actions: { 'x.y': { args: {}, run() {} }, go: { args: {}, calls: ['a.q', 'b.x.y'], run() {} } } } } });
  assert.ok(found.some((message) => /namespace "a": actions must be an object/.test(message)), JSON.stringify(found));
  assert.ok(found.some((message) => /calls\[0\] "a\.q" is not an action/.test(message)), JSON.stringify(found));
});
const spec0 = () => ({ tag: 'p', children: 'x' });
