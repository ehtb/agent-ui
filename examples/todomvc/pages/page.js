// TodoMVC (https://github.com/tastejs/todomvc/blob/master/app-spec.md) on agent-ui.
//
// Four namespaces:
//   todos     the list and everything derived from it: counts, "all completed", the visible rows
//   draft     the text of the new-todo input
//   editing   which row is being edited and its text
//   filter    which todos are shown: all, active or completed
// Where each part of the TodoMVC spec lives:
//   No todos          derive todos.hasTodos + `when` nodes
//   New todo          action todos.add, with draft.clear in the same Enter handler (a list of two handlers)
//   Mark all          action todos.toggleAll + derive todos.allCompleted
//   Item              actions todos.toggle / editing.start / todos.remove
//   Editing           namespace editing; editing.commit calls todos.rename or todos.remove
//   Counter           derive todos.activeCount + todos.itemWord
//   Clear completed   derive todos.hasCompleted + action todos.clearCompleted
//   Filters           namespace filter + derive todos.visible (the filter is page state, not part of the URL)
// Two sections of the official spec do not apply to this page: persistence (durable data lives on the server) and routing
// (a page is a URL; the filter is state of this page).
const FILTER_NAMES = ['all', 'active', 'completed'];
const FILTERS = [
  { name: 'all', label: 'All' },
  { name: 'active', label: 'Active' },
  { name: 'completed', label: 'Completed' },
];

const removeById = (todos, id) => todos.filter((todo) => todo.id !== id);

export const namespaces = {
  todos: {
    state: { items: [], nextId: 1 },
    derive: {
      visible: (get) => {
        const filter = get('filter.name');
        return get('items').filter((todo) => filter === 'all' || (filter === 'completed') === todo.completed);
      },
      activeCount: (get) => get('items').filter((todo) => !todo.completed).length,
      itemWord: (get) => (get('activeCount') === 1 ? 'item' : 'items'),
      hasTodos: (get) => get('items').length > 0,
      hasCompleted: (get) => get('items').some((todo) => todo.completed),
      allCompleted: (get) => {
        const items = get('items');
        return items.length > 0 && items.every((todo) => todo.completed);
      },
    },
    actions: {
      add: {
        args: { title: 'string' },
        run: (store, args) => {
          const title = args.title.trim();
          if (!title) return;
          const id = store.get('nextId');
          store.set('nextId', id + 1);
          store.set('items', [...store.get('items'), { id, title, completed: false }]);
        },
      },
      toggle: {
        args: { id: 'number' },
        run: (store, { id }) => store.set('items', store.get('items').map((todo) => (todo.id === id ? { ...todo, completed: !todo.completed } : todo))),
      },
      toggleAll: {
        args: { completed: 'boolean' },
        run: (store, { completed }) => store.set('items', store.get('items').map((todo) => (todo.completed === completed ? todo : { ...todo, completed }))),
      },
      rename: {
        args: { id: 'number', title: 'string' },
        run: (store, { id, title }) => store.set('items', store.get('items').map((todo) => (todo.id === id ? { ...todo, title } : todo))),
      },
      remove: {
        args: { id: 'number' },
        run: (store, { id }) => store.set('items', removeById(store.get('items'), id)),
      },
      clearCompleted: {
        args: {},
        run: (store) => store.set('items', store.get('items').filter((todo) => !todo.completed)),
      },
    },
  },
  draft: {
    state: { title: '' },
    actions: {
      set: { args: { value: 'string' }, run: (store, { value }) => store.set('title', value) },
      clear: { args: {}, run: (store) => store.set('title', '') },
    },
  },
  editing: {
    state: { id: null, title: '' },
    actions: {
      start: {
        args: { id: 'number' },
        run: (store, { id }) => {
          const todo = store.get('todos.items').find((candidate) => candidate.id === id);
          if (!todo) return;
          store.set('id', todo.id);
          store.set('title', todo.title);
        },
      },
      setTitle: { args: { value: 'string' }, run: (store, { value }) => store.set('title', value) },
      // Commit and cancel are idempotent on purpose: the browser fires focusout after Enter/Escape
      // already removed the edit input, and that second event must do nothing.
      commit: {
        args: {},
        calls: ['todos.rename', 'todos.remove'],
        run: (store, args, call) => {
          const id = store.get('id');
          if (id === null) return;
          const title = store.get('title').trim();
          if (title) call('todos.rename', { id, title });
          else call('todos.remove', { id });
          store.set('id', null);
          store.set('title', '');
        },
      },
      cancel: {
        args: {},
        run: (store) => {
          store.set('id', null);
          store.set('title', '');
        },
      },
    },
  },
  filter: {
    state: { name: 'all' },
    derive: {
      filters: (get) => FILTERS.map(({ name, label }) => ({ name, label, selected: name === get('name') })),
    },
    actions: {
      set: {
        args: { value: 'string' },
        run: (store, { value }) => {
          if (FILTER_NAMES.includes(value)) store.set('name', value);
        },
      },
    },
  },
};

// Behavior only: the content is view.js next to this file (the build and the server import it, a browser bundle does not).
export const page = { head: { title: 'TodoMVC' }, namespaces };
