// Test fixture: a minimal todo-style list app (namespaces, derive, typed actions, keyed lists, bindings). Stable test input for the
// runtime tests; it is deliberately independent of the demo apps in examples/.
import { app } from '../../src/ui.js';

// Two namespaces: `todos` owns the list and its draft, `filter` owns which todos are shown. `todos` reads `filter.name`
// (reading another namespace is allowed; writing is not), and `todos.add` resets the filter through `calls`.
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

export const spec = {
  tag: 'main',
  children: [
    { tag: 'h1', children: 'Todos' },
    {
      tag: 'div',
      children: [
        {
          tag: 'input',
          props: { 'aria-label': 'New todo', placeholder: 'What needs doing?', value: { state: 'todos.draft' } },
          on: {
            input: ['todos.setDraft', { value: { event: 'target.value' } }],
            'keydown.Enter': ['todos.add', { text: { state: 'todos.draft' } }],
          },
        },
        { tag: 'button', on: { click: ['todos.add', { text: { state: 'todos.draft' } }] }, children: 'Add' },
      ],
    },
    {
      tag: 'div',
      children: {
        each: 'filter.buttons',
        key: 'name',
        template: {
          tag: 'button',
          props: { 'aria-pressed': { item: 'pressed' } },
          on: { click: ['filter.set', { value: { item: 'name' } }] },
          children: { item: 'name' },
        },
      },
    },
    {
      tag: 'ul',
      children: {
        each: 'todos.visible',
        key: 'id',
        template: {
          tag: 'li',
          children: [
            {
              tag: 'input',
              props: { type: 'checkbox', 'aria-label': { item: 'text' }, checked: { item: 'done' } },
              on: { change: ['todos.toggle', { id: { item: 'id' } }] },
            },
            { tag: 'span', props: { 'data-done': { item: 'done' } }, children: { item: 'text' } },
            {
              tag: 'button',
              props: { 'aria-label': 'Delete' },
              on: { click: ['todos.remove', { id: { item: 'id' } }] },
              children: '×',
            },
          ],
        },
      },
    },
    { tag: 'p', children: [{ state: 'todos.remainingCount' }, ' left'] },
  ],
};

export const create = ({ root, dev }) => app({ namespaces, spec, root, dev });
