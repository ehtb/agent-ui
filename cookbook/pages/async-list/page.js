// Recipe: a list loaded from the server, with loading, failure and retry.
// The namespace that needs the data declares the request (`resources`) next to its state and actions. The request never runs in an
// action: the plugin runs it and reports through the three lifecycle actions, the only ones allowed to write what the resource `owns`.
// A retry is not a special case: it changes a key the resource watches, and the request runs again.
import { withResources } from '@ehtb/agent-ui/resources';

const books = {
  state: { list: [], status: 'idle', error: '', attempt: 0 },
  derive: {
    count: (get) => `${get('list').length} books`,
  },
  actions: {
    // Not while the page is ready: the browser repeats the request after the server rendered the finished page, and that must not turn it back into a loading one.
    loading: { args: {}, run: (store) => { if (store.get('status') !== 'ready') store.set('status', 'loading'); store.set('error', ''); } },
    loaded: { args: { data: 'json' }, run: (store, { data }) => { store.set('list', data); store.set('status', 'ready'); } },
    failed: { args: { message: 'string' }, run: (store, { message }) => { store.set('status', 'failed'); store.set('error', message); } },
    retry: { args: {}, run: (store) => store.set('attempt', store.get('attempt') + 1) },
  },
  resources: [
    {
      watch: ['attempt'],
      owns: ['list', 'status', 'error'],
      request: () => ({ url: '/books.json' }),
      onStart: 'loading',
      onSuccess: 'loaded',
      onError: 'failed',
    },
  ],
};

export const page = {
  head: { title: 'Books - cookbook' },
  namespaces: { books },
  plugins: [withResources],
  // The server renders the page once the request has finished, successfully or not; a failed load is a finished state with a message.
  ready: (state) => state.books.status === 'ready' || state.books.status === 'failed',
  status: (state) => (state.books.status === 'failed' ? 503 : 200),
};
