// The shell both pages (pages/page.js and pages/article/[id]/page.js) share. It is view-only: the server and the build
// import it, a browser bundle does not.
import { equals, h1, main, p, state, when } from '@ehtb/agent-ui/spec';

export const layout = (content) =>
  main(
    { id: 'hydration-app' },
    h1(null, 'Articles'),
    p({ id: 'hydration-status', role: 'status' }, when(state('route.hydrated'), 'Interactive: the browser has taken over.', 'Server-rendered: waiting for JavaScript.')),
    when(equals(state('articles.status'), 'failed'), p({ id: 'load-error', role: 'alert' }, 'Could not load articles: ', state('articles.errorMessage'))),
    content,
  );
