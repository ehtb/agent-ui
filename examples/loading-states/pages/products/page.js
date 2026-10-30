// The page "/products": behavior only. `ready` says when the products have arrived; the server waits for it, and the
// view renders either way. Reloading while the list is on screen is a refresh: the list stays. The content is view.js
// next to this file.
import { catalog, productsSettled, resourcesSlowedInTheBrowser } from '../shared.js';

export const page = {
  namespaces: { catalog },
  plugins: [resourcesSlowedInTheBrowser],
  head: { title: 'Products - Loading states', description: 'Products, loaded in the background.' },
  ready: productsSettled,
  status: (state) => (state.catalog.status === 'failed' ? 503 : 200),
};
