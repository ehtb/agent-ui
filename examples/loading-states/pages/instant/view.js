// The content of the page at "/instant" (the file next to page.js). Only the server and the build import it.
import { h2, p, section } from '@ehtb/agent-ui/spec';
import { layout } from '../layout.js';

export { layout };

export const view = section(
  { id: 'instant-view' },
  h2({ id: 'instant-title' }, 'Instant'),
  p(null, 'This page has no data, so it declares no `ready` and is always ready.'),
);
