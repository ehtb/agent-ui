// The benchmark pages, driven on the test DOM: the actions do what the benchmark script measures, one toggle writes one
// row (the other items keep their references), and the /count/:count page derives its rows from the URL until an action
// materializes the list. The real-browser numbers are benchmark.mjs's to print, not a test's to assert.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoot } from '@ehtb/agent-ui/testing/dom-shim.mjs';
import { assertCost, assertNoErrors } from '@ehtb/agent-ui/testing/helpers.mjs';
import { definePage } from '@ehtb/agent-ui/pages';

const folder = new URL('../pages/', import.meta.url);
const { page } = await import(new URL('page.js', folder));
const contentView = await import(new URL('view.js', folder));
const countPageModule = await import(new URL('count/[count]/page.js', folder));
const countView = await import(new URL('count/[count]/view.js', folder));
const { generateItems } = await import(new URL('../bench/items.js', folder));

const mountHome = () => {
  const root = createRoot();
  const ui = definePage(page, { path: '/', view: contentView.view }).create({ root, dev: true });
  return { ui, root };
};

test('the generated items are a pure function of the count', () => {
  assert.deepEqual(generateItems(3), [
    { id: 1, title: 'Item 1', price: 10, done: true },
    { id: 2, title: 'Item 2', price: 17, done: false },
    { id: 3, title: 'Item 3', price: 24, done: false },
  ]);
  assert.deepEqual(generateItems(3), generateItems(3));
});

test('seed, toggle, add and clear, with the unchanged items keeping their references', async () => {
  const { ui } = mountHome();
  ui.dispatch('bench.seed', { count: 3 });
  await ui.settle();
  assert.equal(ui.get('bench.rows').length, 3);
  assert.equal(ui.state().bench.nextId, 4);

  const untouched = ui.get('bench.items')[0];
  ui.dispatch('bench.toggle', { id: 2 });
  await ui.settle();
  assert.equal(ui.get('bench.items')[1].done, true);
  assert.equal(ui.get('bench.items')[0], untouched, 'a toggle must not rebuild the other items');

  ui.dispatch('bench.addOne', {});
  await ui.settle();
  assert.equal(ui.get('bench.items').length, 4);
  assert.equal(ui.get('bench.items')[3].id, 4);
  assert.equal(ui.state().bench.nextId, 5);

  ui.dispatch('bench.addMany', { count: 2 });
  await ui.settle();
  assert.equal(ui.get('bench.items').length, 6);
  assert.equal(ui.get('bench.items')[5].id, 6);
  assert.equal(ui.state().bench.nextId, 7);

  ui.dispatch('bench.clear', {});
  await ui.settle();
  assert.deepEqual(ui.get('bench.items'), []);
  assert.equal(ui.state().bench.nextId, 1);
  assertNoErrors(ui);
});

test('toggling one row of a hundred writes one row', async () => {
  const { ui } = mountHome();
  ui.dispatch('bench.seed', { count: 100 });
  await ui.settle();
  await assertCost(ui, 'bench.toggle', { id: 41 }, { effectRuns: 12, domWrites: 5 });
  assertNoErrors(ui);
});

test('the count page derives its rows from the URL, and the first action materializes the list', async () => {
  const root = createRoot();
  const ui = definePage(countPageModule.page, { path: '/count/:count', view: countView.view }).create({
    root,
    dev: true,
    win: { location: { pathname: '/count/5', search: '', hash: '' } },
  });
  await ui.settle();
  assert.equal(ui.state().route.params.count, '5');
  assert.equal(ui.get('bench.rows').length, 5);
  assert.equal(ui.state().bench.items, null, 'nothing is materialized until an action writes it');

  ui.dispatch('bench.toggle', { id: 1 });
  await ui.settle();
  assert.equal(ui.state().bench.items.length, 5, 'the list is materialized as it was shown, then toggled');
  assert.equal(ui.get('bench.items')[0].done, false, 'the toggled item flipped from done to not done');
  assert.equal(ui.get('bench.items')[1].done, false);
  assert.equal(ui.get('bench.items')[2].done, false, 'id 3 is the third item; only every third item from the start is done');
  assertNoErrors(ui);
});
