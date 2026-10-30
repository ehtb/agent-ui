import { act, button, each, event, h1, item, li, main, rowState, span, textarea, ul, when } from '@ehtb/agent-ui/spec';

const personRow = li(
  { id: 'person', classes: { open: rowState('details.open') } },
  span({ id: 'person-name' }, item('name')),
  button({ id: 'person-toggle', on: { click: act('details.toggle', { id: item('id') }) } }, 'Notes'),
  button({ id: 'person-remove', on: { click: act('people.remove', { id: item('id') }) } }, 'Remove'),
  when(rowState('details.open'), textarea({ id: 'person-note', 'aria-label': 'Note', value: rowState('details.note'), on: { input: act('details.write', { id: item('id'), note: event('target.value') }) } })),
);

export const view = main({ id: 'people-page' }, h1(null, 'People'), ul({ id: 'people' }, each('people.items', 'id', personRow)));
