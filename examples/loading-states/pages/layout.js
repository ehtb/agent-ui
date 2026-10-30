// The shell around every page of this example. It lives here, next to shared.js, because a page's view.js is the only
// module that may import it: the builders must stay out of the browser bundle (page.js is what the browser entry loads).
import { a, h1, header, main, nav, p, state, when } from '@ehtb/agent-ui/spec';

// One shell for every page: navigation, and a line that shows whether the current page counts as ready. `route.ready` is the
// derived value every page has; it is what switches between `pending` and the page.
export const layout = (content) =>
  main(
    { id: 'states-app' },
    header(
      { id: 'site-header' },
      h1({ id: 'site-title' }, 'Loading states'),
      nav(
        { id: 'site-nav' },
        a({ id: 'nav-overview', href: '/' }, 'Overview'),
        a({ id: 'nav-instant', href: '/instant' }, 'Instant'),
        a({ id: 'nav-products', href: '/products' }, 'Products'),
        a({ id: 'nav-unavailable', href: '/unavailable' }, 'Unavailable'),
      ),
    ),
    p({ id: 'page-state', role: 'status', class: 'page-state' }, 'This page is ', when(state('route.ready'), 'ready', 'pending'), '.'),
    content,
  );
