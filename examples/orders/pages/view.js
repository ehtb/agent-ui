// The content of the page at "/": only the server and the build import it. The browser downloads the page behavior and
// the finished spec, never the builders that assemble the view.
import { act, button, div, each, equals, event, form, greaterThan, h1, h2, input, item, join, length, li, main, not, option, p, section, select, span, state, ul, when } from '@ehtb/agent-ui/spec';
import { ORDER_FILTERS } from './page.js';

const hasCustomer = not(equals(state('customer.data'), null));
const hasOrders = greaterThan(length(state('orders.data')), 0);
const hasNotes = greaterThan(length(state('notes.forCustomer')), 0);
const hasNoteError = greaterThan(length(state('notes.error')), 0);

const lookupForm = form(
  { id: 'lookup-form', on: { submit: act('lookup.select', {}) } },
  input({ id: 'customer-input', type: 'text', placeholder: 'Customer id (try 1 or 2)', 'aria-label': 'Customer id', value: state('lookup.customerDraft'), on: { input: act('lookup.setDraft', { value: event('target.value') }) } }),
  button({ id: 'lookup-button', type: 'submit' }, 'Look up'),
);

const customerPanel = section(
  { id: 'customer-panel' },
  when(equals(state('customer.status'), 'loading'), p({ id: 'customer-loading', role: 'status' }, 'Loading customer…')),
  when(equals(state('customer.status'), 'failed'), div({ id: 'customer-error', role: 'alert' }, join('Could not load customer: ', state('customer.error'), '. Dismiss it to look up again. '), button({ id: 'customer-dismiss', on: { click: act('lookup.clear', {}) } }, 'Dismiss'))),
  when(hasCustomer, div({ id: 'customer-card' }, h2({ id: 'customer-name' }, state('customer.data.name')), p({ id: 'customer-email' }, state('customer.data.email')), span({ id: 'customer-tier' }, state('customer.data.tier')))),
);

const shipmentPanel = div(
  { id: 'shipment-panel' },
  when(equals(state('shipment.status'), 'loading'), p({ id: 'shipment-loading', role: 'status' }, 'Loading shipment…')),
  when(equals(state('shipment.status'), 'failed'), p({ id: 'shipment-error', role: 'alert' }, join('No shipment: ', state('shipment.error')))),
  when(not(equals(state('shipment.data'), null)), p({ id: 'shipment-info' }, join(state('shipment.data.carrier'), ' ', state('shipment.data.trackingCode'), ', arrives ', state('shipment.data.eta')))),
);

const ordersPanel = section(
  { id: 'orders-panel' },
  h2(null, 'Orders'),
  when(
    equals(state('orders.status'), 'loading'),
    div(null, p({ id: 'orders-loading', role: 'status' }, 'Loading orders…'), button({ id: 'orders-cancel', on: { click: act('lookup.cancelOrders', {}) } }, 'Cancel')),
  ),
  when(state('lookup.ordersCancelled'), div(null, p({ id: 'orders-cancelled', role: 'status' }, 'Loading orders was cancelled.'), button({ id: 'orders-retry', on: { click: act('lookup.retryOrders', {}) } }, 'Retry'))),
  when(equals(state('orders.status'), 'failed'), p({ id: 'orders-error', role: 'alert' }, join('Could not load orders: ', state('orders.error')))),
  when(
    hasOrders,
    div(
      null,
      select(
        { id: 'order-filter', 'aria-label': 'Filter orders', value: state('lookup.orderFilter'), on: { change: act('lookup.setFilter', { value: event('target.value') }) } },
        ORDER_FILTERS.map((filter) => option({ value: filter }, filter)),
      ),
      ul(
        { id: 'order-list' },
        each(
          'orders.rows',
          'id',
          li(
            { class: 'order-row' },
            button({ class: 'order-button', classes: { selected: item('selected') }, on: { click: act('lookup.selectOrder', { id: item('id') }) } }, join('Order ', item('id'))),
            span({ class: 'order-status' }, item('status')),
            span({ class: 'order-total' }, item('totalLabel')),
          ),
        ),
      ),
      p({ id: 'orders-summary' }, state('orders.summary')),
      shipmentPanel,
    ),
  ),
);

const notesPanel = section(
  { id: 'notes-panel' },
  h2(null, 'Notes'),
  form(
    { id: 'note-form', on: { submit: act('notes.add', {}) } },
    input({ id: 'note-input', type: 'text', placeholder: 'Add a note', 'aria-label': 'Note', value: state('notes.draft'), on: { input: act('notes.setDraft', { value: event('target.value') }) } }),
    button({ id: 'note-button', type: 'submit' }, 'Add note'),
    when(hasNoteError, span({ id: 'note-error', role: 'alert' }, state('notes.error'))),
  ),
  when(hasNotes, ul({ id: 'note-list' }, each('notes.forCustomer', 'id', li({ class: 'note-row' }, span({ class: 'note-text' }, item('text')), button({ class: 'note-remove', on: { click: act('notes.remove', { id: item('id') }) } }, 'Remove'))))),
);

export const view = main({ id: 'orders-app' }, h1(null, 'Orders'), lookupForm, customerPanel, when(hasCustomer, div(null, ordersPanel, notesPanel)));
