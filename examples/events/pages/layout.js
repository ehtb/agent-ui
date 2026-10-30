// The shells the pages share: `site` (navigation, the load-error banner, a footer) and `focused` (no navigation, for the
// contact page). They build spec, so this is a view-only module: only the view.js files import it, never a page.js (a browser
// downloads the page behavior and the finished spec, not the builders that assemble the shell).
import { a, act, button, equals, footer, h1, header, main, nav, p, small, state, when } from '@ehtb/agent-ui/spec';

export const site = (content) =>
  main(
    { id: 'events-app' },
    header(
      { id: 'site-header' },
      h1({ id: 'site-title' }, 'Meetups'),
      nav(
        { id: 'site-nav' },
        a({ id: 'nav-events', href: '/' }, 'Events'),
        a({ id: 'nav-archived', href: '/event/archived' }, 'Archived'),
        a({ id: 'nav-about', href: '/about' }, 'About'),
        a({ id: 'nav-faq', href: '/faq' }, 'FAQ'),
        a({ id: 'nav-contact', href: '/contact' }, 'Contact'),
        // A plain static file in public/: not a page, so `agent-ui check` accepts the link because the file exists.
        a({ id: 'nav-terms', href: '/terms.html' }, 'Terms'),
      ),
    ),
    p({ id: 'hydration-status', role: 'status', class: 'banner' }, when(state('route.hydrated'), 'Interactive: the browser has taken over.', 'Server-rendered: waiting for JavaScript.')),
    when(equals(state('events.status'), 'failed'), [
      p({ id: 'load-error', role: 'alert' }, 'Could not load events: ', state('events.errorMessage')),
      button({ id: 'reload', on: { click: act('events.reload') } }, 'Try again'),
    ]),
    content,
    footer({ id: 'site-footer' }, small({ id: 'footer-note' }, 'A demo of agent-ui.')),
  );

export const focused = (content) =>
  main({ id: 'focused-app', class: 'focused' }, a({ id: 'focused-back', href: '/' }, 'Back to the events'), content);
