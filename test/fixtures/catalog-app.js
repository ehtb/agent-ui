// Test fixture: a catalog of two pages (list at "/", detail at "/item/:id"), data loaded through a declared resource
// (/items.json), and state transfer for server rendering. Used by the server rendering tests; independent of the demo apps
// in examples/.
import { definePage } from '../../src/pages.js';
import { withResources } from '../../src/resources.js';

// `catalog` holds the data and its loading status (a resource loads it), `search` the query. The URL's parameters are the
// framework's `route.params`.
export const catalog = {
  state: {
    items: [],
    status: 'idle', // 'idle' | 'loading' | 'ready' | 'failed'
    errorMessage: '',
  },
  derive: {
    visible: (get) => {
      const query = get('search.query').trim().toLowerCase();
      return get('items').filter((item) => !query || item.name.toLowerCase().includes(query));
    },
    current: (get) => get('items').find((item) => String(item.id) === get('route.params').id) ?? null,
  },
  actions: {
    loading: { args: {}, run: (store) => { store.set('status', 'loading'); store.set('errorMessage', ''); } },
    loaded: { args: { data: 'json' }, run: (store, { data }) => { store.set('items', data); store.set('status', 'ready'); } },
    failed: { args: { message: 'string' }, run: (store, { message }) => { store.set('status', 'failed'); store.set('errorMessage', message); } },
  },
  resources: [{ watch: [], request: () => ({ url: '/items.json' }), onStart: 'loading', onSuccess: 'loaded', onError: 'failed' }],
};
export const search = {
  state: { query: '' },
  actions: { set: { args: { value: 'string' }, run: (store, { value }) => store.set('query', value) } },
};

const ready = (state) => state.catalog.status === 'ready' || state.catalog.status === 'failed';

const listView = {
  tag: 'main',
  id: 'catalog',
  children: [
    { tag: 'input', id: 'search', props: { type: 'search', 'aria-label': 'Search', value: { state: 'search.query' } }, on: { input: ['search.set', { value: { event: 'target.value' } }] } },
    {
      tag: 'ul',
      id: 'items',
      children: {
        each: 'catalog.visible',
        key: 'id',
        template: { tag: 'li', children: { tag: 'a', props: { href: { join: ['/item/', { item: 'id' }] } }, children: { item: 'name' } } },
      },
    },
  ],
};

export const listPage = {
  head: { title: 'Catalog' },
  namespaces: { catalog, search },
  plugins: [withResources],
  ready,
};

const itemView = {
  tag: 'main',
  id: 'catalog',
  children: [
    { tag: 'a', id: 'back', props: { href: '/' }, children: 'All items' },
    { when: { state: 'catalog.current' }, children: { tag: 'h2', id: 'item-name', children: { state: 'catalog.current.name' } } },
  ],
};

export const itemPage = {
  head: { title: (state) => state.catalog.items.find((item) => String(item.id) === state.route.params.id)?.name ?? 'Item' },
  namespaces: { catalog, search }, // catalog reads search.query, so the page that mounts one mounts both
  plugins: [withResources],
  ready,
  status: (state) => (state.catalog.status === 'ready' && !state.catalog.items.some((item) => String(item.id) === state.route.params.id) ? 404 : 200),
};

export const list = definePage(listPage, { path: '/', view: listView });
export const item = definePage(itemPage, { path: '/item/:id', view: itemView });
// The page that serves a URL, as the render server picks it.
export const pageFor = (url) => (url.startsWith('/item/') ? item : list);
