import { act, button, each, h1, item, join, li, main, p, path, polyline, section, span, state, svg, ul, use } from '@ehtb/agent-ui/spec';

// A decorative icon next to the text that says it: hidden from assistive technology, sized and coloured by the text around it.
const checkIcon = svg({ viewBox: '0 0 24 24', width: '1em', height: '1em', 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }, path({ d: 'M5 12l5 5L20 7' }));

// An icon from a sprite file in public/: one request for every icon of the site. The href is a path of the site (the base path is added).
const star = svg({ viewBox: '0 0 24 24', width: 24, height: 24, 'aria-hidden': 'true' }, use({ href: '/icons.svg#star' }));

export const view = main(
  { id: 'icons-page' },
  h1(null, 'Icons'),
  button({ id: 'save' }, checkIcon, ' Save'),
  section(
    { id: 'rating', 'aria-label': 'Rating' },
    ul({ id: 'stars' }, each('rating.stars', 'id', li(null, button({ id: 'star', classes: { on: item('on') }, 'aria-label': join('Rate ', item('id')), 'aria-pressed': item('on'), on: { click: act('rating.set', { value: item('id') }) } }, star)))),
    p({ id: 'rating-text' }, state('rating.value'), ' of 5'),
  ),
  // A drawing that says something: an image with a label, which a screen reader reads instead of the shapes.
  svg({ id: 'sparkline', viewBox: '0 0 60 20', width: 120, height: 40, role: 'img', 'aria-label': state('visits.summary'), fill: 'none', stroke: 'currentColor' }, polyline({ id: 'sparkline-line', points: state('visits.points') })),
  span({ id: 'sparkline-legend' }, 'Last seven days'),
);
