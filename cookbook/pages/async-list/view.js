import { act, button, each, equals, h1, item, li, main, p, state, ul, when } from '@ehtb/agent-ui/spec';

export const view = main(
  { id: 'books-page' },
  h1(null, 'Books'),
  when(equals(state('books.status'), 'loading'), p({ id: 'loading', role: 'status' }, 'Loading...')),
  when(equals(state('books.status'), 'failed'), [p({ id: 'error', role: 'alert' }, state('books.error')), button({ id: 'retry', on: { click: act('books.retry') } }, 'Try again')]),
  when(equals(state('books.status'), 'ready'), [p({ id: 'count' }, state('books.count')), ul({ id: 'books' }, each('books.list', 'id', li({ id: 'book' }, item('title'), ' (', item('year'), ')')))]),
);
