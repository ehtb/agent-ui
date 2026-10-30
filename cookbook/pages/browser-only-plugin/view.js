import { act, event, input, main, p, state } from '@ehtb/agent-ui/spec';

export const view = main(
  { id: 'note-page' },
  input({ id: 'text', domId: 'text-field', type: 'text', 'aria-label': 'Note', value: state('note.text'), on: { input: act('note.setText', { value: event('target.value') }) } }),
  p({ id: 'status' }, state('note.status')),
);
