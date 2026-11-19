import { act, button, defs, each, g, h1, item, li, linearGradient, main, rect, state, stop, svg, text, title, ul, when } from '@ehtb/agent-ui/spec';

// A drawing that says something: an image with a label that a screen reader reads instead of the shapes (so the same numbers are in the
// buttons below, which are also how a keyboard picks a bar). The label is bound to state, so it follows the data.
export const view = main(
  { id: 'chart-page' },
  h1(null, 'Sales'),
  svg(
    { id: 'chart', viewBox: '0 0 220 100', role: 'img', 'aria-label': state('sales.summary') },
    // The gradient is referred to by its HTML id (domId); `id` is the spec's own address of the element.
    defs(null, linearGradient({ id: 'bar-gradient', domId: 'bar-fill', x1: 0, y1: 0, x2: 0, y2: 1 }, stop({ offset: '0%', 'stop-color': 'currentColor' }), stop({ offset: '100%', 'stop-color': 'currentColor', 'stop-opacity': 0.35 }))),
    each(
      'sales.bars',
      'id',
      g(
        { classes: { picked: item('picked') } },
        // A title inside a shape is the browser's tooltip for it.
        rect({ x: item('x'), y: item('y'), width: item('width'), height: item('height'), fill: 'url(#bar-fill)' }, title(null, item('tooltip'))),
        text({ x: item('center'), y: 93, 'text-anchor': 'middle', 'font-size': 7 }, item('label')),
        when(item('picked'), text({ x: item('center'), y: item('valueY'), 'text-anchor': 'middle', 'font-size': 7, 'font-weight': 'bold' }, item('tooltip'))),
      ),
    ),
  ),
  ul(
    { id: 'months' },
    each('sales.bars', 'id', li(null, button({ id: 'month', 'aria-pressed': item('picked'), on: { click: act('sales.pick', { id: item('id') }) } }, item('tooltip')))),
  ),
);
