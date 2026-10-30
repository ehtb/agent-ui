// The page "/checkout": the cart and the details to order. The order is sent to the server (api.js), which checks it again,
// clears the cart and answers a reference. This page never loads the catalog or the product components. Behavior only: the
// content is view.js next to this file (the build and the server import it, a browser bundle does not).
import { cart } from '../../shared/cart.js';
import { plugins } from '../../shared/plugins.js';
import { shell } from '../../shared/shell.js';
import { ORDER_FIELDS, emptyOrder, validateOrder } from './rules.js';

const checkout = {
  state: { values: emptyOrder(), errors: {}, status: 'editing', note: '', reference: '', request: null }, // status: 'editing' | 'sending' | 'done'
  derive: { busy: (get) => get('status') === 'sending' },
  actions: {
    field: {
      args: { name: 'string', value: 'string' },
      run: (store, { name, value }) => {
        if (!ORDER_FIELDS.includes(name)) return;
        const { [name]: ignoredError, ...remainingErrors } = store.get('errors');
        store.set('values', { ...store.get('values'), [name]: value });
        store.set('errors', remainingErrors);
      },
    },
    submit: {
      args: {},
      run: (store) => {
        if (store.get('status') !== 'editing' || store.get('cart.isEmpty')) return; // already sending or done, or nothing to order
        const errors = validateOrder(store.get('values'));
        store.set('errors', errors);
        store.set('note', '');
        if (Object.keys(errors).length) return;
        store.set('status', 'sending');
        store.set('request', { ...store.get('values') });
      },
    },
    started: { args: {}, run: (store) => store.set('note', '') },
    // The server cleared the cart; `cart.reload` makes this page ask for it again.
    succeeded: {
      args: { data: 'json' },
      calls: ['cart.reload'],
      run: (store, { data }, call) => {
        store.set('status', 'done');
        store.set('reference', String(data.reference));
        store.set('values', emptyOrder());
        store.set('request', null);
        call('cart.reload', {});
      },
    },
    failed: {
      args: { message: 'string' },
      run: (store, { message }) => {
        store.set('status', 'editing');
        store.set('note', message);
        store.set('request', null);
      },
    },
  },
  resources: [{ watch: ['request'], request: ({ request }) => (request ? { url: '/api/order', method: 'POST', body: request } : null), onStart: 'started', onSuccess: 'succeeded', onError: 'failed' }],
};

export const page = {
  namespaces: { cart, checkout },
  plugins,
  shell,
  head: { title: 'Checkout - Trailside', description: 'Review your cart and place the order.' },
  ready: (state) => state.cart.status === 'ready' || state.cart.status === 'failed',
};
