// The namespace both pages of the benchmark share. `items` is the materialized list: null until an action writes it, and
// the page at /count/:count then shows the rows its URL names (generated from route.params, a pure function of state, so
// the server renders them and the browser takes the markup over). Every action materializes first, so the same actions
// work on both pages.
//
// The generated items are a pure function of the count (no Math.random, no Date): the same count makes the same items on
// the server and in the browser, which is what taking the server's markup over requires.
export const generateItems = (count) =>
  Array.from({ length: count }, (unused, index) => ({
    id: index + 1,
    title: `Item ${index + 1}`,
    price: ((index * 7) % 90) + 10,
    done: index % 3 === 0,
  }));

// The list as it is: what the actions wrote, or what the URL names.
const materialized = (store) => store.get('items') ?? generateItems(Number(store.get('route.params').count) || 0);

const oneItem = (id) => ({ id, title: `Item ${id}`, price: ((id * 7) % 90) + 10, done: false });

export const items = {
  state: { items: null, nextId: 1 },
  shapes: { rows: { fields: { id: 'number', title: 'string', price: 'number', done: 'boolean' } } },
  derive: {
    rows: (get) => get('items') ?? generateItems(Number(get('route.params').count) || 0),
  },
  actions: {
    // One action, one state write: seeding 20,000 rows is one derive over the new list, not 20,000 actions.
    seed: {
      args: { count: 'number' },
      run: (store, { count }) => {
        store.set('items', generateItems(count));
        store.set('nextId', count + 1);
      },
    },
    toggle: {
      args: { id: 'number' },
      run: (store, { id }) => store.set('items', materialized(store).map((item) => (item.id === id ? { ...item, done: !item.done } : item))),
    },
    addOne: {
      args: {},
      run: (store) => {
        const id = store.get('nextId');
        store.set('items', [...materialized(store), oneItem(id)]);
        store.set('nextId', id + 1);
      },
    },
    addMany: {
      args: { count: 'number' },
      run: (store, { count }) => {
        const start = store.get('nextId');
        store.set('items', [...materialized(store), ...Array.from({ length: count }, (unused, index) => oneItem(start + index))]);
        store.set('nextId', start + count);
      },
    },
    clear: {
      args: {},
      run: (store) => {
        store.set('items', []);
        store.set('nextId', 1);
      },
    },
  },
};
