import { a, act, button, h1, section, state } from '@ehtb/agent-ui/spec';
import { shell } from '../shell-view.js';

export const view = section(
  { id: 'page-content' },
  h1({ id: 'page-title' }, 'Second page'),
  button({ id: 'bump', on: { click: act('visit.bump') } }, 'Bump: ', state('visit.count')),
  a({ id: 'other-link', href: '/soft-shell', soft: true }, 'Back to the first page'),
);
export { shell };
