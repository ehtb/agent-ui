// Recipe: a text field with a list of options chosen by mouse or keyboard.
// What the list shows is derived: the options that match the query, each marked `active` when it is the highlighted one. The arrow
// keys move the highlight (clamped, never out of range), Enter chooses it, Escape closes the list. A click chooses by value.
const FRUITS = ['Apple', 'Apricot', 'Banana', 'Blueberry', 'Cherry', 'Grape', 'Lemon', 'Mango'];

const picker = {
  state: { query: '', open: false, activeIndex: 0, chosen: '' },
  derive: {
    options: (get) => {
      const query = get('query').trim().toLowerCase();
      return FRUITS.filter((fruit) => fruit.toLowerCase().includes(query)).map((value, index) => ({ value, active: index === get('activeIndex') }));
    },
    hasOptions: (get) => get('options').length > 0,
  },
  actions: {
    setQuery: {
      args: { value: 'string' },
      run: (store, { value }) => {
        store.set('query', value);
        store.set('open', true);
        store.set('activeIndex', 0);
      },
    },
    move: {
      args: { by: 'number' },
      run: (store, { by }) => {
        const last = store.get('options').length - 1;
        store.set('open', true);
        store.set('activeIndex', Math.max(0, Math.min(last, store.get('activeIndex') + by)));
      },
    },
    choose: {
      args: { value: 'string' },
      run: (store, { value }) => {
        store.set('chosen', value);
        store.set('query', value);
        store.set('open', false);
      },
    },
    // Enter chooses what is highlighted, if the list is open and has it.
    chooseActive: {
      args: {},
      run: (store) => {
        const active = store.get('open') ? store.get('options')[store.get('activeIndex')] : undefined;
        if (active) {
          store.set('chosen', active.value);
          store.set('query', active.value);
          store.set('open', false);
        }
      },
    },
    close: { args: {}, run: (store) => store.set('open', false) },
  },
};

export const page = { head: { title: 'Combobox - cookbook' }, namespaces: { picker } };
