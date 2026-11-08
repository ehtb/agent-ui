// The content of "/" (the file next to page.js). Only the server and the build import it: the browser downloads the page
// behavior and the finished spec, never the builders that assemble the view.
import { act, each, h1, input, item, li, main, p, state, ul, when } from '@ehtb/agent-ui/spec';

export const view = main(
  { id: 'server-page' },
  h1(null, 'Production server'),
  p(
    { id: 'hydration-status', role: 'status' },
    when(state('route.hydrated'), 'Interactive: the browser has taken over.', 'Server-rendered: waiting for JavaScript.'),
  ),
  p(null, 'This page is rendered for every request by one Node server with no third-party dependencies. Tick a line to see the page come alive.'),
  ul(
    { id: 'checklist' },
    each(
      'checklist.items',
      'id',
      li(
        null,
        input({ type: 'checkbox', 'aria-label': item('label'), checked: item('checked'), on: { change: act('checklist.toggle', { id: item('id') }) } }),
        ' ',
        item('label'),
      ),
    ),
  ),
  p({ id: 'progress', role: 'status' }, state('checklist.done'), ' of ', state('checklist.total'), ' checks done'),
);
