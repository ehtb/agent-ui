// Minimal todo list: the smallest page that exercises namespaces, derive, typed actions, keyed lists and bindings.
// `todos` owns the list and its draft, `filter` owns which todos are shown. `todos.visible` reads `filter.name`: reading
// another namespace is allowed (written with its namespace), writing is not.
//
// page.js is page-shape and behavior only; the content is view.js next to it, which only the server and the build
// import. A browser downloads the page behavior and the finished spec, never the builders that assemble the view.

export const namespaces = {
  todos: {
    state: { items: [], nextId: 1, draft: '' },
    derive: {
      visible: (get) => {
        const filter = get('filter.name');
        return get('items').filter((todo) => filter === 'all' || (filter === 'done') === todo.done);
      },
      remainingCount: (get) => get('items').filter((todo) => !todo.done).length,
    },
    actions: {
      setDraft: {
        args: { value: 'string' },
        run: (store, { value }) => store.set('draft', value),
      },
      add: {
        args: { text: 'string' },
        run: (store, args) => {
          const text = args.text.trim();
          if (!text) return;
          const id = store.get('nextId');
          store.set('nextId', id + 1);
          store.set('items', [...store.get('items'), { id, text, done: false }]);
          store.set('draft', '');
        },
      },
      toggle: {
        args: { id: 'number' },
        run: (store, { id }) =>
          store.set(
            'items',
            store.get('items').map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo)),
          ),
      },
      remove: {
        args: { id: 'number' },
        run: (store, { id }) => store.set('items', store.get('items').filter((todo) => todo.id !== id)),
      },
    },
  },
  filter: {
    state: { name: 'all' },
    derive: {
      buttons: (get) => ['all', 'active', 'done'].map((name) => ({ name, pressed: get('name') === name })),
    },
    actions: {
      set: {
        args: { value: 'string' },
        run: (store, { value }) => store.set('name', value),
      },
    },
  },
};

export const page = { head: { title: 'Todos' }, namespaces };
