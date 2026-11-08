// The page is the demo; the server is the example. Its markup is rendered for every request (the checks are in the HTML),
// and the browser takes over from there: ticking a box calls the namespace's action, and the count is derived.
export const namespaces = {
  checklist: {
    state: {
      items: [
        { id: 1, label: 'Build the site with agent-ui', checked: false },
        { id: 2, label: 'Load every built file into memory', checked: false },
        { id: 3, label: 'Render every page for its own URL', checked: false },
        { id: 4, label: 'Send the security headers on every answer', checked: false },
        { id: 5, label: 'Cache hashed files forever and revalidate the rest', checked: false },
        { id: 6, label: 'Answer /healthz without rendering', checked: false },
      ],
    },
    derive: {
      done: (get) => get('items').filter((item) => item.checked).length,
      total: (get) => get('items').length,
    },
    actions: {
      toggle: {
        args: { id: 'number' },
        run: (store, { id }) =>
          store.set(
            'items',
            store.get('items').map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)),
          ),
      },
    },
  },
};

export const page = {
  head: { title: 'Production server', description: 'An agent-ui site served by one dependency-free Node server.' },
  namespaces,
};
