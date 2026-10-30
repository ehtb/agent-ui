// The calculator's behavior on the headless DOM shim. Styling is not tested here (see classes.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoot } from '@ehtb/agent-ui/testing/dom-shim.mjs';
import { definePage } from '@ehtb/agent-ui/pages';
import { page } from './pages/page.js';
import { view } from './pages/view.js';

const { create } = definePage(page, { path: '/', view });

test('the total follows billing and seats', async () => {
  const ui = create({ root: createRoot(), dev: true });
  assert.equal(ui.derived().billing.totalLabel, '$36 per month');
  ui.dispatch('billing.set', { value: 'yearly' });
  ui.dispatch('seats.add', { by: 2 });
  await ui.settle();
  assert.equal(ui.derived().billing.totalLabel, '$600 per year');
  assert.equal(ui.derived().seats.label, '5 seats');
});

test('seats stay between 1 and 50, and an unknown billing period falls back to monthly', async () => {
  const ui = create({ root: createRoot(), dev: true });
  ui.dispatch('seats.add', { by: -10 });
  assert.equal(ui.state().seats.count, 1);
  ui.dispatch('seats.add', { by: 100 });
  assert.equal(ui.state().seats.count, 50);
  ui.dispatch('billing.set', { value: 'weekly' });
  assert.equal(ui.state().billing.period, 'monthly');
  assert.equal(ui.errors.length, 0);
});
