// The content of the page at "/" (the file next to page.js). build/ and the server import it; a browser bundle does
// not, because the build renders this view in Node and ships the finished spec as data instead.
import { a, act, button, div, each, equals, event, greaterThan, input, item, join, length, li, option, p, section, select, span, state, ul, when } from '@ehtb/agent-ui/spec';
import { layout, tagList } from './layout.js';
// The shell both pages share; the build and the server read it as `view.layout`.
export { layout };

const isLoading = equals(state('people.status'), 'loading');
const hasFailed = equals(state('people.status'), 'failed');

export const view =
  section(
    { id: 'list-view' },
    div(
      { class: 'toolbar' },
      input({ id: 'search', type: 'search', 'aria-label': 'Search people or tags', placeholder: 'Search', value: state('filters.query'), on: { input: act('filters.setQuery', { value: event('target.value') }) } }),
      select(
        { id: 'team', 'aria-label': 'Team', value: state('filters.team'), on: { change: act('filters.setTeam', { value: event('target.value') }) } },
        each('people.teamOptions', 'value', option({ value: item('value') }, item('label'))),
      ),
      button({ id: 'reload', on: { click: act('people.reload') } }, 'Reload'),
      button({ id: 'failure', on: { click: act('people.toggleFailure') } }, 'Toggle simulated failure'),
    ),
    when(isLoading, p({ id: 'loading' }, 'Loading people…')),
    when(hasFailed, p({ id: 'error', role: 'alert' }, join('Could not load people: ', state('people.errorMessage')))),
    ul(
      { id: 'people' },
      each(
        'people.visible',
        'id',
        li(
          { class: 'person' },
          a({ href: join('/person/', item('id')) }, item('name')),
          span({ class: 'team' }, item('team')),
          when(greaterThan(length(item('tags')), 0), tagList(item('tags')), span({ class: 'no-tags' }, 'no tags')),
        ),
      ),
    ),
    p({ id: 'count' }, join(length(state('people.visible')), ' of ', length(state('people.list')), ' shown')),
  );
