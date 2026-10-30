// The content of the page at "/entry/:id" (the file next to page.js). build/ and the server import it; a browser does not.
import { a, article, h2, p, state, when } from '@ehtb/agent-ui/spec';
import { layout } from '../../layout.js';

export { layout };
export const pending = p({ id: 'entry-pending', role: 'status' }, 'Loading the entry…');

export const view =
  article(
    { id: 'entry-view' },
    a({ id: 'back', href: '/' }, 'All entries'),
    when(state('entry.isMissing'), p({ id: 'not-found', role: 'alert' }, 'Entry not found.')),
    when(state('entry.current'), [
      h2({ id: 'entry-name' }, state('entry.current.name')),
      p({ id: 'entry-message' }, state('entry.current.message')),
    ]),
  );
