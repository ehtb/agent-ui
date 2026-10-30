import { withResources } from '@ehtb/agent-ui/resources';

// What the pages share: the guestbook entries (loaded from the host's /api/entries, with loading, failure and reload), as
// the namespace `guestbook`, which every page lists in its `namespaces` (the layout shows its load error). Pages read `guestbook.entries` and `guestbook.status`; only the actions of the
// namespace write them. // A page that needs the entries is ready when the load has finished, successfully or not (a failure shows the banner of
// the layout; waiting for it would only delay the page).
export const entriesSettled = (state) => state.guestbook.status === 'ready' || state.guestbook.status === 'failed';

export const guestbook = {
  state: {
    entries: [],
    status: 'idle', // 'idle' | 'loading' | 'ready' | 'failed'
    errorMessage: '',
    reloadCount: 0,
  },
  derive: {
    entryCount: (get) => `${get('entries').length} ${get('entries').length === 1 ? 'entry' : 'entries'}`,
  },
  actions: {
    // The first load shows "loading"; a refresh (the browser repeats the request after the server rendered the page, and
    // the reload button) keeps what is on screen, so a ready page never goes back to its pending view.
    loading: { args: {}, run: (store) => { if (store.get('status') !== 'ready') store.set('status', 'loading'); store.set('errorMessage', ''); } },
    loaded: { args: { data: 'json' }, run: (store, { data }) => { store.set('entries', data); store.set('status', 'ready'); } },
    failed: { args: { message: 'string' }, run: (store, { message }) => { store.set('status', 'failed'); store.set('errorMessage', message); } },
    reload: { args: {}, run: (store) => store.set('reloadCount', store.get('reloadCount') + 1) },
    // Called by the sign page when the host accepted an entry, so the list is current without a reload.
    append: { args: { entry: 'json' }, run: (store, { entry }) => store.set('entries', [...store.get('entries'), entry]) },
  },
  resources: [
    {
      watch: ['reloadCount'],
      request: () => ({ url: '/api/entries' }),
      onStart: 'loading',
      onSuccess: 'loaded',
      onError: 'failed',
    },
  ],
};

export const plugins = [withResources];
