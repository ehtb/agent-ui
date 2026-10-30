// The page "/": the products with a search box. Its own namespace is "list". Behavior only: the content is view.js next to
// this file (the build and the server import it, a browser bundle does not).
import { cart } from '../shared/cart.js';
import { catalog, catalogSettled } from '../shared/catalog.js';
import { plugins } from '../shared/plugins.js';
import { shell } from '../shared/shell.js';

const list = {
  state: { query: '' },
  derive: {
    visible: (get) => {
      const query = get('query').trim().toLowerCase();
      return get('catalog.list').filter((product) => !query || `${product.title} ${product.summary}`.toLowerCase().includes(query));
    },
    resultLabel: (get) => `${get('visible').length} ${get('visible').length === 1 ? 'product' : 'products'}`,
  },
  actions: { setQuery: { args: { value: 'string' }, run: (store, { value }) => store.set('query', value) } },
};

export const page = {
  namespaces: { cart, catalog, list },
  plugins,
  shell,
  head: { title: 'Trailside', description: 'Gear for the trail.' },
  ready: catalogSettled,
};
