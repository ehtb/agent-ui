// The content of the page at "/". A toolbar of actions a visitor (or benchmark.mjs, which dispatches the same actions
// straight to the app) can press, and the list they act on. The list is rendered from the derived `bench.rows`; a
// toggled row changes one item, so the other rows keep their references and only that row is written again.
import { section, h1, p, div, ul, li, span, button, each, act, item } from '@ehtb/agent-ui/spec';

const seedButton = (count) =>
  button({ id: `seed-${count}`, on: { click: act('bench.seed', { count }) } }, `Seed ${count.toLocaleString('en-US')} rows`);

const row = li(
  { classes: { done: item('done') } },
  span({ class: 'title' }, item('title')),
  span({ class: 'price' }, item('price')),
  button({ class: 'toggle', 'aria-label': item('title'), on: { click: act('bench.toggle', { id: item('id') }) } }, 'toggle'),
);

export const view = section(
  { id: 'bench' },
  h1(null, 'List benchmark'),
  p(null, 'The rows below come from the bench namespace. Seed a size, then toggle, add and clear to see what each costs.'),
  div(
    { id: 'toolbar' },
    seedButton(1000),
    seedButton(5000),
    seedButton(20000),
    button({ id: 'add-one', on: { click: act('bench.addOne') } }, 'Add one'),
    button({ id: 'add-1000', on: { click: act('bench.addMany', { count: 1000 }) } }, 'Add 1,000'),
    button({ id: 'clear', on: { click: act('bench.clear') } }, 'Clear'),
  ),
  ul({ id: 'the-list' }, each('bench.rows', 'id', row)),
);
