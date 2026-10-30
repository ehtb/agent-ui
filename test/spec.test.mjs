// Builders (@ehtb/agent-ui/spec): they return exactly the JSON the grammar describes, and a wrong call fails where it is made.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as builders from '../src/spec.js';
import { validate, grammar } from '../src/validate.js';

const { div, button, input, ul, li, a, state, item, event, not, length, equals, greaterThan, lessThan, and, or, join, act, when, each } = builders;

const messageOf = (call) => {
  try {
    call();
  } catch (error) {
    return error.message;
  }
  return 'no error';
};

test('every tag of the grammar has a builder, and nothing else is exported as one', () => {
  for (const tag of grammar.tags) assert.deepEqual(builders[tag](tag === 'input' ? {} : null), { tag }, tag);
  const operators = ['state', 'item', 'row', 'rowState', 'event', 'not', 'length', 'equals', 'greaterThan', 'lessThan', 'and', 'or', 'join', 'act', 'when', 'each', 'pageSlot'];
  assert.deepEqual(Object.keys(builders).filter((name) => !grammar.tags.includes(name)).sort(), operators.sort());
});

test('builders return the same JSON as the raw grammar', () => {
  const built = div(
    { class: 'page', id: 'root', classes: { busy: state('todos.loading') }, transition: 150 },
    'Title',
    input({ type: 'text', value: state('todos.draft'), on: { input: act('todos.setDraft', { text: event('target.value') }), 'keydown.Enter': act('todos.add', { text: state('todos.draft') }, { preventDefault: true }) } }),
    ul(null, each('todos.items', 'id', li(null, item('title'), when(not(item('done')), button({ on: { click: act('todos.done', { id: item('id') }) } }, 'Done'))))),
    when(and(greaterThan(length(state('todos.items')), 0), or(equals(state('todos.mode'), 'all'), lessThan(1, 2))), [a({ href: join('/x/', state('todos.id')) }, 'link')], 'Empty'),
  );
  const raw = {
    tag: 'div',
    id: 'root',
    transition: 150,
    props: { class: 'page' },
    classes: { busy: { state: 'todos.loading' } },
    children: [
      'Title',
      {
        tag: 'input',
        props: { type: 'text', value: { state: 'todos.draft' } },
        on: { input: ['todos.setDraft', { text: { event: 'target.value' } }], 'keydown.Enter': ['todos.add', { text: { state: 'todos.draft' } }, { preventDefault: true }] },
      },
      {
        tag: 'ul',
        children: {
          each: 'todos.items',
          key: 'id',
          template: {
            tag: 'li',
            children: [{ item: 'title' }, { when: { not: { item: 'done' } }, children: { tag: 'button', on: { click: ['todos.done', { id: { item: 'id' } }] }, children: 'Done' } }],
          },
        },
      },
      {
        when: { and: [{ greaterThan: [{ length: { state: 'todos.items' } }, 0] }, { or: [{ equals: [{ state: 'todos.mode' }, 'all'] }, { lessThan: [1, 2] }] }] },
        children: [{ tag: 'a', props: { href: { join: ['/x/', { state: 'todos.id' }] } }, children: 'link' }],
        otherwise: 'Empty',
      },
    ],
  };
  assert.deepEqual(built, raw);
  assert.equal(JSON.stringify(built, Object.keys(built).sort()).length > 0, true);
});

test('a built spec passes the validator when its actions exist', () => {
  const spec = div(null, button({ on: { click: act('counter.add', { by: 1 }) } }, 'Add'), div(null, state('counter.count')));
  const namespaces = { counter: { state: { count: 0 }, actions: { add: { args: { by: 'number' }, run() {} } } } };
  assert.deepEqual(validate(spec, { namespaces }), []);
});

test('id is the spec address, domId is the HTML id attribute', () => {
  assert.deepEqual(input({ id: 'a', domId: 'b' }), { tag: 'input', id: 'a', props: { id: 'b' } });
});

test('children: one child is not wrapped, arrays are flattened one level, no children means no key', () => {
  assert.equal(div(null, 'x').children, 'x');
  assert.deepEqual(div(null, 'a', ['b', 'c']).children, ['a', 'b', 'c']);
  assert.equal('children' in div(null), false);
  assert.equal('props' in div({ id: 'a' }), false);
});

test('several handlers on one event are a list of act(...) and pass the builder check', () => {
  const node = button({ on: { click: [act('todos.add', {}), act('search.clear')] } }, 'Go');
  assert.deepEqual(node.on.click, [['todos.add', {}], ['search.clear']]);
});

test('act: a bare action is just its name, arguments and options are added only when given', () => {
  assert.deepEqual(act('x.y'), ['x.y']);
  assert.deepEqual(act('x.y', {}), ['x.y', {}]);
  assert.deepEqual(act('x.y', undefined, { stopPropagation: true }), ['x.y', {}, { stopPropagation: true }]);
});

const WRONG_CALLS = [
  ['className', () => div({ className: 'x' }), 'div(...): "className" is another convention. Write class'],
  ['htmlFor', () => div({ htmlFor: 'x' }), '"htmlFor" is another convention. Write for'],
  ['onClick', () => div({ onClick: 1 }), '"onClick" is another convention. Events go in "on"'],
  ['props', () => div({ props: {} }), 'attributes are written directly, not under "props"'],
  ['attributes forgotten', () => div('x'), 'the first argument is "x", but it must be the attributes object or null. Write div(null, "x")'],
  ['node as attributes', () => div(div(null)), 'the first argument is a node'],
  ['missing attributes', () => div(), 'the first argument is missing'],
  ['unknown event', () => button({ on: { clik: act('a.b') } }), 'unknown event "clik". Did you mean "click"?'],
  ['handler not act', () => button({ on: { click: 'a' } }), 'the handler of "click" is "a", not a handler. Write on: { click: act('],
  ['classes constant', () => div({ classes: { on: true } }), 'classes.on is true, not a binding'],
  ['undefined attribute', () => div({ title: undefined }), 'attribute title is undefined'],
  ['object attribute', () => div({ title: { a: 1 } }), 'attribute title is {"a":1}, which is not a literal or a binding'],
  ['void children', () => input({}, 'x'), 'input cannot have children'],
  ['number child', () => div(null, 3), 'child 1 is the number 3, which is not a node. Write String(number)'],
  ['null child', () => div(null, null), 'child 1 is null, which is not a node. Nothing is skipped silently'],
  ['nested array', () => div(null, [['a']]), 'item 1 is a list inside a list'.replace('item 1 is', 'child 1, item 1 is')],
  ['transition', () => div({ transition: 0 }), 'transition is 0. Write a number of milliseconds greater than 0'],
  ['empty id', () => div({ id: '' }), 'id is "". Write a non-empty string'],
  ['bad option', () => act('a.b', {}, { preventDefaults: true }), 'unknown handler option "preventDefaults". Did you mean "preventDefault"?'],
  ['operator argument', () => act('a.b', { v: not(state('a.x')) }), 'argument "v" is an operator expression'],
  ['undefined argument', () => act('a.b', { v: undefined }), 'argument "v" is undefined'],
  ['arguments not object', () => act('a.b', 'x'), 'the arguments are "x"'],
  ['empty action name', () => act(''), 'the action name is empty'],
  ['action without namespace', () => act('add'), 'the action name "add" is not namespace.verb'],
  ['action with two dots', () => act('todos.items.add'), 'the action name "todos.items.add" is not namespace.verb'],
  ['state without namespace', () => state('draft'), 'state(...): "draft" has no namespace. A state binding is namespace.key'],
  ['each source without namespace', () => each('todos', 'id', li(null)), 'each(...): the source "todos" has no namespace'],
  ['handler list of one', () => button({ on: { click: [act('a.b')] } }), 'the handler of "click" is a list of one handler'],
  ['equals arity', () => equals(1), 'equals(...): it takes exactly 2 operands, got 1. Write equals(x, y)'],
  ['and arity', () => and(state('a.b')), 'and(...): it takes at least 2 operands, got 1'],
  ['operand object', () => not({ a: 1 }), 'not(...): operand 1 is {"a":1}'],
  ['state path', () => state(''), 'state(...): the argument is "". Write a non-empty string'],
  ['when condition', () => when('x', 'y'), 'when(...): the condition is "x", not a binding'],
  ['when empty', () => when(state('a.b')), 'when(...): it has neither children nor otherwise'],
  ['when number', () => when(state('a.b'), 5), 'children, item 1 is the number 5'],
  ['each template', () => each('a.b', 'id', 'x'), 'each(...): the template must be one element'],
  ['each key', () => each('a.b', 1, li(null)), 'each(...): the key is 1'],
  ['each source', () => each(5, 'id', li(null)), 'each(...): the source is 5'],
];
for (const [name, call, expected] of WRONG_CALLS) {
  test(`wrong call: ${name}`, () => assert.ok(messageOf(call).includes(expected), `${messageOf(call)}\n  should include\n${expected}`));
}

test('the error points into the author’s file, not into the framework', () => {
  const stack = (() => {
    try {
      div({ className: 'x' });
    } catch (error) {
      return error.stack;
    }
  })();
  assert.ok(stack.split('\n').some((line) => line.includes('spec.test.mjs')));
});

// ---- review findings: error messages must never throw themselves, and nothing is skipped silently ----
test('a value that cannot be written as JSON still gets the intended message, not a TypeError', () => {
  const circular = { name: 'event' };
  circular.self = circular;
  assert.match(messageOf(() => div(null, circular)), /^div\(\.\.\.\): child 1 is an object \(name, self\) that cannot be shown as JSON, which is not a node\. /);
  assert.match(messageOf(() => div(null, Symbol('x'))), /child 1 is Symbol\(x\), which is not a node/);
  assert.match(messageOf(() => div(null, 10n)), /child 1 is 10, which is not a node/);
  assert.match(messageOf(() => act('a.b', { v: circular }, 5)), /^act\(\.\.\.\): the options are 5/);
  assert.match(messageOf(() => div({ title: circular })), /attribute title is an object \(name, self\)/);
});

test('when with an empty list as its only content is rejected like when with nothing', () => {
  assert.match(messageOf(() => when(state('a.b'), [])), /when\(\.\.\.\): it has neither children nor otherwise \(an empty list counts as nothing\)\. Give it something/);
  assert.match(messageOf(() => when(state('a.b'), [], [])), /neither children nor otherwise/);
  assert.match(messageOf(() => when(state('a.b'), [].map((x) => x))), /neither children nor otherwise/);
  assert.deepEqual(when(state('a.b'), [], 'x'), { when: { state: 'a.b' }, children: [], otherwise: 'x' });
  assert.deepEqual(when(state('a.b'), ['x']), { when: { state: 'a.b' }, children: ['x'] });
});

test('a list of handlers made of anything but act(...) is refused, and paths with empty segments fail at the call', () => {
  assert.match(messageOf(() => button({ on: { click: [act('a.b'), 'c.d'] } }, 'x')), /the handler of "click" contains "c\.d", not a handler/);
  assert.match(messageOf(() => state('todos..draft')), /state\(\.\.\.\): "todos\.\.draft" has no namespace/);
  assert.match(messageOf(() => state('todos.items.')), /state\(\.\.\.\): "todos\.items\." has no namespace/);
  assert.match(messageOf(() => each('todos..items', 'id', li(null))), /each\(\.\.\.\): the source "todos\.\.items" has no namespace/);
});

test('a builder refuses a value that is not JSON, a transition that is not finite, a rowState argument, and a key chord that the validator would refuse', () => {
  const { rowState } = builders;
  assert.match(messageOf(() => div({ title: NaN }, 'x')), /title is NaN, which is not a literal or a binding/);
  assert.match(messageOf(() => div({ title: Infinity }, 'x')), /title is Infinity/);
  assert.match(messageOf(() => li({ transition: Infinity }, 'x')), /transition is Infinity\. Write a number of milliseconds greater than 0/);
  assert.match(messageOf(() => button({ on: { click: act('todo.add', { open: rowState('pickers.open') }) } }, 'x')), /argument "open" is a rowState binding\. An action argument is a literal/);
  assert.equal(messageOf(() => input({ 'aria-label': 'x', on: { keydown: act('todo.add', {}) } })), 'no error');
  assert.match(messageOf(() => input({ 'aria-label': 'x', on: { 'keydown.Shift+Control+k': act('todo.add', {}) } })), /modifiers must be unique and in the order Control\+Alt\+Shift\+Meta/);
  assert.match(messageOf(() => input({ 'aria-label': 'x', on: { 'click.Enter': act('todo.add', {}) } })), /unknown event "click\.Enter"|only keydown and keyup accept a key/);
});
