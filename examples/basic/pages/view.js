// The content of the page at "/" (the file next to page.js). build/ and the server import it; a browser bundle does
// not, because the build renders this view in Node and ships the finished spec as data instead.
import { main, h1, div, ul, li, p, span, input, button, each, act, event, item, state } from '@ehtb/agent-ui/spec';

export const view = main(
  null,
  h1(null, 'Todos'),
  div(
    null,
    input({
      'aria-label': 'New todo',
      placeholder: 'What needs doing?',
      value: state('todos.draft'),
      on: {
        input: act('todos.setDraft', { value: event('target.value') }),
        'keydown.Enter': act('todos.add', { text: state('todos.draft') }),
      },
    }),
    button({ on: { click: act('todos.add', { text: state('todos.draft') }) } }, 'Add'),
  ),
  div(
    null,
    each(
      'filter.buttons',
      'name',
      button({ 'aria-pressed': item('pressed'), on: { click: act('filter.set', { value: item('name') }) } }, item('name')),
    ),
  ),
  ul(
    null,
    each(
      'todos.visible',
      'id',
      li(
        null,
        input({ type: 'checkbox', 'aria-label': item('text'), checked: item('done'), on: { change: act('todos.toggle', { id: item('id') }) } }),
        span({ 'data-done': item('done') }, item('text')),
        button({ 'aria-label': 'Delete', on: { click: act('todos.remove', { id: item('id') }) } }, '×'),
      ),
    ),
  ),
  p(null, state('todos.remainingCount'), ' left'),
);
