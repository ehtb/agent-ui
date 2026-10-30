// What the pages share: the namespace `events` (the events data, loaded with loading, failure and reload), which every page
// that shows events (or the site layout's banner) lists in its `namespaces`. A page that needs the events is ready when the load has finished, successfully or not (a
// failure shows the banner of the layout; waiting for it would only delay the render).
// This module is behavior only; the shared shells (`site`, `focused`) are view-only and live in layout.js.
import { withResources } from '@ehtb/agent-ui/resources';

export const eventsSettled = (state) => state.events.status === 'ready' || state.events.status === 'failed';

export const events = {
  state: {
    list: [],
    status: 'idle', // 'idle' | 'loading' | 'ready' | 'failed'
    errorMessage: '',
    reloadCount: 0,
  },
  actions: {
    // Only the first load shows "loading"; a refresh keeps a ready page ready (docs/GUIDE.md, "A page that needs data").
    loading: { args: {}, run: (store) => { if (store.get('status') !== 'ready') store.set('status', 'loading'); store.set('errorMessage', ''); } },
    loaded: { args: { data: 'json' }, run: (store, { data }) => { store.set('list', data); store.set('status', 'ready'); } },
    failed: { args: { message: 'string' }, run: (store, { message }) => { store.set('status', 'failed'); store.set('errorMessage', message); } },
    reload: { args: {}, run: (store) => store.set('reloadCount', store.get('reloadCount') + 1) },
  },
  resources: [
    {
      watch: ['reloadCount'],
      request: () => ({ url: '/events.json' }),
      onStart: 'loading',
      onSuccess: 'loaded',
      onError: 'failed',
    },
  ],
};

export const plugins = [withResources];
