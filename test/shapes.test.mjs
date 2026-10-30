// Shapes: what one item of a list looks like. Static {item} checks, runtime checks of writes (development), initial and
// incoming state, and the `validate` hook for a runtime type checker (a hand-written one stands in for zod here).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountSpec } from './support/helpers.mjs';

const { validate } = await import('../src/ui.js');

const editors = (shapes, items = [{ id: 1, title: 'a', dirty: false }]) => ({
  editors: {
    state: { items },
    derive: { titles: (get) => get('items').map((item) => ({ ...item })) },
    shapes,
    actions: {
      add: { args: { item: 'json' }, run: (store, { item }) => store.set('items', [...store.get('items'), item]) },
    },
  },
});
const shape = { items: { fields: { id: 'number', title: 'string', dirty: 'boolean' } } };
const list = (binding) => ({ tag: 'ul', children: { each: 'editors.items', key: 'id', template: { tag: 'li', children: binding } } });
const quiet = (callback) => { const original = console.error; console.error = () => {}; try { return callback(); } finally { console.error = original; } };

test('{item} bindings are checked against the list shape, with a suggestion and the fields', () => {
  const problems = (binding) => validate(list(binding), { namespaces: editors(shape) });
  assert.deepEqual(problems({ item: 'title' }), []);
  assert.deepEqual(problems({ item: '.' }), []);
  assert.deepEqual(problems({ item: 'txet' }), ['$.0.each.0: unknown item field txet. Fields of "editors.items": id, title, dirty']);
  assert.match(problems({ join: [{ item: 'titel' }, 'x'] })[0], /unknown item field titel\. Did you mean "title"\? Fields of "editors\.items": id, title, dirty/);
  // a handler argument reads the row too
  const handler = { tag: 'ul', children: { each: 'editors.items', key: 'id', template: { tag: 'li', children: { tag: 'button', children: 'x', on: { click: ['editors.add', { item: { item: 'idd' } }] } } } } };
  assert.match(validate(handler, { namespaces: editors(shape) })[0], /unknown item field idd\. Did you mean "id"\?/);
  // a nested each over a field of the row has no shape: nothing is claimed about it
  const nested = { tag: 'ul', children: { each: 'editors.items', key: 'id', template: { tag: 'li', children: { tag: 'ul', children: { each: { item: 'tags' }, key: '.', template: { tag: 'li', children: { item: 'anything' } } } } } } };
  assert.deepEqual(validate(nested, { namespaces: editors(shape) }).filter((message) => /unknown item field anything/.test(message)), []);
});

test('a list without a shape, or a shape of validate only, claims nothing about {item}', () => {
  assert.deepEqual(validate(list({ item: 'whatever' }), { namespaces: editors(undefined) }), []);
  assert.deepEqual(validate(list({ item: 'whatever' }), { namespaces: editors({ items: { validate: () => null } }) }), []);
});

test('a derived list can have a shape too (static checks only)', () => {
  const namespaces = editors({ titles: { fields: { id: 'number', title: 'string', dirty: 'boolean' } } });
  const spec = { tag: 'ul', children: { each: 'editors.titles', key: 'id', template: { tag: 'li', children: { item: 'tilte' } } } };
  assert.match(validate(spec, { namespaces })[0], /unknown item field tilte\. Did you mean "title"\?/);
});

test('writes are checked in development: a missing field, an unknown field, a wrong type, a non-list', () => {
  const { ui } = mountSpec({ namespaces: editors(shape), spec: { tag: 'p', children: 'x' } });
  const add = (item) => quiet(() => ui.dispatch('editors.add', { item }));
  assert.match(add({ id: 2, title: 'b' }), /^editors\.add: store\.set\("items"\): item 1 is missing the field "dirty"\. Fix the value, or change the shape in "shapes"$/);
  assert.match(add({ id: 2, title: 'b', dirty: false, extra: 1 }), /item 1 has the unknown field "extra"\. Fields: id, title, dirty\./);
  assert.match(add({ id: '2', title: 'b', dirty: false }), /item 1: field "id" should be number, got string\./);
  assert.match(add({ id: 2, title: null, dirty: false }), /field "title" should be string, got null\./);
  assert.equal(ui.state().editors.items.length, 1, 'refused writes changed nothing');
  assert.equal(add({ id: 2, title: 'b', dirty: true }), undefined);
  assert.equal(ui.state().editors.items.length, 2);
});

test('declared and incoming state must fit the shape too', () => {
  assert.match(validate({ tag: 'p', children: 'x' }, { namespaces: editors(shape, [{ id: 1 }]) })[0], /state editors\.items: item 0 is missing the field "title"/);
  const found = validate({ tag: 'p', children: 'x' }, { namespaces: editors(shape), initialState: { editors: { items: [{ id: 'x', title: 't', dirty: false }] } } });
  assert.match(found[0], /initialState editors\.items: item 0: field "id" should be number, got string\./);
});

test('validate is the hook for a runtime type checker: its message becomes the error, a throw is reported, null passes', () => {
  // A stand-in for `schema.safeParse(item)`: zod, valibot or a hand-written function all fit.
  const parse = (item) => (item.title.length > 5 ? 'Title must be at most 5 characters' : null);
  const namespaces = editors({ items: { fields: shape.items.fields, validate: parse } });
  const { ui } = mountSpec({ namespaces, spec: { tag: 'p', children: 'x' } });
  const add = (item) => quiet(() => ui.dispatch('editors.add', { item }));
  assert.match(add({ id: 2, title: 'too long', dirty: false }), /store\.set\("items"\): item 1: Title must be at most 5 characters$/);
  assert.equal(add({ id: 2, title: 'ok', dirty: false }), undefined);
  const throwing = editors({ items: { validate: () => { throw new Error('boom'); } } });
  assert.match(validate({ tag: 'p', children: 'x' }, { namespaces: throwing })[0], /item 0: the shape's validate threw: boom/);
});

test('shape declarations are checked: names, keys, types, functions, and what is empty', () => {
  const found = (shapes) => validate({ tag: 'p', children: 'x' }, { namespaces: editors(shapes) });
  assert.match(found({ itmes: { fields: { id: 'number' } } })[0], /shapes\.itmes: "itmes" is not a state key or derived value of "editors"\. Did you mean "items"\?/);
  assert.match(found({ items: { field: {} } })[0], /shapes\.items: unknown key "field"\. Did you mean "fields"\? Allowed keys: fields, validate/);
  assert.match(found({ items: {} })[0], /shapes\.items: needs fields, validate or both/);
  assert.match(found({ items: { fields: { id: 'integer' } } })[0], /shapes\.items\.fields\.id: bad type "integer"\. Types are string, number, boolean, json/);
  assert.match(found({ items: { fields: {} } })[0], /shapes\.items\.fields: must be a non-empty object/);
  assert.match(found({ items: { validate: 'no' } })[0], /shapes\.items\.validate: must be a function \(item\) => string \| null/);
  assert.match(found([])[0], /shapes must be an object of state key or derived name to \{ fields\?, validate\? \}, got a list/);
});

test('items that already passed are not validated again: one changed item costs one validate call', () => {
  let calls = 0;
  const namespaces = editors({ items: { fields: shape.items.fields, validate: () => (calls++, null) } });
  const { ui } = mountSpec({ namespaces, spec: { tag: 'p', children: 'x' } });
  // The declared item was checked once as declared; the running state holds a copy of it, which the first write checks once.
  ui.dispatch('editors.add', { item: { id: 2, title: 't', dirty: false } });
  const warm = calls;
  for (let id = 3; id <= 7; id++) ui.dispatch('editors.add', { item: { id, title: 't', dirty: false } });
  assert.equal(calls - warm, 5, 'five more adds validate five new items, not the list again');
  quiet(() => ui.dispatch('editors.add', { item: { id: 8, title: 1, dirty: false } }));
  assert.equal(calls - warm, 5, 'an item that fails the field check never reaches validate and is not remembered as passed');
  assert.equal(ui.state().editors.items.length, 7);
});

test('a non-list value and a non-object item are refused with what was expected', () => {
  const { ui } = mountSpec({
    namespaces: {
      editors: {
        state: { items: [] },
        shapes: shape,
        actions: {
          replace: { args: { value: 'json' }, run: (store, { value }) => store.set('items', value) },
        },
      },
    },
    spec: { tag: 'p', children: 'x' },
  });
  const replace = (value) => quiet(() => ui.dispatch('editors.replace', { value }));
  assert.match(replace({ id: 1 }), /store\.set\("items"\): this key has a shape, so it holds a list of items, got object\. Fix the value, or change the shape in "shapes"/);
  assert.match(replace('text'), /holds a list of items, got string/);
  assert.match(replace([5]), /store\.set\("items"\): item 0 must be an object with the fields id, title, dirty, got number\./);
  assert.match(replace([null]), /item 0 must be an object with the fields id, title, dirty, got null\./);
});

test('a refused write undoes the writes the action made before it', () => {
  const { ui } = mountSpec({
    namespaces: {
      editors: {
        state: { items: [], count: 0 },
        shapes: shape,
        actions: { broken: { args: {}, run: (store) => { store.set('count', 5); store.set('items', [{ id: 1 }]); } } },
      },
    },
    spec: { tag: 'p', children: 'x' },
  });
  assert.match(quiet(() => ui.dispatch('editors.broken')), /item 0 is missing the field "title"/);
  assert.deepEqual(ui.state().editors, { items: [], count: 0 });
});

test('each with a {state} binding gets the shape of the list too', () => {
  const spec = { tag: 'ul', children: { each: { state: 'editors.items' }, key: 'id', template: { tag: 'li', children: { item: 'titel' } } } };
  assert.match(validate(spec, { namespaces: editors(shape) })[0], /unknown item field titel\. Did you mean "title"\?/);
});

test('an incoming state that does not fit its shape is reported even when something else is wrong first', () => {
  const found = validate({ tag: 'p', children: 'x' }, {
    namespaces: { ...editors(shape), other: { state: { fine: 1 } } },
    initialState: { other: { fine: () => {} }, editors: { items: [{ id: 'x', title: 't', dirty: false }] } },
  });
  assert.ok(found.some((message) => /initialState other\.fine: a function is not JSON/.test(message)), JSON.stringify(found));
  assert.ok(found.some((message) => /initialState editors\.items: item 0: field "id" should be number/.test(message)), JSON.stringify(found));
});
