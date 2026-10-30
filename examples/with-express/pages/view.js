// The content of the page at "/" (the file next to page.js). build/ and the server import it; a browser does not,
// because the build renders this view in Node and ships the finished spec as data instead.
import { a, each, h2, item, join, li, p, section, state, ul } from '@ehtb/agent-ui/spec';
import { layout } from './layout.js';

export { layout };
export const pending = p({ id: 'entries-pending', role: 'status' }, 'Loading the entries…');

const entriesView =
  section(
    { id: 'entries-view' },
    h2({ id: 'entries-title' }, 'Entries'),
    p({ id: 'entry-count', role: 'status' }, state('guestbook.entryCount')),
    ul(
      { id: 'entries' },
      each('guestbook.entries', 'id', li(null, a({ href: join('/entry/', item('id')) }, item('name')), ': ', item('message'))),
    ),
    a({ id: 'sign-link', href: '/sign' }, 'Sign the guestbook'),
  );

export const view = entriesView;
