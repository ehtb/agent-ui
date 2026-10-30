// The content of the page at "/event/*path" (the file next to page.js). Only the server and the build import it.
import { a, h2, p, section, state } from '@ehtb/agent-ui/spec';
import { site } from '../../layout.js';

export const view =
  section(
    { id: 'unknown-view' },
    h2({ id: 'unknown-title' }, 'Page not found'),
    p({ id: 'unknown-path', role: 'alert' }, 'There is no page at /event/', state('route.params.path'), '.'),
    a({ id: 'unknown-back', href: '/' }, 'All events'),
  );

export const layout = site;
