// The content of the shell. The view.js of every page that uses the shell exports it; the build ships it once, as data.
import { a, act, button, equals, footer, header, main, nav, pageSlot, small, state } from '@ehtb/agent-ui/spec';

export const shell = {
  name: 'main',
  view: main(
    { id: 'frame' },
    header(
      { id: 'frame-header' },
      nav(
        { id: 'frame-nav' },
        a({ id: 'nav-first', href: '/soft-shell', soft: true, classes: { active: equals(state('route.path'), '/soft-shell') } }, 'First'),
        a({ id: 'nav-second', href: '/soft-shell/other', soft: true, classes: { active: equals(state('route.path'), '/soft-shell/other') } }, 'Second'),
      ),
      button({ id: 'frame-click', on: { click: act('frame.click') } }, 'Shell clicks: ', state('frame.clicks')),
      small({ id: 'frame-page-count' }, 'Page count: ', state('frame.pageCount')),
    ),
    pageSlot(), // the page goes here
    footer({ id: 'frame-footer' }, small(null, 'The header above is not replaced when the page changes.')),
  ),
};
