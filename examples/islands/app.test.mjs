// The two islands in the test DOM: each renders, the catalog sends its count to the badge, a repeated click changes nothing, and a
// toggle of one product costs one row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoot, findElements, fireEvent } from '@ehtb/agent-ui/testing/dom-shim.mjs';
import { assertCost, assertNoErrors, assertRepeatable } from '@ehtb/agent-ui/testing/helpers.mjs';
import { connectIslands } from './client/islands.js';
import { createBadge } from './client/widgets/badge.js';
import { createCatalog } from './client/widgets/catalog.js';
import { PRODUCTS } from './server.js';

const start = () => {
  const catalogApp = createCatalog({ root: createRoot(), dev: true, initialState: { catalog: { products: PRODUCTS } } });
  const badgeApp = createBadge({ root: createRoot(), dev: true });
  const stop = connectIslands(catalogApp, badgeApp);
  return { catalogApp, badgeApp, stop };
};

test('a click in the catalog island reaches the badge island through syncApps, in the badge\'s own log', async () => {
  const { catalogApp, badgeApp, stop } = start();
  const buttons = () => catalogApp.tree().filter((entry) => entry.id === 'add');
  assert.equal(buttons().length, 3);
  catalogApp.dispatch('catalog.add', { id: 'assam' });
  await catalogApp.settle();
  assert.equal(badgeApp.state().badge.count, 1);
  assert.deepEqual(badgeApp.log.at(-1), ['badge.set', { count: 1 }]);
  await assertRepeatable(catalogApp, 'catalog.add', { id: 'assam' });
  assert.equal(badgeApp.state().badge.count, 1);
  assertNoErrors(catalogApp);
  assertNoErrors(badgeApp);
  stop();
});

test('the button in a row dispatches its own product, and adding one product costs one badge text and no list work', async () => {
  const root = createRoot();
  const catalogApp = createCatalog({ root, dev: true, initialState: { catalog: { products: PRODUCTS } } });
  const badgeApp = createBadge({ root: createRoot(), dev: true });
  connectIslands(catalogApp, badgeApp);
  const rooibos = findElements(root, (element) => element.getAttribute('data-key') === 'rooibos')[0];
  fireEvent(findElements(rooibos, (element) => element.localName === 'button')[0], 'click');
  await catalogApp.settle();
  assert.deepEqual(catalogApp.state().catalog.inCart, ['rooibos']);
  // The list's rows keep their items, so nothing in the catalog is written; the badge writes its text once.
  await assertCost(catalogApp, 'catalog.add', { id: 'sencha' }, { domWrites: 1, stateChanged: 1 });
  assert.equal(badgeApp.state().badge.count, 2);
});
