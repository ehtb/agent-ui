// The page "/unavailable": behavior only. Its data never arrives (/unavailable.json does not exist). It owns its state and
// its resource (the namespace `unavailable`). A failure counts as finished: `ready` is true, the page shows the error, the
// server answers 503, and "Try again" repeats the request. The content is view.js next to this file.
import { resourcesSlowedInTheBrowser } from '../shared.js';

const reportSettled = (state) => state.unavailable.status === 'ready' || state.unavailable.status === 'failed';


const unavailable = {
  state: { status: 'idle', error: '', reloadCount: 0 },
  actions: {
    loading: { args: {}, run: (store) => { if (store.get('status') !== 'ready') store.set('status', 'loading'); } },
    loaded: { args: { data: 'json' }, run: (store) => store.set('status', 'ready') },
    failed: { args: { message: 'string' }, run: (store, { message }) => { store.set('status', 'failed'); store.set('error', message); } },
    reload: { args: {}, run: (store) => store.set('reloadCount', store.get('reloadCount') + 1) },
  },
  resources: [
    {
      // Scoped to this page: only this page lists the namespace, so only this page makes the request.
      watch: ['reloadCount'],
      request: () => ({ url: '/unavailable.json' }),
      onStart: 'loading',
      onSuccess: 'loaded',
      onError: 'failed',
    },
  ]
};

export const page = {
  namespaces: { unavailable },
  plugins: [resourcesSlowedInTheBrowser],
  head: { title: 'Unavailable - Loading states', description: 'A page whose data does not arrive.' },
  ready: reportSettled,
  status: (state) => (state.unavailable.status === 'failed' ? 503 : 200),
};
