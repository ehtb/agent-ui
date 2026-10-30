// The content of the page at "/charts". The chart's element is empty on purpose: the plugin draws into it.
import { expandComponents } from '@ehtb/agent-ui/components';
import { main, h1, p, a, div, label, input, each, item, state, act, event, join } from '@ehtb/agent-ui/spec';
import { components, Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../ui/index.js';

const valueField = label(
  { id: 'value-label', class: 'chart-value' },
  item('label'),
  input({ id: 'value-input', type: 'number', min: 0, 'aria-label': join('Revenue ', item('label')), value: item('value'), on: { input: act('sales.setValue', { id: item('id'), value: event('target.valueAsNumber') }) } }),
);

export const view = expandComponents(
  main(
    { id: 'charts-page' },
    h1(null, 'A chart drawn by a plugin'),
    p(null, a({ id: 'back-to-kit', href: '/' }, 'Back to the component kit')),
    Card(
      null,
      CardHeader(null, CardTitle(null, 'Revenue by quarter'), CardDescription(null, 'Chart.js draws into one element. Edit a value and the chart follows the state; click a bar and it selects the quarter through an action.')),
      CardContent(
        null,
        div({ id: 'revenue-chart', domId: 'revenue-chart', role: 'img', 'aria-label': 'Revenue by quarter, in thousands' }), // empty: the plugin claims it by this id
        div({ id: 'chart-values', class: 'chart-values' }, each('sales.series', 'id', valueField)),
        p({ id: 'chart-summary', domId: 'chart-summary', class: 'ui-hint' }, 'Total: ', state('sales.total'), 'k. Selected: ', state('sales.selectedLabel')),
      ),
    ),
  ),
  components,
);
