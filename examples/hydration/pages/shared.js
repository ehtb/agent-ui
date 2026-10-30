// Hydration example: articles with real URLs (/ and /article/2), rendered per request on a server (`npm run serve`) and then
// taken over in the browser. Shows what server rendering buys and how state travels:
//   - the HTML for every URL already contains that page's content (view the page source),
//   - the server embeds the state it rendered from, the browser starts from it (no flash of "loading"),
//   - `route.hydrated` starts false in the server markup and becomes true when the browser app takes over.
// The two pages (pages/page.js, pages/article/[id]/page.js) share this behavior module; the shell they share is layout.js.
import { withResources } from '@ehtb/agent-ui/resources';

// Three namespaces: `articles` (data loaded by a declared resource, and what is derived from it), `search` and `likes`
// (client-only interaction). The server embeds them all, with `route`, in the state script; the browser starts from it.
export const namespaces = {
  articles: {
    state: {
      list: [],
      status: 'idle', // 'idle' | 'loading' | 'ready' | 'failed'
      errorMessage: '',
    },
    derive: {
      visible: (get) => {
        const query = get('search.query').trim().toLowerCase();
        return get('list').filter((article) => !query || article.title.toLowerCase().includes(query) || article.summary.toLowerCase().includes(query));
      },
      // The article of the current route, or null while loading or when the id does not exist.
      current: (get) => get('list').find((article) => String(article.id) === get('route.params').id) ?? null,
      isNotFound: (get) => get('status') === 'ready' && !get('list').some((article) => String(article.id) === get('route.params').id),
      currentLikes: (get) => get('likes.counts')[get('route.params').id] ?? 0,
    },
    actions: {
      loading: { args: {}, run: (store) => { store.set('status', 'loading'); store.set('errorMessage', ''); } },
      loaded: { args: { data: 'json' }, run: (store, { data }) => { store.set('list', data); store.set('status', 'ready'); } },
      failed: { args: { message: 'string' }, run: (store, { message }) => { store.set('status', 'failed'); store.set('errorMessage', message); } },
    },
    resources: [{ watch: [], request: () => ({ url: '/articles.json' }), onStart: 'loading', onSuccess: 'loaded', onError: 'failed' }],
  },
  search: {
    state: { query: '' },
    actions: { set: { args: { value: 'string' }, run: (store, { value }) => store.set('query', value) } },
  },
  likes: {
    state: { counts: {} }, // article id -> number of likes
    actions: {
      add: {
        args: { id: 'string' },
        run: (store, { id }) => store.set('counts', { ...store.get('counts'), [id]: (store.get('counts')[id] ?? 0) + 1 }),
      },
    },
  },
};

export const articlesSettled = (state) => state.articles.status === 'ready' || state.articles.status === 'failed';
export const plugins = [withResources];
