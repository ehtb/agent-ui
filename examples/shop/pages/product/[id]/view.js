// The content of the page at "/product/:id" (the file next to page.js). build/ and the server import it; a browser bundle
// does not, because the build renders this view (with the shell's content) in Node once and ships the finished spec as data.
import { a, act, article, button, h2, not, p, state, when } from '@ehtb/agent-ui/spec';
import { cartLines } from '../../../shared/components/cart-lines.js';
import { shell } from '../../../shared/shell-view.js';

const productView = article(
  { id: 'product-view' },
  a({ id: 'back', href: '/', soft: true }, 'All products'),
  when(state('product.isNotFound'), p({ id: 'not-found', role: 'alert' }, 'Product not found.')),
  when(state('product.current'), [
    h2({ id: 'product-title' }, state('product.current.title')),
    p({ id: 'product-description' }, state('product.current.description')),
    p({ id: 'product-price', class: 'price' }, '€', state('product.current.price')),
    button({ id: 'add-to-cart', on: { click: act('cart.add', { id: state('product.current.id'), title: state('product.current.title'), price: state('product.current.price') }) } }, 'Add to cart'),
    when(not(state('cart.isEmpty')), [p({ id: 'in-cart-title' }, 'In your cart'), ...cartLines({ id: 'in-cart', editable: false }), button({ id: 'to-checkout', on: { click: act('route.go', { href: '/checkout' }) } }, 'Go to checkout')]),
  ]),
);

export const view = productView;
export { shell };
