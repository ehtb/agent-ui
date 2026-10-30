// Orders: a multistep flow. Look up a customer, then their orders load, then pick an order and its shipment loads.
// Shows chained resources (each step watches what the previous step stored, across namespaces), a reusable `loadable`
// namespace that comes with its loading/loaded/failed/idle actions and its resource, derived rows and a validated form.
// This file is behavior only; the content is view.js next to it.
import { withResources } from '@ehtb/agent-ui/resources';

export const ORDER_FILTERS = ['all', 'open', 'shipped'];

// Reusable state logic for one piece of remote data, as a namespace: `data`, `status` and `error`, the four lifecycle
// actions a resource calls, and the resource itself (it belongs to the namespace that owns what it loads). Only the
// lifecycle actions may write the three keys (`owns`). Mounted as `customer`, `orders` and `shipment`, each gets its own
// copy; what a step depends on is read from other namespaces (`watch` takes qualified keys).
const loadable = (initialValue, { watch, request }) => ({
  state: { data: initialValue, status: 'idle', error: '' },
  actions: {
    loading: {
      args: {},
      run: (store) => {
        store.set('data', initialValue);
        store.set('status', 'loading');
        store.set('error', '');
      },
    },
    loaded: {
      args: { data: 'json' },
      run: (store, { data }) => {
        store.set('data', data);
        store.set('status', 'ready');
      },
    },
    failed: {
      args: { message: 'string' },
      run: (store, { message }) => {
        store.set('data', initialValue);
        store.set('status', 'failed');
        store.set('error', message);
      },
    },
    idle: {
      args: {},
      run: (store) => {
        store.set('data', initialValue);
        store.set('status', 'idle');
        store.set('error', '');
      },
    },
  },
  // Each step watches what the previous step stored, owns its output keys, and resets them via `onIdle` when its input
  // becomes null. Choosing the id that is already loaded changes nothing, so nothing reloads.
  resources: [{ watch, owns: ['data', 'status', 'error'], request, onStart: 'loading', onSuccess: 'loaded', onError: 'failed', onIdle: 'idle' }],
});

const formatMoney = (cents) => (cents / 100).toFixed(2);

export const namespaces = {
  // The inputs of the flow: which customer, which order, the orders filter. The three loadables below watch these.
  lookup: {
    state: { customerDraft: '', customerId: '', selectedOrderId: null, ordersCancelled: false, orderFilter: 'all' },
    actions: {
      setDraft: { args: { value: 'string' }, run: (store, { value }) => store.set('customerDraft', value) },
      // Writes only the lookup inputs; the loadables own `customer.data`, `orders.data` and `shipment.data` and reset them
      // through their own `loading` and `idle` actions.
      select: {
        args: {},
        calls: ['notes.clearError'],
        run: (store, args, call) => {
          const customerId = store.get('customerDraft').trim();
          if (!customerId) return;
          store.set('customerId', customerId);
          store.set('ordersCancelled', false);
          store.set('selectedOrderId', null);
          call('notes.clearError', {});
        },
      },
      clear: {
        args: {},
        run: (store) => {
          store.set('customerId', '');
          store.set('ordersCancelled', false);
          store.set('selectedOrderId', null);
        },
      },
      // Cancelling is state: `ordersCancelled` is watched by the orders resource, which then aborts its request and runs
      // `orders.idle`. Retrying clears the flag, which loads the orders again.
      cancelOrders: { args: {}, run: (store) => store.set('ordersCancelled', true) },
      retryOrders: { args: {}, run: (store) => store.set('ordersCancelled', false) },
      selectOrder: { args: { id: 'number' }, run: (store, { id }) => store.set('selectedOrderId', id) },
      setFilter: { args: { value: 'string' }, run: (store, { value }) => store.set('orderFilter', value) },
    },
  },
  customer: loadable(null, {
    watch: ['lookup.customerId'],
    request: (values) => (values['lookup.customerId'] ? { url: `/api/customers/${encodeURIComponent(values['lookup.customerId'])}.json` } : null),
  }),
  orders: {
    ...loadable([], {
      watch: ['customer.data', 'lookup.ordersCancelled'],
      request: (values) => (values['customer.data'] && !values['lookup.ordersCancelled'] ? { url: `/api/customers/${values['customer.data'].id}/orders.json` } : null),
    }),
    derive: {
      rows: (get) => {
        const filter = get('lookup.orderFilter');
        const selectedOrderId = get('lookup.selectedOrderId');
        return get('data')
          .filter((order) => filter === 'all' || order.status === filter)
          .map((order) => ({ ...order, totalLabel: formatMoney(order.totalCents), selected: order.id === selectedOrderId }));
      },
      summary: (get) => {
        const orders = get('data');
        const totalCents = orders.reduce((sum, order) => sum + order.totalCents, 0);
        return `${orders.length} ${orders.length === 1 ? 'order' : 'orders'}, ${formatMoney(totalCents)} in total`;
      },
    },
  },
  shipment: loadable(null, {
    watch: ['lookup.selectedOrderId'],
    request: (values) => (values['lookup.selectedOrderId'] ? { url: `/api/orders/${values['lookup.selectedOrderId']}/shipment.json` } : null),
  }),
  // Notes about a customer (kept in memory). A note needs a customer that is loaded, which `notes.add` reads from `customer`.
  notes: {
    state: { draft: '', error: '', items: [], nextId: 1 },
    derive: { forCustomer: (get) => get('items').filter((note) => note.customerId === get('lookup.customerId')) },
    actions: {
      setDraft: { args: { value: 'string' }, run: (store, { value }) => store.set('draft', value) },
      clearError: { args: {}, run: (store) => store.set('error', '') },
      // Validate first, write last.
      add: {
        args: {},
        run: (store) => {
          const text = store.get('draft').trim();
          if (!store.get('customer.data')) return store.set('error', 'Look up a customer first');
          if (!text) return store.set('error', 'A note cannot be empty');
          const id = store.get('nextId');
          store.set('items', [...store.get('items'), { id, customerId: store.get('lookup.customerId'), text }]);
          store.set('nextId', id + 1);
          store.set('draft', '');
          store.set('error', '');
        },
      },
      remove: { args: { id: 'number' }, run: (store, { id }) => store.set('items', store.get('items').filter((note) => note.id !== id)) },
    },
  },
};

export const page = { head: { title: 'Orders' }, namespaces, plugins: [withResources] };
