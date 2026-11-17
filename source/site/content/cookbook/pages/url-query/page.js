// Recipe: filters, tabs or a page number that live in the URL.
// `route.query` is state the framework keeps: the URL's query, read once when the page starts (server and browser), and
// written with `route.setQuery` and `route.clearQuery`. In the browser the address follows the state, so what the visitor
// sees is the URL they can copy, send or reload. What the query does to the list is `derive`; the page never parses the
// URL itself. The values are strings (a page number is '2'), because that is what a URL holds.
const PAGE_SIZE = 3;

const books = {
  state: {
    items: [
      { id: 1, title: 'The Voyage Out', topic: 'fiction' },
      { id: 2, title: 'Kora in Hell', topic: 'poetry' },
      { id: 3, title: 'Silent Spring', topic: 'science' },
      { id: 4, title: 'To the Lighthouse', topic: 'fiction' },
      { id: 5, title: 'West Wind', topic: 'poetry' },
      { id: 6, title: 'The Making of a Scientist', topic: 'science' },
      { id: 7, title: 'Orlando', topic: 'fiction' },
    ],
  },
  derive: {
    topic: (get) => get('route.query').topic ?? 'all',
    page: (get) => Math.max(1, Number(get('route.query').page) || 1),
    inTopic: (get) => {
      const topic = get('topic');
      return get('items').filter((book) => topic === 'all' || book.topic === topic);
    },
    pageCount: (get) => Math.max(1, Math.ceil(get('inTopic').length / PAGE_SIZE)),
    visible: (get) => {
      const page = Math.min(get('page'), get('pageCount'));
      return get('inTopic').slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    },
    previousPage: (get) => String(Math.max(1, get('page') - 1)),
    nextPage: (get) => String(Math.min(get('pageCount'), get('page') + 1)),
  },
};

export const page = { head: { title: 'Books - cookbook' }, namespaces: { books } };
