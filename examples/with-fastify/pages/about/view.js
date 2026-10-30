// The content of the page at "/about" (the file next to page.js). build/ and the server import it; a browser does not.
import { h2, p, section } from '@ehtb/agent-ui/spec';
import { layout } from '../layout.js';

export { layout };

export const view =
  section(
    { id: 'about-view' },
    h2({ id: 'about-title' }, 'About'),
    p(null, 'The pages are rendered by agent-ui inside the host server. The entries and the API belong to the host.'),
  );
