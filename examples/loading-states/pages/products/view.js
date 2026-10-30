// The content of the page at "/products" (the file next to page.js). Only the server and the build import it.
import { a, act, button, each, equals, h2, item, join, li, p, section, span, state, ul, when } from '@ehtb/agent-ui/spec';
import { layout } from '../layout.js';

export { layout };
export const pending = ul({ id: 'products-skeleton', class: 'skeleton', 'aria-busy': 'true' }, li({ id: 'skeleton-1' }), li({ id: 'skeleton-2' }), li({ id: 'skeleton-3' }));

export const view = section(
  { id: 'products-view' },
  h2({ id: 'products-title' }, 'Products'),
  when(equals(state('catalog.status'), 'failed'), p({ id: 'products-error', role: 'alert', class: 'error' }, 'Could not load the products: ', state('catalog.error'))),
  p({ id: 'product-count', role: 'status' }, state('catalog.count')),
  when(state('catalog.refreshing'), p({ id: 'refreshing', class: 'refreshing' }, 'Refreshing in the background…')),
  ul(
    { id: 'products' },
    each('catalog.list', 'id', li(null, a({ href: join('/products/', item('id')) }, item('name')), span({ class: 'meta' }, ' · $', item('price')))),
  ),
  button({ id: 'reload', on: { click: act('catalog.reload') } }, 'Reload'),
);
