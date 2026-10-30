// One product in the list: used only by the list page's view, so it is not in shared/ and the other pages never load it.
import { a, act, button, item, join, li, p } from '@ehtb/agent-ui/spec';

export const productCard = li(
  null,
  a({ href: join('/product/', item('id')), soft: true }, item('title')),
  p(null, item('summary')),
  p({ class: 'price' }, '€', item('price')),
  button({ 'aria-label': join('Add ', item('title'), ' to the cart'), on: { click: act('cart.add', { id: item('id'), title: item('title'), price: item('price') }) } }, 'Add to cart'),
);
