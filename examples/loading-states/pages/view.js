// The content of the page at "/" (the file next to page.js): the overview of what each page of this example shows. Only
// the server and the build import it, so a browser downloads the page's behavior and the finished spec, not the builders.
import { a, h2, li, p, section, ul } from '@ehtb/agent-ui/spec';
import { layout } from './layout.js';

export { layout };

export const view = section(
  { id: 'overview-view' },
  h2({ id: 'overview-title' }, 'What each page shows'),
  ul(
    { id: 'overview-list' },
    li(null, a({ id: 'to-instant', href: '/instant' }, 'Instant'), ': no data, no `ready`; the page counts as ready at once.'),
    li(null, a({ id: 'to-products', href: '/products' }, 'Products'), ': `ready`. The view renders while the products load; reloading refreshes them behind the list.'),
    li(null, a({ id: 'to-product', href: '/products/2' }, 'One product'), ': the same data, `status` 404 for an unknown id (try ', a({ id: 'to-missing', href: '/products/99' }, 'product 99'), ').'),
    li(null, a({ id: 'to-unavailable', href: '/unavailable' }, 'Unavailable'), ': the data never arrives (the file does not exist). A failure counts as finished: the page shows the error, answers 503 and offers to try again.'),
  ),
  p(null, 'The server waits for `ready` and sends the finished page; in the browser the data loads after you move between pages (its requests are held back 1.2 seconds on purpose, see shared.js).'),
);
