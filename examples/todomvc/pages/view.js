// The content of the page at "/" (the file next to page.js). build/ and the server import it; a browser bundle does not,
// because the build renders this view (with the layout below) in Node once and ships the finished spec as data instead.
import { section, header, footer, h1, p, ul, li, div, a, span, strong, label, input, button, each, when, act, event, item, equals, state } from '@ehtb/agent-ui/spec';

const isBeingEdited = equals(state('editing.id'), item('id'));

const todoRow = li(
  { classes: { completed: item('completed'), editing: isBeingEdited } },
  div(
    { class: 'view' },
    input({ class: 'toggle', type: 'checkbox', 'aria-label': item('title'), checked: item('completed'), on: { change: act('todos.toggle', { id: item('id') }) } }),
    label({ on: { dblclick: act('editing.start', { id: item('id') }) } }, item('title')),
    button({ class: 'destroy', 'aria-label': 'Delete', on: { click: act('todos.remove', { id: item('id') }) } }),
  ),
  when(
    isBeingEdited,
    input({
      class: 'edit',
      'aria-label': 'Edit todo',
      value: state('editing.title'),
      focus: true,
      on: {
        input: act('editing.setTitle', { value: event('target.value') }),
        'keydown.Enter': act('editing.commit'),
        'keydown.Escape': act('editing.cancel'),
        focusout: act('editing.commit'),
      },
    }),
  ),
);

const pageHeader = header(
  { class: 'header' },
  h1(null, 'todos'),
  input({
    class: 'new-todo',
    'aria-label': 'New todo',
    placeholder: 'What needs to be done?',
    value: state('draft.title'),
    focus: true,
    on: {
      input: act('draft.set', { value: event('target.value') }),
      // Two handlers on one event: add the todo, then empty the input. Both read their arguments before either runs.
      'keydown.Enter': [act('todos.add', { title: state('draft.title') }), act('draft.clear')],
    },
  }),
);

const mainSection = section(
  { class: 'main' },
  input({
    domId: 'toggle-all', // the HTML id that the label's `for` points at (`id` would be the spec address)
    class: 'toggle-all',
    type: 'checkbox',
    'aria-label': 'Mark all as complete',
    checked: state('todos.allCompleted'),
    on: { change: act('todos.toggleAll', { completed: event('target.checked') }) },
  }),
  label({ for: 'toggle-all' }, 'Mark all as complete'),
  ul({ class: 'todo-list' }, each('todos.visible', 'id', todoRow)),
);

const filterLink = li(null, button({ classes: { selected: item('selected') }, on: { click: act('filter.set', { value: item('name') }) } }, item('label')));

const pageFooter = footer(
  { class: 'footer' },
  span({ class: 'todo-count' }, strong(null, state('todos.activeCount')), ' ', state('todos.itemWord'), ' left'),
  ul({ class: 'filters' }, each('filter.filters', 'name', filterLink)),
  when(state('todos.hasCompleted'), button({ class: 'clear-completed', on: { click: act('todos.clearCompleted') } }, 'Clear completed')),
);

export const view = section({ class: 'todoapp' }, pageHeader, when(state('todos.hasTodos'), mainSection), when(state('todos.hasTodos'), pageFooter));

// The official TodoMVC page puts its credits below the app.
const credits = footer({ class: 'info' }, p(null, 'Double-click to edit a todo'), p(null, 'Built with agent-ui'), p(null, 'Part of ', a({ href: 'http://todomvc.com' }, 'TodoMVC')));

export const layout = (content) => div(null, content, credits);
