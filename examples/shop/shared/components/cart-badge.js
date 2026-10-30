// The link to the checkout page with the number of items in the cart. Used by the shell's content: the count is the shell's own
// (`frame.cartCount`), which the shell reads from the page's cart.
import { a, equals, state } from '@ehtb/agent-ui/spec';

export const cartBadge = () => a({ id: 'nav-cart', href: '/checkout', soft: true, classes: { active: equals(state('route.path'), '/checkout') } }, 'Cart (', state('frame.cartCount'), ')');
