// The products, loaded from /products.json for the pages that show them (the list and one product). They are the namespace
// `catalog`, which those two pages list in their `namespaces`; the checkout page never loads the catalog, because the cart
// lines carry the title and price they were added with.
export const catalogSettled = (state) => state.catalog.status === 'ready' || state.catalog.status === 'failed';

export const catalog = {
  state: { list: [], status: 'idle', errorMessage: '', reloadCount: 0 }, // status: 'idle' | 'loading' | 'ready' | 'failed'
  actions: {
    loading: { args: {}, run: (store) => { if (store.get('status') !== 'ready') store.set('status', 'loading'); store.set('errorMessage', ''); } },
    loaded: { args: { data: 'json' }, run: (store, { data }) => { store.set('list', data); store.set('status', 'ready'); } },
    failed: { args: { message: 'string' }, run: (store, { message }) => { store.set('status', 'failed'); store.set('errorMessage', message); } },
    reload: { args: {}, run: (store) => store.set('reloadCount', store.get('reloadCount') + 1) },
  },
  resources: [{ watch: ['reloadCount'], request: () => ({ url: '/products.json' }), onStart: 'loading', onSuccess: 'loaded', onError: 'failed' }],
};
