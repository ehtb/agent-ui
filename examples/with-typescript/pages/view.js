import { act, button, each, equals, h1, h2, item, li, main, p, section, span, state, ul, when } from '@ehtb/agent-ui/spec';
import { COLUMNS } from './tasks.js';

// One column per status, made from the same table the types use. The {item} bindings are checked against the fields of the shape
// that page.js declares for the list.
/** @param {import('./tasks.js').Column} column */
const column = ({ status, title, next }) =>
  section(
    { id: `column-${status}`, class: 'column' },
    h2(null, title),
    ul(
      { id: `tasks-${status}` },
      each(
        `board.${status}`,
        'id',
        li(
          { id: `task-${status}` },
          span(null, item('title')),
          when(equals(item('status'), 'done'), span(null, ' (done)')),
          ...(next === null ? [] : [button({ 'aria-label': `Move to ${next}`, on: { click: act('board.move', { id: item('id'), status: next }) } }, `Move to ${next}`)]),
        ),
      ),
    ),
  );

export const view = main(
  { id: 'board-page' },
  h1(null, 'Board'),
  when(state('board.error'), p({ id: 'error', role: 'alert' }, state('board.error'))),
  p({ id: 'summary' }, state('board.summary')),
  ...COLUMNS.map(column),
);
