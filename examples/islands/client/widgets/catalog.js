// The product list island: its own namespace, its own spec, and a create function that takes the element it lives in and the state
// it starts from. The server renders it (server.js) and the browser starts it (client/islands.js) with the same function.
import { app } from '@ehtb/agent-ui';
import { act, button, each, h2, item, li, section, span, ul } from '@ehtb/agent-ui/spec';

export const catalog = {
  state: { products: [], inCart: [] },
  derive: {
    count: (get) => get('inCart').length,
  },
  actions: {
    // Idempotent: a second click on the same product changes nothing.
    add: {
      args: { id: 'string' },
      run: (store, { id }) => {
        if (!store.get('inCart').includes(id)) store.set('inCart', [...store.get('inCart'), id]);
      },
    },
  },
};

export const catalogView = section(
  { id: 'catalog', 'aria-label': 'Products' },
  h2(null, 'Products'),
  ul({ id: 'products' }, each('catalog.products', 'id', li(null, span(null, item('name')), ' ', button({ id: 'add', 'aria-label': 'Add to cart', on: { click: act('catalog.add', { id: item('id') }) } }, 'Add')))),
);

export const createCatalog = ({ root, dev, initialState = {} }) => app({ namespaces: { catalog }, initialState, spec: catalogView, root, dev });
