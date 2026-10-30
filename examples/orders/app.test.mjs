// The orders example end to end: chained resources, stale responses, failure states, derived rows, notes, replay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { definePage } from '@ehtb/agent-ui/pages';
import { fireEvent, findElements, createRoot, createWindow } from '@ehtb/agent-ui/testing/dom-shim.mjs';
import { flushAsync, createFakeFetch, deferred, outlineById, assertRepeatable } from '@ehtb/agent-ui/testing/helpers.mjs';

const { page } = await import('./pages/page.js');
const { view } = await import('./pages/view.js');
const { create } = definePage(page, { path: '/', view });

// Serves public/api/... from the files, like the built site does; a missing file is a 404.
const fileRespond = (url) => {
  const file = new URL(`./public${url}`, import.meta.url);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { ok: false, status: 404 };
};

const mount = async ({ respond = fileRespond } = {}) => {
  const root = createRoot();
  const fetchFunction = createFakeFetch(respond);
  const ui = create({ root, win: createWindow(), fetchFunction, dev: true });
  await flushAsync(ui);
  const byId = (id) => findElements(root, (element) => element.attributes['data-id'] === id)[0];
  const lookUp = async (id) => {
    ui.dispatch('lookup.setDraft', { value: id });
    ui.dispatch('lookup.select', {});
    await flushAsync(ui);
  };
  return { ui, root, fetchFunction, byId, lookUp };
};

test('nothing is requested until a customer is chosen', async () => {
  const { ui, fetchFunction } = await mount();
  assert.equal(fetchFunction.calls.length, 0);
  assert.equal(outlineById(ui.outline(), 'customer-card'), undefined);
});

test('looking up a customer loads the customer, then their orders, in that order', async () => {
  const { ui, fetchFunction, lookUp } = await mount();
  await lookUp('1');
  assert.deepEqual(fetchFunction.calls.map((call) => call.url), ['/api/customers/1.json', '/api/customers/1/orders.json']);
  assert.equal(outlineById(ui.outline(), 'customer-name').text, 'Ada Lovelace');
  assert.equal(outlineById(ui.outline(), 'orders-summary').text, '3 orders, 184.49 in total');
  assert.deepEqual(ui.log.map((entry) => entry.name ?? entry[0]).filter((name) => /^(lookup|customer|orders)\./.test(name)), ['lookup.setDraft', 'lookup.select', 'customer.loading', 'customer.loaded', 'orders.loading', 'orders.loaded']); // lookup.select called notes.clearError inside itself, so only the outer action is logged
  assert.equal(ui.errors.length, 0);
});

test('choosing an order loads its shipment; an order without one shows the failure', async () => {
  const { ui, lookUp } = await mount();
  await lookUp('1');
  ui.dispatch('lookup.selectOrder', { id: 101 });
  await flushAsync(ui);
  assert.equal(outlineById(ui.outline(), 'shipment-info').text, 'PostNL 3S1234, arrives 2026-10-20');
  ui.dispatch('lookup.selectOrder', { id: 103 });
  await flushAsync(ui);
  assert.equal(outlineById(ui.outline(), 'shipment-info'), undefined);
  assert.equal(outlineById(ui.outline(), 'shipment-error').text, 'No shipment: HTTP 404');
});

test('an unknown customer fails the first step and the later steps never run', async () => {
  const { ui, fetchFunction, lookUp } = await mount();
  await lookUp('99');
  assert.equal(outlineById(ui.outline(), 'customer-error').text, 'Could not load customer: HTTP 404. Dismiss it to look up again.');
  assert.deepEqual(fetchFunction.calls.map((call) => call.url), ['/api/customers/99.json']);
  assert.equal(outlineById(ui.outline(), 'orders-panel'), undefined);
});

test('switching customer clears the old orders and a slower old response never overwrites the new customer', async () => {
  const slowCustomer = deferred();
  const respond = (url) => (url === '/api/customers/1.json' ? slowCustomer : fileRespond(url));
  const { ui, lookUp } = await mount({ respond });
  await lookUp('1'); // still waiting
  await lookUp('2');
  assert.equal(ui.state().customer.data.name, 'Alan Turing');
  slowCustomer.resolve(fileRespond('/api/customers/1.json'));
  await flushAsync(ui);
  assert.equal(ui.state().customer.data.name, 'Alan Turing');
  assert.deepEqual(ui.state().orders.data.map((order) => order.id), [201]);
});

test('re-choosing a customer resets the selected order and shipment', async () => {
  const { ui, lookUp } = await mount();
  await lookUp('1');
  ui.dispatch('lookup.selectOrder', { id: 101 });
  await flushAsync(ui);
  await lookUp('2');
  assert.equal(ui.state().lookup.selectedOrderId, null);
  assert.equal(ui.state().shipment.data, null);
  assert.deepEqual(ui.state().orders.data.map((order) => order.id), [201]);
});

test('the filter narrows the derived rows without another request', async () => {
  const { ui, fetchFunction, lookUp } = await mount();
  await lookUp('1');
  const requests = fetchFunction.calls.length;
  ui.dispatch('lookup.setFilter', { value: 'open' });
  await ui.settle();
  assert.deepEqual(ui.derived().orders.rows.map((row) => row.id), [102, 103]);
  assert.equal(fetchFunction.calls.length, requests);
});

test('notes are validated and kept per customer', async () => {
  const { ui, byId, lookUp } = await mount();
  ui.dispatch('notes.add', {});
  assert.equal(ui.state().notes.error, 'Look up a customer first');
  await lookUp('1');
  ui.dispatch('notes.add', {});
  assert.equal(ui.state().notes.error, 'A note cannot be empty');
  const input = byId('note-input');
  input.value = 'Called about order 102';
  fireEvent(input, 'input');
  ui.dispatch('notes.add', {});
  await flushAsync(ui);
  assert.deepEqual(ui.derived().notes.forCustomer.map((note) => note.text), ['Called about order 102']);
  await lookUp('2');
  assert.deepEqual(ui.derived().notes.forCustomer, []);
  await lookUp('1');
  assert.deepEqual(ui.derived().notes.forCustomer.map((note) => note.text), ['Called about order 102']);
});

test('replaying the log reproduces the state without touching the network', async () => {
  const { ui, fetchFunction, lookUp } = await mount();
  await lookUp('1');
  ui.dispatch('lookup.selectOrder', { id: 102 });
  await flushAsync(ui);
  const before = ui.state();
  const requests = fetchFunction.calls.length;
  ui.replay([...ui.log]);
  await flushAsync(ui);
  assert.deepEqual(ui.state(), before);
  assert.equal(fetchFunction.calls.length, requests);
});

test('cancelling the orders request aborts it, resets the status and can be retried', async () => {
  const gate = deferred();
  const respond = (url) => (url === '/api/customers/1/orders.json' ? gate : fileRespond(url));
  const { ui, fetchFunction, byId, lookUp } = await mount({ respond });
  await lookUp('1');
  assert.equal(ui.state().orders.status, 'loading');
  const ordersCall = fetchFunction.calls.find((call) => call.url === '/api/customers/1/orders.json');
  fireEvent(byId('orders-cancel'), 'click');
  await flushAsync(ui);
  assert.equal(ordersCall.options.signal.aborted, true);
  assert.equal(ui.state().orders.status, 'idle');
  assert.equal(outlineById(ui.outline(), 'orders-cancelled').text, 'Loading orders was cancelled.');
  gate.resolve([]); // the late response is ignored
  await flushAsync(ui);
  assert.deepEqual(ui.state().orders.data, []);
  fetchFunction.calls.length = 0;
  fireEvent(byId('orders-retry'), 'click');
  await flushAsync(ui);
  assert.deepEqual(fetchFunction.calls.map((call) => call.url), ['/api/customers/1/orders.json']);
  assert.equal(ui.state().orders.data.length, 0); // the gate is already resolved with []
  assert.equal(ui.errors.length, 0);
});

test('looking up the same customer again changes nothing, a failed lookup is retried after dismissing it, and user actions are repeatable', async () => {
  let failFirst = true;
  const respond = (url) => {
    if (url === '/api/customers/1.json' && failFirst) {
      failFirst = false;
      return { ok: false, status: 503 };
    }
    return fileRespond(url);
  };
  const { ui, fetchFunction, byId, lookUp } = await mount({ respond });
  await lookUp('1');
  assert.equal(ui.state().customer.status, 'failed');
  fireEvent(byId('customer-dismiss'), 'click');
  await flushAsync(ui);
  assert.equal(ui.state().customer.status, 'idle');
  await lookUp('1');
  assert.equal(ui.state().customer.data.name, 'Ada Lovelace');
  assert.equal(ui.state().orders.data.length, 3);
  const callsBefore = fetchFunction.calls.length;
  await assertRepeatable(ui, 'lookup.select', {});
  assert.equal(fetchFunction.calls.length, callsBefore); // the same id again is a no-op
  assert.equal(ui.state().customer.data.name, 'Ada Lovelace');
  await assertRepeatable(ui, 'lookup.selectOrder', { id: 101 });
  await assertRepeatable(ui, 'lookup.setFilter', { value: 'open' });
  await assertRepeatable(ui, 'lookup.cancelOrders', {});
  await assertRepeatable(ui, 'lookup.retryOrders', {});
  assert.equal(fetchFunction.calls.filter((call) => call.url === '/api/customers/1.json').length, 2);
  assert.equal(ui.errors.length, 0);
});
