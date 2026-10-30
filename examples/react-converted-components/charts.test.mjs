// The chart page without a browser: its data, its actions and its form, in the test shim. The plugin that draws with Chart.js needs a real canvas and
// stays out of the way here (it only starts when the page runs in a browser window); browser.test.mjs is the test that drives it in Chrome.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { definePage } from '@ehtb/agent-ui/pages';
import { createRoot, fireEvent, findElements } from '@ehtb/agent-ui/testing/dom-shim.mjs';

const { page } = await import('./pages/charts/page.js');
const { view, layout } = await import('./pages/charts/view.js');

const mount = async () => {
  const root = createRoot();
  const ui = definePage(page, { path: '/charts', view, layout }).create({ root, dev: true });
  await ui.settle();
  return { ui, root, byId: (id) => findElements(root, (element) => element.dataset.id === id) };
};

test('the page lists its data, an empty element for the chart, and a field per quarter', async () => {
  const { ui, byId } = await mount();
  assert.deepEqual(ui.state().sales.series.map((point) => point.value), [12, 19, 7, 15]);
  assert.equal(byId('revenue-chart')[0].childNodes.length, 0, 'the chart element is empty: a plugin draws into it');
  assert.equal(byId('revenue-chart')[0].getAttribute('role'), 'img');
  assert.equal(byId('value-input').length, 4);
  assert.equal(byId('chart-summary')[0].textContent, 'Total: 53k. Selected: none');
});

test('editing a value and selecting a quarter change the state the chart follows; an empty field changes nothing', async () => {
  const { ui, byId } = await mount();
  const field = byId('value-input')[0];
  field.value = '30';
  field.valueAsNumber = 30;
  fireEvent(field, 'input', { target: field });
  ui.dispatch('sales.select', { id: 'q2' });
  await ui.settle();
  assert.equal(ui.state().sales.series[0].value, 30);
  assert.equal(byId('chart-summary')[0].textContent, 'Total: 71k. Selected: Q2');
  ui.dispatch('sales.setValue', { id: 'q1', value: Number.NaN });
  ui.dispatch('sales.setValue', { id: 'q1', value: -5 });
  assert.equal(ui.state().sales.series[0].value, 0, 'a negative value is clamped, NaN is ignored');
  assert.deepEqual(ui.errors, []);
});
