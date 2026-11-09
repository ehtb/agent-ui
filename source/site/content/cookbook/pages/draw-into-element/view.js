import { act, button, div, h1, main, p, state, when, greaterThan, length } from '@ehtb/agent-ui/spec';

export const view = main(
  { id: 'chart-page' },
  h1(null, 'Sales'),
  div({ id: 'bars', role: 'img', 'aria-label': 'Sales by month' }), // empty on purpose: the plugin draws here
  button({ id: 'add', on: { click: act('sales.add', { value: 4 }) } }, 'Add a month'),
  p({ id: 'selected' }, 'Selected: ', state('sales.selected')),
  when(greaterThan(length(state('sales.series')), 5), p(null, 'That is a lot of months.')),
);
