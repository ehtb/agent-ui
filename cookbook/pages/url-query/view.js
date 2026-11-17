// The content of the recipe. The buttons write the query; the list and the pager read the derived values. The numbers
// the pager needs are derived too (the grammar has no arithmetic, and a derive is where this belongs): the page the
// buttons ask for is clamped there, so pressing Previous on the first page writes '1' and changes nothing.
import { section, header, h1, p, nav, ul, li, button, span, each, item, state, equals, act } from '@ehtb/agent-ui/spec';

const topicButton = (name, label) =>
  button({
    id: `topic-${name}`,
    classes: { current: equals(state('books.topic'), name) },
    on: { click: act('route.setQuery', { key: 'topic', value: name }) },
  }, label);

export const view = section(
  { id: 'url-query' },
  header(
    null,
    h1(null, 'Books'),
    p(
      null,
      'Topic and page are the URL\'s query: copy the address, or reload, and the page shows what it shows. ',
      span({ id: 'page-of' }, 'Page ', state('books.page'), ' of ', state('books.pageCount')),
    ),
  ),
  nav(
    { id: 'topics', 'aria-label': 'Topic' },
    topicButton('all', 'All'),
    topicButton('fiction', 'Fiction'),
    topicButton('poetry', 'Poetry'),
    topicButton('science', 'Science'),
  ),
  ul({ id: 'book-list' }, each('books.visible', 'id', li(null, item('title'), ' — ', item('topic')))),
  nav(
    { id: 'pager', 'aria-label': 'Pages' },
    button({ id: 'previous', on: { click: act('route.setQuery', { key: 'page', value: state('books.previousPage') }) } }, 'Previous'),
    button({ id: 'next', on: { click: act('route.setQuery', { key: 'page', value: state('books.nextPage') }) } }, 'Next'),
    button({
      id: 'clear',
      on: { click: [act('route.clearQuery', { key: 'topic' }), act('route.clearQuery', { key: 'page' })] },
    }, 'All topics, first page'),
  ),
);
