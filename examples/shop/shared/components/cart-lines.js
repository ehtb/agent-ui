// The lines of the cart with their quantities and the total. Used by the product page's and the checkout page's views, so
// written once; it is evaluated when the build renders their specs and never reaches a browser. `id` keeps ids unique where
// a page uses it.
import { act, button, each, item, li, p, span, state, ul } from '@ehtb/agent-ui/spec';

export const cartLines = ({ id, editable }) => [
  ul(
    { id, class: 'cart-lines' },
    each(
      'cart.lines',
      'id',
      li(null, span(null, item('title'), ' × ', item('quantity'), ' · €', item('price')), ...(editable ? [button({ 'aria-label': 'Remove', on: { click: act('cart.remove', { id: item('id') }) } }, '×')] : [])),
    ),
  ),
  p({ id: `${id}-total` }, 'Total: €', state('cart.total')),
];
