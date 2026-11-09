import { a, act, button, h1, section, state } from '@ehtb/agent-ui/spec';
import { shell } from './shell-view.js';

export const view = section(
  { id: 'page-content' },
  h1({ id: 'page-title' }, 'First page'),
  button({ id: 'bump', on: { click: act('visit.bump') } }, 'Bump: ', state('visit.count')),
  a({ id: 'other-link', href: '/soft-shell/other', soft: true }, 'Go to the second page'),
);
export { shell };
