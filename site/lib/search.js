// The search index is a small JSON file generated next to the pages. It loads once per page visit; typing only filters
// the index in derive, so no request runs for a key press.
const normalize = (value) => String(value ?? '').toLowerCase();

const snippetAround = (text, terms) => {
  const source = String(text ?? '');
  const lower = source.toLowerCase();
  const found = terms.map((term) => lower.indexOf(term)).filter((position) => position >= 0);
  if (!found.length) return source.length > 180 ? `${source.slice(0, 177)}…` : source;
  const first = Math.min(...found);
  const start = Math.max(0, first - 60);
  const end = Math.min(source.length, first + 140);
  return `${start > 0 ? '…' : ''}${source.slice(start, end).trim()}${end < source.length ? '…' : ''}`;
};

export const search = {
  state: { query: '', index: [], status: 'idle', error: '' },
  derive: {
    results: (get) => {
      const query = normalize(get('query')).trim();
      if (!query) return [];
      const terms = query.split(/\s+/).filter(Boolean);
      const score = (entry) => {
        const title = normalize(entry.title);
        const pageTitle = normalize(entry.pageTitle);
        const text = normalize(entry.text);
        let total = 0;
        for (const term of terms) {
          if (title.includes(term)) total += 12;
          if (pageTitle.includes(term)) total += 5;
          if (text.includes(term)) total += 2;
          if (!title.includes(term) && !pageTitle.includes(term) && !text.includes(term)) return -1;
        }
        return total;
      };
      return get('index')
        .map((entry) => ({ entry, score: score(entry) }))
        .filter((candidate) => candidate.score >= 0)
        .sort((left, right) => right.score - left.score || left.entry.title.localeCompare(right.entry.title))
        .slice(0, 8)
        .map(({ entry }) => ({
          href: entry.href,
          title: entry.title,
          pageTitle: entry.pageTitle,
          snippet: snippetAround(entry.text, terms),
        }));
    },
    resultLabel: (get) => {
      const count = get('results').length;
      return `${count} ${count === 1 ? 'result' : 'results'}`;
    },
  },
  actions: {
    setQuery: {
      args: { value: 'string' },
      run: (store, { value }) => store.set('query', value),
    },
    loading: {
      args: {},
      run: (store) => {
        if (store.get('status') !== 'ready') store.set('status', 'loading');
        store.set('error', '');
      },
    },
    loaded: {
      args: { data: 'json' },
      run: (store, { data }) => {
        store.set('index', Array.isArray(data) ? data : []);
        store.set('status', 'ready');
      },
    },
    failed: {
      args: { message: 'string' },
      run: (store, { message }) => {
        store.set('status', 'failed');
        store.set('error', message);
      },
    },
  },
  resources: [
    {
      watch: [],
      owns: ['index', 'status', 'error'],
      request: () => ({ url: '/search.json' }),
      onStart: 'loading',
      onSuccess: 'loaded',
      onError: 'failed',
    },
  ],
};
