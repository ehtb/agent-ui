// The content of the page at "/products/:id" (the file next to page.js). Only the server and the build import it.
import { a, article, equals, h2, p, state, when } from '@ehtb/agent-ui/spec';
import { layout } from '../../layout.js';

export { layout };
export const pending = p({ id: 'product-pending', 'aria-busy': 'true' }, 'Loading the product…');

export const view = article(
  { id: 'product-view' },
  a({ id: 'back', href: '/products' }, 'All products'),
  when(state('product.isMissing'), p({ id: 'not-found', role: 'alert' }, 'Product not found.')),
  when(equals(state('catalog.status'), 'failed'), p({ id: 'product-error', role: 'alert', class: 'error' }, 'Could not load the products: ', state('catalog.error'))),
  when(state('product.current'), [
    h2({ id: 'product-name' }, state('product.current.name')),
    p({ id: 'product-price' }, '$', state('product.current.price')),
    p({ id: 'product-description' }, state('product.current.description')),
  ]),
);
