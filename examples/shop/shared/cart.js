// The cart: one namespace, listed by every page that shows it. The cart lives on the server (api.js); this namespace is the
// browser's view of it. Every change is a request, and the server's answer is the new cart (`lines`). Changes wait in a queue
// and are sent one at a time, in order: two quick clicks are two requests, and the second never replaces the first.
export const cart = {
  state: { lines: [], status: 'idle', reloadCount: 0, queue: [] }, // lines: [{ id, title, price, quantity }]; queue: requests not yet answered
  derive: {
    count: (get) => get('lines').reduce((sum, line) => sum + line.quantity, 0),
    total: (get) => get('lines').reduce((sum, line) => sum + line.price * line.quantity, 0),
    isEmpty: (get) => get('lines').length === 0,
  },
  actions: {
    add: {
      args: { id: 'number', title: 'string', price: 'number' },
      run: (store, { id, title, price }) => store.set('queue', [...store.get('queue'), { url: '/api/cart/add', method: 'POST', body: { id, title, price } }]),
    },
    remove: { args: { id: 'number' }, run: (store, { id }) => store.set('queue', [...store.get('queue'), { url: '/api/cart/remove', method: 'POST', body: { id } }]) },
    reload: { args: {}, run: (store) => store.set('reloadCount', store.get('reloadCount') + 1) },
    loading: { args: {}, run: (store) => { if (store.get('status') !== 'ready') store.set('status', 'loading'); } },
    // The answer to the request for the cart.
    loaded: { args: { data: 'json' }, run: (store, { data }) => { store.set('lines', data.lines); store.set('status', 'ready'); } },
    // The answer to the change at the head of the queue: the new cart, and the next change can go.
    changed: { args: { data: 'json' }, run: (store, { data }) => { store.set('lines', data.lines); store.set('status', 'ready'); store.set('queue', store.get('queue').slice(1)); } },
    failed: { args: { message: 'string' }, run: (store) => { if (store.get('status') !== 'ready') store.set('status', 'failed'); } },
    changeFailed: { args: { message: 'string' }, run: (store) => store.set('queue', store.get('queue').slice(1)) }, // drop it; the next one goes
  },
  resources: [
    // The cart when a page opens (and after `cart.reload`).
    { watch: ['reloadCount'], request: () => ({ url: '/api/cart' }), onStart: 'loading', onSuccess: 'loaded', onError: 'failed' },
    // The change at the head of the queue.
    { watch: ['queue'], request: ({ queue }) => queue[0] ?? null, onStart: 'loading', onSuccess: 'changed', onError: 'changeFailed' },
  ],
};

export const cartSettled = (state) => state.cart.status === 'ready' || state.cart.status === 'failed';
