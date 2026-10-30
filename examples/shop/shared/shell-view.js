// The content of the shell (shell.js has its behavior): a header with the cart badge and a footer around the page. The view.js files
// import it (never page.js), so it is used when the build renders each page's spec and no browser downloads it as code: it ships as data.
import { a, equals, footer, h1, header, main, nav, pageSlot, small, state } from '@ehtb/agent-ui/spec';
import { cartBadge } from './components/cart-badge.js';

export const shell = {
  name: 'main',
  view: main(
    { id: 'shop-app' },
    header(
      { id: 'shop-header' },
      h1({ id: 'shop-title' }, 'Trailside'),
      nav({ id: 'shop-nav' }, a({ id: 'nav-shop', href: '/', soft: true, classes: { active: equals(state('route.path'), '/') } }, 'Shop'), cartBadge()),
    ),
    pageSlot(), // the page goes here
    footer({ id: 'shop-footer' }, small(null, 'A demo of agent-ui: ', a({ id: 'nav-checkout', href: '/checkout', soft: true }, 'go to checkout'), '.')),
  ),
};
