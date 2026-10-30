// The shell every page shares. It builds spec, so it is a view-only module: only the view.js files import it, never a
// page.js (a browser downloads the behavior and the finished spec, not the builders that assemble the shell).
import { a, act, button, equals, h1, header, main, nav, p, state, when } from '@ehtb/agent-ui/spec';

export const layout = (content) =>
  main(
    { id: 'guestbook-app' },
    header(
      { id: 'site-header' },
      h1({ id: 'site-title' }, 'Guestbook'),
      nav(
        { id: 'site-nav' },
        a({ id: 'nav-entries', href: '/' }, 'Entries'),
        a({ id: 'nav-sign', href: '/sign' }, 'Sign'),
        a({ id: 'nav-about', href: '/about' }, 'About'),
      ),
    ),
    when(equals(state('guestbook.status'), 'failed'), [
      p({ id: 'load-error', role: 'alert' }, 'Could not load the entries: ', state('guestbook.errorMessage')),
      button({ id: 'reload', on: { click: act('guestbook.reload') } }, 'Try again'),
    ]),
    content,
  );
