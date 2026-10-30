// The content of the page at "/checkout" (the file next to page.js). build/ and the server import it; a browser bundle does
// not, because the build renders this view (with the shell's content) in Node once and ships the finished spec as data.
import { a, act, article, button, equals, event, form, h2, input, label, p, state, textarea, when } from '@ehtb/agent-ui/spec';
import { cartLines } from '../../shared/components/cart-lines.js';
import { shell } from '../../shared/shell-view.js';

const errorFor = (field) => when(state(`checkout.errors.${field}`), p({ id: `error-${field}`, role: 'alert', class: 'field-error' }, state(`checkout.errors.${field}`)));
const inputEvents = (name) => ({ input: act('checkout.field', { name, value: event('target.value') }) });

const checkoutForm = form(
  { id: 'checkout-form', novalidate: true, on: { submit: act('checkout.submit') } },
  when(state('checkout.note'), p({ id: 'checkout-note', role: 'alert' }, state('checkout.note'))),
  label({ id: 'field-name' }, 'Full name', input({ id: 'name', type: 'text', name: 'name', 'aria-label': 'Full name', autocomplete: 'name', value: state('checkout.values.name'), on: inputEvents('name') }), errorFor('name')),
  label({ id: 'field-email' }, 'Email', input({ id: 'email', type: 'email', name: 'email', 'aria-label': 'Email', autocomplete: 'email', value: state('checkout.values.email'), on: inputEvents('email') }), errorFor('email')),
  label({ id: 'field-address' }, 'Delivery address', textarea({ id: 'address', name: 'address', rows: 3, 'aria-label': 'Delivery address', autocomplete: 'street-address', value: state('checkout.values.address'), on: inputEvents('address') }), errorFor('address')),
  button({ id: 'place-order', type: 'submit', disabled: state('checkout.busy') }, when(state('checkout.busy'), 'Sending…', 'Place order')),
);

const checkoutView = article(
  { id: 'checkout-view' },
  h2({ id: 'checkout-title' }, 'Checkout'),
  when(
    equals(state('checkout.status'), 'done'),
    [p({ id: 'order-confirmation', role: 'status' }, 'Thank you. Your order reference is ', state('checkout.reference'), '.'), a({ id: 'continue-shopping', href: '/', soft: true }, 'Continue shopping')],
    when(
      state('cart.isEmpty'),
      [p({ id: 'cart-empty' }, 'Your cart is empty.'), a({ id: 'back-to-shop', href: '/', soft: true }, 'Back to the shop')],
      [...cartLines({ id: 'checkout-lines', editable: true }), checkoutForm],
    ),
  ),
);

export const view = checkoutView;
export { shell };
