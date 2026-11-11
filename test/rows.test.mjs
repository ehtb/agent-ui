// Rows: the name an each gives its row (`as`, read with `row`) and the state that belongs to rows (`rowState`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fireEvent, findElements, mutations } from './support/dom-shim.mjs';
import { mountSpec } from './support/helpers.mjs';
import { div, ul, li, span, button, each, row, rowState, item, act, when, join } from '../src/spec.js';

const { validate } = await import('../src/ui.js');

const orders = {
  state: { list: [{ id: 1, customer: 'Ada', lines: [{ id: 10, sku: 'pen' }, { id: 11, sku: 'ink' }] }, { id: 2, customer: 'Bo', lines: [{ id: 20, sku: 'pad' }] }], removed: [] },
  actions: { removeLine: { args: { orderId: 'number', lineId: 'number' }, run: (store, { orderId, lineId }) => store.set('removed', [...store.get('removed'), `${orderId}/${lineId}`]) } },
};
const nestedSpec = (innerTemplate) =>
  ul({ id: 'orders' }, each('orders.list', 'id', li({ id: 'order' }, ul({ id: 'lines' }, each(item('lines'), 'id', innerTemplate))), { as: 'order' }));
const byId = (root, id) => findElements(root, (element) => element.dataset.id === id);
const texts = (root, id) => byId(root, id).map((element) => element.textContent);

test('row(): the inner template of a nested each reads the outer row by its name, in bindings and in handler arguments', async () => {
  const { ui, root } = mountSpec({
    namespaces: { orders },
    spec: nestedSpec(li({ id: 'line' }, span({ id: 'label' }, join(row('order.customer'), ': ', item('sku'))), button({ id: 'drop', on: { click: act('orders.removeLine', { orderId: row('order.id'), lineId: item('id') }) } }, 'x'))),
  });
  await ui.settle();
  assert.deepEqual(texts(root, 'label'), ['Ada: pen', 'Ada: ink', 'Bo: pad']);
  fireEvent(byId(root, 'drop')[2], 'click');
  fireEvent(byId(root, 'drop')[1], 'click');
  assert.deepEqual(ui.state().orders.removed, ['2/20', '1/11']);
  assert.deepEqual(ui.errors, []);
});

test('row(): follows the outer row when it is replaced, and reads a whole item when the list holds strings', async () => {
  const { ui, root } = mountSpec({
    namespaces: {
      tags: {
        state: { groups: [{ id: 'a', title: 'First', tags: ['x', 'y'] }] },
        actions: { rename: { args: { title: 'string' }, run: (store, { title }) => store.set('groups', [{ ...store.get('groups')[0], title }]) } },
      },
    },
    spec: div(null, each('tags.groups', 'id', div({ id: 'group' }, each(item('tags'), '.', span({ id: 'tag' }, join(row('group.title'), '/', item('.'))))), { as: 'group' })),
  });
  await ui.settle();
  assert.deepEqual(texts(root, 'tag'), ['First/x', 'First/y']);
  ui.dispatch('tags.rename', { title: 'Second' });
  await ui.settle();
  assert.deepEqual(texts(root, 'tag'), ['Second/x', 'Second/y']);
});

test('row(): a row is whole when the name stands alone', async () => {
  const { ui, root } = mountSpec({
    namespaces: { box: { state: { words: ['a', 'b'] } } },
    spec: div(null, each('box.words', '.', div({ id: 'word' }, each(item('.'), '.', span({ id: 'letter' }, row('word')))), { as: 'word' })),
  });
  await ui.settle();
  assert.deepEqual(texts(root, 'letter'), ['a', 'b']);
});

test('row(): mistakes are reported with the place, the names in scope and the fix', () => {
  const problemsOf = (spec) => validate(spec, { namespaces: { orders } });
  assert.match(problemsOf(div(null, span(null, row('order.id'))))[0], /row binding outside each\./);
  assert.match(problemsOf(nestedSpec(span(null, row('ordr.id'))))[0], /no enclosing each says as: "ordr"\. Did you mean "order"\? Names in scope: order/);
  assert.match(problemsOf(ul(null, each('orders.list', 'id', li(null, span(null, row('order.id'))))))[0], /no enclosing each says as: "order"\. No enclosing each has an as\. Write each\(source, key, template, \{ as: "name" \}\) on the outer each/);
  assert.match(problemsOf(ul(null, each('orders.list', 'id', li(null, ul(null, each(item('lines'), 'id', li(null, 'x'), { as: 'order' }))), { as: 'order' })))[0], /as: "order" is already the name of an enclosing each, and a row would hide it\. Give this each another name/);
  assert.match(problemsOf({ tag: 'ul', children: { each: 'orders.list', key: 'id', as: 'Bad name', template: { tag: 'li', children: 'x' } } })[0], /as is "Bad name"\. Write a name in letters and digits starting with a lowercase letter/);
  assert.match(problemsOf({ tag: 'ul', children: { each: 'orders.list', key: 'id', ass: 'order', template: { tag: 'li', children: 'x' } } })[0], /unknown key ass .*Did you mean "as"\?/);
  assert.deepEqual(problemsOf(nestedSpec(span(null, row('order.customer')))), []);
});

test('row(): fields are checked against the shape of the outer list when it has one', () => {
  const shaped = { orders: { ...orders, shapes: { list: { fields: { id: 'number', customer: 'string', lines: 'json' } } } } };
  const spec = nestedSpec(span(null, row('order.custmer')));
  assert.match(validate(spec, { namespaces: shaped })[0], /unknown field custmer of the rows named "order"\. Did you mean "customer"\? Fields: id, customer, lines/);
});

test('the builders refuse a wrong as or row, naming the builder', () => {
  assert.throws(() => each('a.b', 'id', li(null, 'x'), { name: 'order' }), /each\(\.\.\.\): unknown option "name"\. Did you mean "as"\?/);
  assert.throws(() => each('a.b', 'id', li(null, 'x'), { as: 'Order' }), /each\(\.\.\.\): as is "Order"\. Write a name in letters and digits starting with a lowercase letter/);
  assert.throws(() => row('Order.id'), /row\(\.\.\.\): "Order\.id" is not name\.field/);
  assert.throws(() => rowState('pickers'), /rowState\(\.\.\.\): "pickers" is not namespace\.field/);
});

// ---- rowState ----------------------------------------------------------------------------------------------------------

const pickers = {
  rowState: { open: false, note: '' },
  actions: {
    toggle: { args: { id: 'number' }, run: (store, { id }) => store.setRow(id, { open: !store.getRow(id).open }) },
    write: { args: { id: 'number', note: 'string' }, run: (store, { id, note }) => store.setRow(id, { note }) },
    forget: { args: { id: 'number' }, run: (store, { id }) => store.clearRow(id) },
  },
};
const people = { state: { items: [{ id: 1, name: 'Ada' }, { id: 2, name: 'Bo' }, { id: 3, name: 'Cy' }] } };
const rowStateSpec = ul({ id: 'people' }, each('people.items', 'id', li({ id: 'person', classes: { open: rowState('pickers.open') } }, span({ id: 'name' }, item('name')), span({ id: 'note' }, rowState('pickers.note')), button({ id: 'toggle', on: { click: act('pickers.toggle', { id: item('id') }) } }, 'toggle'))));

test('rowState: a row field is read per row with its default, written by the namespace, and kept sparse', async () => {
  const { ui, root } = mountSpec({ namespaces: { people, pickers }, spec: rowStateSpec });
  await ui.settle();
  assert.deepEqual(ui.state().pickers, { rowState: {} });
  const classes = () => byId(root, 'person').map((element) => element.getAttribute('class') ?? '');
  assert.deepEqual(classes(), ['', '', '']);

  fireEvent(byId(root, 'toggle')[1], 'click');
  await ui.settle();
  assert.deepEqual(classes(), ['', 'open', '']);
  assert.deepEqual(ui.state().pickers.rowState, { 2: { open: true } });

  ui.dispatch('pickers.write', { id: 2, note: 'hi' });
  await ui.settle();
  assert.deepEqual(texts(root, 'note'), ['', 'hi', '']);
  assert.deepEqual(ui.state().pickers.rowState, { 2: { open: true, note: 'hi' } });

  ui.dispatch('pickers.toggle', { id: 2 });
  ui.dispatch('pickers.write', { id: 2, note: '' });
  await ui.settle();
  assert.deepEqual(ui.state().pickers.rowState, {}, 'a row equal to the defaults is dropped');
  assert.deepEqual(classes(), ['', '', '']);
});

test('rowState: a change to one row writes to the DOM of that row only', async () => {
  const { ui, root } = mountSpec({ namespaces: { people, pickers }, spec: rowStateSpec });
  await ui.settle();
  mutations.count = 0;
  fireEvent(byId(root, 'toggle')[0], 'click');
  await ui.settle();
  assert.equal(mutations.count, 1);
  mutations.count = 0;
  ui.dispatch('pickers.write', { id: 1, note: 'same' });
  ui.dispatch('pickers.write', { id: 1, note: 'same' });
  await ui.settle();
  assert.equal(mutations.count, 1, 'writing the same value again changes nothing');
});

test('rowState: rows are replayed, forgotten with clearRow, and start from initialState', async () => {
  const { ui } = mountSpec({ namespaces: { people, pickers }, initialState: { pickers: { rowState: { 3: { open: true } } } }, spec: rowStateSpec });
  await ui.settle();
  assert.deepEqual(ui.state().pickers.rowState, { 3: { open: true } });
  ui.dispatch('pickers.toggle', { id: 1 });
  ui.dispatch('pickers.forget', { id: 3 });
  await ui.settle();
  const after = ui.state();
  assert.deepEqual(after.pickers.rowState, { 1: { open: true } });
  assert.deepEqual(await ui.replay(), after);
});

test('rowState: a row whose item is removed keeps its state until the owner forgets it', async () => {
  const { ui, root } = mountSpec({
    namespaces: { people: { ...people, actions: { drop: { args: {}, run: (store) => store.set('items', store.get('items').slice(1)) } } }, pickers },
    spec: rowStateSpec,
  });
  await ui.settle();
  ui.dispatch('pickers.toggle', { id: 1 });
  ui.dispatch('people.drop');
  await ui.settle();
  assert.equal(byId(root, 'person').length, 2);
  assert.deepEqual(ui.state().pickers.rowState, { 1: { open: true } });
});

test('rowState: an action refuses a field that is not declared, a namespace without rowState, and a direct write', async () => {
  const { ui } = mountSpec({
    namespaces: {
      people,
      pickers: { ...pickers, actions: { ...pickers.actions, bad: { args: {}, run: (store) => store.setRow(1, { opn: true }) }, raw: { args: {}, run: (store) => store.set('rowState', {}) }, key: { args: {}, run: (store) => store.setRow({}, { open: true }) } } },
      plain: { state: { x: 1 }, actions: { attempt: { args: {}, run: (store) => store.setRow(1, { open: true }) } } },
    },
    spec: rowStateSpec,
  });
  assert.match(ui.dispatch('pickers.bad'), /pickers\.bad: store\.setRow\(1, \.\.\.\): namespace "pickers" has no row field "opn"\. Did you mean "open"\? Row fields: open, note/);
  assert.match(ui.dispatch('pickers.raw'), /store\.set\("rowState"\): "rowState" holds the per-row state and is written with store\.setRow/);
  assert.match(ui.dispatch('pickers.key'), /the row key must be a string or a number, the key of the list's rows/);
  assert.match(ui.dispatch('plain.attempt'), /store\.setRow\(\.\.\.\): namespace "plain" has no rowState\. Declare the per-row fields with their defaults: rowState: \{ open: false \}/);
});

test('rowState: the declaration and the bindings are checked with suggestions', () => {
  const check = (spec, namespaces = { people, pickers }) => validate(spec, { namespaces });
  assert.match(check(span(null, rowState('pickers.open')))[0], /rowState binding outside each/);
  assert.match(check(ul(null, each('people.items', 'id', li(null, rowState('pickers.opn')))))[0], /rowState of "pickers" has no field "opn"\. Did you mean "open"\? Fields: open, note/);
  assert.match(check(ul(null, each('people.items', 'id', li(null, rowState('pickrs.open')))))[0], /namespace "pickrs" has no rowState\. Did you mean "pickers"\? Declare it: rowState: \{ open: <default> \}\. Namespaces with rowState: pickers/);
  assert.match(check(rowStateSpec, { people, pickers: { ...pickers, state: { rowState: 1 } } })[0], /state key "rowState" clashes with rowState/);
  assert.match(check(rowStateSpec, { people, pickers: { ...pickers, rowState: {} } })[0], /rowState must be an object of row field names to their default values/);
  assert.match(check(rowStateSpec, { people, pickers: { ...pickers, rowState: { Open: false } } })[0], /rowState field: "Open" is not allowed/);
  assert.match(check(rowStateSpec, { people, pickers: { ...pickers, rowState: { open: () => 1, note: '' } } })[0], /rowState pickers\.open: a function is not JSON/);
  assert.deepEqual(check(rowStateSpec), []);
});

test('rowState works under a when inside a row of a nested each (the innermost row is the one that counts)', async () => {
  const { ui, root } = mountSpec({
    namespaces: { orders, pickers },
    spec: nestedSpec(li({ id: 'line' }, when(rowState('pickers.open'), span({ id: 'detail' }, item('sku'))), button({ id: 'toggle', on: { click: act('pickers.toggle', { id: item('id') }) } }, 'x'))),
  });
  await ui.settle();
  assert.equal(byId(root, 'detail').length, 0);
  fireEvent(byId(root, 'toggle')[1], 'click');
  await ui.settle();
  assert.deepEqual(texts(root, 'detail'), ['ink']);
  assert.deepEqual(ui.state().pickers.rowState, { 11: { open: true } });
});

test('rowState: one namespace read for two different lists is refused, naming both', () => {
  const twoLists = div(null,
    ul(null, each('orders.list', 'id', li({ classes: { open: rowState('pickers.open') } }, 'order'))),
    ul(null, each('lines.list', 'id', li({ classes: { open: rowState('pickers.open') } }, 'line'))));
  const problems = validate(twoLists, { namespaces: { orders, lines: { state: { list: [] } }, pickers } });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /rowState of "pickers" is read for the rows of lines\.list, and \$\.0\.0\.each\.classes\.open reads it for the rows of orders\.list\. The state is keyed by row key alone.*Declare a second namespace with its own rowState for one of the lists/);
  const sameList = div(null, ul(null, each('orders.list', 'id', li({ classes: { open: rowState('pickers.open') } }, 'a'))), ul(null, each('orders.list', 'id', li({ classes: { open: rowState('pickers.open') } }, 'b'))));
  assert.deepEqual(validate(sameList, { namespaces: { orders, pickers } }), [], 'two views of one list share the rows on purpose');
});

test('rowState: an outer row is read by its name, rowState("order.pickers.open"), next to the innermost row', async () => {
  const lineNotes = { rowState: { note: '' }, actions: { write: { args: { id: 'number', note: 'string' }, run: (store, { id, note }) => store.setRow(id, { note }) } } };
  const spec = nestedSpec(li({ id: 'line' }, when(rowState('order.pickers.open'), span({ id: 'detail' }, item('sku'))), span({ id: 'note' }, rowState('lineNotes.note')), button({ id: 'toggle', on: { click: act('pickers.toggle', { id: row('order.id') }) } }, 'x')));
  assert.deepEqual(validate(spec, { namespaces: { orders, pickers, lineNotes } }), []);
  const { ui, root } = mountSpec({ namespaces: { orders, pickers, lineNotes }, spec });
  await ui.settle();
  assert.equal(byId(root, 'detail').length, 0);
  fireEvent(byId(root, 'toggle')[0], 'click');
  await ui.settle();
  assert.deepEqual(texts(root, 'detail'), ['pen', 'ink'], 'order 1 is open, so both of its lines show; order 2 stays closed');
  ui.dispatch('lineNotes.write', { id: 11, note: 'low' });
  await ui.settle();
  assert.deepEqual(texts(root, 'note'), ['', 'low', '']);
  assert.deepEqual(ui.errors, []);
});

test('rowState: the name of an outer row is checked with suggestions', () => {
  const namespaces = { orders, pickers };
  assert.match(validate(nestedSpec(span(null, rowState('ordr.pickers.open'))), { namespaces })[0], /no enclosing each says as: "ordr"\. Did you mean "order"\? Names in scope: order/);
  assert.match(validate(nestedSpec(span(null, rowState('order.pickrs.open'))), { namespaces })[0], /namespace "pickrs" has no rowState\. Did you mean "pickers"\?/);
  assert.match(validate(nestedSpec(span(null, rowState('order.pickers.opn'))), { namespaces })[0], /rowState of "pickers" has no field "opn"\. Did you mean "open"\?/);
  assert.throws(() => rowState('a.b.c.d'), /rowState\(\.\.\.\): "a\.b\.c\.d" is not namespace\.field or rowname\.namespace\.field\. Write the namespace/);
});
