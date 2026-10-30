// The content of the page at "/unavailable" (the file next to page.js). Only the server and the build import it.
import { act, button, equals, h2, p, section, state, when } from '@ehtb/agent-ui/spec';
import { layout } from '../layout.js';

export { layout };
export const pending = p({ id: 'report-pending', 'aria-busy': 'true' }, 'Contacting the service…');

export const view = section(
  { id: 'unavailable-view' },
  h2({ id: 'unavailable-title' }, 'Unavailable'),
  when(
    equals(state('unavailable.status'), 'failed'),
    [
      p({ id: 'report-error', role: 'alert', class: 'error' }, 'The service did not answer: ', state('unavailable.error')),
      button({ id: 'report-retry', on: { click: act('unavailable.reload') } }, 'Try again'),
    ],
    p({ id: 'report-ok' }, 'The service answered.'),
  ),
);
