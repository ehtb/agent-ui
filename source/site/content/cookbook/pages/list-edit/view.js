import { act, button, div, each, equals, event, form, h1, input, item, li, main, not, span, state, ul, when } from '@ehtb/agent-ui/spec';

const isEditing = equals(state('editing.id'), item('id'));

const noteRow = li(
  { id: 'note', classes: { done: item('done') } },
  input({ id: 'note-done', type: 'checkbox', 'aria-label': 'Done', checked: item('done'), on: { change: act('notes.toggle', { id: item('id') }) } }),
  when(
    not(isEditing),
    span({ id: 'note-text', on: { dblclick: act('editing.start', { id: item('id'), text: item('text') }) } }, item('text')),
    input({
      id: 'note-edit',
      'aria-label': 'Edit note',
      value: state('editing.draft'),
      focus: true,
      on: { input: act('editing.setDraft', { value: event('target.value') }), 'keydown.Enter': act('editing.save'), 'keydown.Escape': act('editing.cancel'), focusout: act('editing.save') },
    }),
  ),
  button({ id: 'note-remove', 'aria-label': 'Remove', on: { click: act('notes.remove', { id: item('id') }) } }, 'x'),
);

export const view = main(
  { id: 'notes-page' },
  h1(null, 'Notes'),
  form(
    { id: 'composer', on: { submit: act('composer.submit') } },
    input({ id: 'draft', 'aria-label': 'New note', value: state('composer.draft'), on: { input: act('composer.setDraft', { value: event('target.value') }) } }),
    button({ id: 'add', type: 'submit' }, 'Add'),
  ),
  ul({ id: 'notes' }, each('notes.items', 'id', noteRow)),
  div({ id: 'remaining' }, state('notes.remaining'), ' left'),
);
