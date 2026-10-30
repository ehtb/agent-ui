// The content of the page at "/" (the file next to page.js). build/ and the server import it; a browser bundle does
// not, because the build renders this view in Node and ships the finished spec as data instead.
import { a, act, and, div, each, equals, event, input, item, join, length, li, option, p, section, select, state, ul, when } from '@ehtb/agent-ui/spec';
import { site } from './layout.js';
import { CATEGORIES } from './page.js';

export const view = section(
  { id: 'list-view' },
  div(
    { id: 'filters' },
    input({ id: 'search', type: 'search', 'aria-label': 'Search events', placeholder: 'Search events', value: state('list.query'), on: { input: act('list.setQuery', { value: event('target.value') }) } }),
    select(
      { id: 'category', 'aria-label': 'Category', value: state('list.category'), on: { change: act('list.setCategory', { value: event('target.value') }) } },
      CATEGORIES.map((category) => option({ value: category }, category === 'all' ? 'All categories' : category)),
    ),
  ),
  p({ id: 'result-count', role: 'status' }, state('list.resultLabel')),
  ul(
    { id: 'events' },
    each(
      'list.visible',
      'id',
      li(
        null,
        a({ href: join('/event/', item('id')) }, item('title')),
        p({ class: 'meta' }, item('date'), ' · ', item('place'), ' · ', item('category')),
        p(null, item('summary')),
      ),
    ),
  ),
  when(and(equals(state('events.status'), 'ready'), equals(length(state('list.visible')), 0)), p({ id: 'no-results' }, 'No events match your search.')),
);

export const layout = site;
