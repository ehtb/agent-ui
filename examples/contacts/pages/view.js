// The content of the page at "/" (the file next to page.js). build/ and the server import it; a browser bundle does
// not, because the build renders this view in Node and ships the finished spec as data instead.
import { act, button, div, each, equals, event, form, greaterThan, h1, input, item, join, length, li, not, option, p, select, span, state, ul, when } from '@ehtb/agent-ui/spec';
// GROUPS is defined in page.js: it also builds the group filters, so the list of groups has one source.
import { GROUPS } from './page.js';

const isEditingRow = equals(state('editing.id'), item('id'));
const hasFormError = greaterThan(length(state('form.error')), 0);
const hasContacts = greaterThan(length(state('contacts.items')), 0);

export const view = div(
  { id: 'contacts-app' },
  h1(null, 'Contacts'),
  // A form submits to an action: Enter in any field and the Add button both fire `submit`, which the runtime
  // prevents from reloading the page.
  form(
    { id: 'add-form', class: 'contact-form', on: { submit: act('form.submit', {}) } },
    input({ id: 'draft-name', type: 'text', placeholder: 'Name', 'aria-label': 'Name', value: state('form.name'), on: { input: act('form.setName', { value: event('target.value') }) } }),
    input({ id: 'draft-email', type: 'text', placeholder: 'Email', 'aria-label': 'Email', value: state('form.email'), on: { input: act('form.setEmail', { value: event('target.value') }) } }),
    select(
      { id: 'draft-group', 'aria-label': 'Group', value: state('form.group'), on: { change: act('form.setGroup', { value: event('target.value') }) } },
      GROUPS.map((group) => option({ value: group }, group)),
    ),
    button({ id: 'add-button', type: 'submit' }, 'Add'),
    when(hasFormError, span({ id: 'form-error', class: 'form-error', role: 'alert' }, state('form.error'))),
  ),
  div(
    { class: 'toolbar' },
    input({ id: 'search', type: 'search', placeholder: 'Search', 'aria-label': 'Search', value: state('view.search'), on: { input: act('view.setSearch', { value: event('target.value') }) } }),
    div(
      { class: 'group-filters' },
      each('view.groupFilterButtons', 'group', button({ classes: { selected: item('selected') }, on: { click: act('view.setGroupFilter', { value: item('group') }) } }, item('label'))),
    ),
    button({ id: 'sort-toggle', on: { click: act('view.toggleSort', {}) } }, state('view.sortLabel')),
    when(hasContacts, button({ id: 'clear-all', on: { click: act('contacts.clear', {}) } }, 'Clear all')),
  ),
  ul(
    { class: 'contact-list' },
    each(
      'contacts.visible',
      'id',
      li(
        { class: 'contact-row' },
        when(not(isEditingRow), span({ class: 'contact-name', on: { dblclick: act('editing.start', { id: item('id'), name: item('name') }) } }, item('name'))),
        when(
          isEditingRow,
          input({
            class: 'edit-name',
            'aria-label': 'Edit name',
            focus: true,
            value: state('editing.name'),
            on: {
              input: act('editing.setName', { value: event('target.value') }),
              'keydown.Enter': act('editing.save', {}),
              'keydown.Escape': act('editing.cancel', {}),
              focusout: act('editing.cancel', {}),
            },
          }),
        ),
        span({ class: 'contact-email' }, item('email')),
        span({ class: 'contact-group' }, item('group')),
        button({ class: 'delete', on: { click: act('contacts.remove', { id: item('id') }) } }, 'Delete'),
      ),
    ),
  ),
  p({ id: 'summary', class: 'summary' }, join(length(state('contacts.visible')), ' of ', length(state('contacts.items')), ' shown')),
);
