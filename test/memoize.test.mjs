// memoizeItem: per-item caching for derived lists. (Reusable state logic is a namespace mounted under several names:
// see test/namespaces.test.mjs.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountSpec } from './support/helpers.mjs';

const { memoizeItem } = await import('../src/memoize.js');

test('memoizeItem computes once per item reference and recomputes only replaced items', () => {
  let calls = 0;
  const label = memoizeItem((item) => (calls++, `#${item.id}`));
  const first = { id: 1 };
  const second = { id: 2 };
  assert.deepEqual([label(first), label(second), label(first)], ['#1', '#2', '#1']);
  assert.equal(calls, 2, 'the unchanged reference hits the cache');
  assert.equal(label({ ...first }), '#1');
  assert.equal(calls, 3, 'a replaced item (new reference) is recomputed');
});

test('memoizeItem caches an undefined result and works inside derive with reference-stable rows', async () => {
  let calls = 0;
  const nothing = memoizeItem(() => void calls++);
  const item = { id: 1 };
  nothing(item);
  nothing(item);
  assert.equal(calls, 1, 'undefined is a cached result, not a miss');

  const formatRow = memoizeItem((item) => ({ id: item.id, label: `#${item.id}` }));
  const namespaces = {
    list: {
      state: { items: [{ id: 1 }, { id: 2 }] },
      derive: { rows: (get) => get('items').map(formatRow) },
      actions: { add: { args: {}, run: (store) => store.set('items', [...store.get('items'), { id: 3 }]) } },
    },
  };
  const spec = { each: 'list.rows', key: 'id', template: { tag: 'li', children: { item: 'label' } } };
  const { ui } = mountSpec({ namespaces, spec: { tag: 'ul', children: spec } });
  const before = ui.derived().list.rows;
  ui.dispatch('list.add');
  await ui.settle();
  const after = ui.derived().list.rows;
  assert.equal(after[0], before[0], 'an unchanged item keeps its derived row reference');
  assert.equal(after.length, 3);
  assert.equal(ui.errors.length, 0);
});

test('memoizeItem refuses a non-function and an item without reference identity, with the fix', () => {
  assert.throws(() => memoizeItem('not a function'), /memoizeItem: want a function of one item, got string\. Write memoizeItem\(\(item\) => expensiveResult\(item\)\)/);
  const identity = memoizeItem((item) => item);
  assert.throws(() => identity('text'), /memoizeItem: want an object item to cache by its reference, got string\. A string or number has no identity to cache by; compute those directly, without memoizeItem/);
  assert.throws(() => identity(null), /got null/);
  assert.equal(identity([1, 2]).length, 2, 'arrays have reference identity and are allowed');
});
