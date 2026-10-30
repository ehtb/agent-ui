// The page "/products/:id": behavior only. Ready when the products have loaded; an id that names no product answers 404
// (once they have loaded), and a failed load answers 503. The content is view.js next to this file.
import { catalog, findProduct, productsSettled, resourcesSlowedInTheBrowser } from '../../shared.js';
import { withHead } from '@ehtb/agent-ui/head';

// After loading only: a failed load is not "not found".
const productDerive = {
  current: (get) => findProduct(get('catalog.list'), get('route.params')),
  isMissing: (get) => get('catalog.status') === 'ready' && !findProduct(get('catalog.list'), get('route.params')),
};

export const page = {
  namespaces: { catalog, product: { derive: productDerive } },
  plugins: [resourcesSlowedInTheBrowser, withHead],
  head: {
    title: (state) => {
      const product = findProduct(state.catalog.list, state.route.params);
      return product ? `${product.name} - Loading states` : 'Product - Loading states';
    },
    description: (state) => findProduct(state.catalog.list, state.route.params)?.description ?? 'A product',
  },
  ready: productsSettled,
  status: (state) => (state.catalog.status === 'failed' ? 503 : state.catalog.status === 'ready' && !findProduct(state.catalog.list, state.route.params) ? 404 : 200),
  // Generated as a static file for every product in products.json.
};
