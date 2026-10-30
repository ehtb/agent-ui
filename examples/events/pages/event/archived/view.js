// The content of the page at "/event/archived" (the file next to page.js). Only the server and the build import it.
import { a, each, h2, item, join, li, p, section, state, ul } from '@ehtb/agent-ui/spec';
import { site } from '../../layout.js';

export const view =
  section(
    { id: 'archived-view' },
    h2({ id: 'archived-title' }, 'Archived events'),
    p({ id: 'archived-count', role: 'status' }, state('eventArchived.label')),
    ul({ id: 'archived-events' }, each('eventArchived.events', 'id', li(null, a({ href: join('/event/', item('id')) }, item('title')), ' · ', item('date')))),
  );

export const layout = site;
