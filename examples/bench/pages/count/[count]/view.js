// The content of the page at "/count/:count". The rows are the derived `bench.rows`, generated from the URL's count until
// an action materializes the list. `paths` names the URLs a static build writes and `agent-ui check` renders; the
// benchmark serves them per request instead.
import { section, h1, p, ul, li, span, button, each, act, item } from '@ehtb/agent-ui/spec';

const row = li(
  { classes: { done: item('done') } },
  span({ class: 'title' }, item('title')),
  span({ class: 'price' }, item('price')),
  button({ class: 'toggle', 'aria-label': item('title'), on: { click: act('bench.toggle', { id: item('id') }) } }, 'toggle'),
);

export const view = section(
  { id: 'bench' },
  h1(null, 'List benchmark'),
  p(null, 'The rows below are generated from this URL\'s count. Seed the list (or toggle a row) and the actions take over from the derived one.'),
  ul({ id: 'the-list' }, each('bench.rows', 'id', row)),
);

export const paths = ['/count/1000', '/count/5000', '/count/20000'];
