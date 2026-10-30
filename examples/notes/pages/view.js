// The content of the page at "/" (the file next to page.js). build/ and the server import it; a browser bundle does
// not, because the build renders this view in Node and ships the finished spec as data instead.
import { main, h1, form, ul, li, p, span, input, button, each, act, event, item, state } from '@ehtb/agent-ui/spec';

export const view = main(
  null,
  h1(null, 'Notes'),
  form(
    { on: { submit: act('composer.submit') } },
    input({ id: 'draft', 'aria-label': 'New note', value: state('composer.draft'), on: { input: act('composer.setDraft', { value: event('target.value') }) } }),
    button({ type: 'submit' }, 'Add'),
  ),
  ul(
    null,
    each(
      'notes.items',
      'id',
      li(null, span(null, item('text')), button({ 'aria-label': 'Delete', on: { click: act('notes.remove', { id: item('id') }) } }, '×')),
    ),
  ),
  p(null, state('notes.label')),
);
