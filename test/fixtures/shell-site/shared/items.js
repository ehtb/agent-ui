export const itemsSettled = (state) => state.items.status === 'ready' || state.items.status === 'failed';

export const items = {
  state: { list: [], status: 'idle' },
  actions: {
    loading: { args: {}, run: (store) => store.set('status', 'loading') },
    loaded: { args: { data: 'json' }, run: (store, { data }) => { store.set('list', data); store.set('status', 'ready'); } },
    failed: { args: { message: 'string' }, run: (store) => store.set('status', 'failed') },
  },
  resources: [{ watch: [], request: () => ({ url: '/items.json' }), onStart: 'loading', onSuccess: 'loaded', onError: 'failed' }],
};
