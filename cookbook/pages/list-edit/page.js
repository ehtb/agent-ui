// Recipe: a list you can add to, edit in place, tick and remove from.
// Three namespaces, one concern each. `notes` owns the list; `composer` owns the text being typed; `editing` owns which row is
// being edited and its text. When one of them has to change another (adding clears the draft, saving renames a note) it lists
// the other's action in `calls` and the owner does the writing.
const notes = {
  state: { items: [], nextId: 1 },
  derive: {
    remaining: (get) => get('items').filter((note) => !note.done).length,
  },
  actions: {
    add: {
      args: { text: 'string' },
      run: (store, { text }) => {
        const id = store.get('nextId');
        store.set('nextId', id + 1);
        store.set('items', [...store.get('items'), { id, text, done: false }]);
      },
    },
    toggle: { args: { id: 'number' }, run: (store, { id }) => store.set('items', store.get('items').map((note) => (note.id === id ? { ...note, done: !note.done } : note))) },
    rename: { args: { id: 'number', text: 'string' }, run: (store, { id, text }) => store.set('items', store.get('items').map((note) => (note.id === id ? { ...note, text } : note))) },
    remove: { args: { id: 'number' }, run: (store, { id }) => store.set('items', store.get('items').filter((note) => note.id !== id)) },
  },
};

const composer = {
  state: { draft: '' },
  actions: {
    setDraft: { args: { value: 'string' }, run: (store, { value }) => store.set('draft', value) },
    // An empty draft adds nothing, and pressing the button twice adds one note: the draft is cleared by the first.
    submit: {
      args: {},
      calls: ['notes.add'],
      run: (store, args, call) => {
        const text = store.get('draft').trim();
        if (!text) return;
        call('notes.add', { text });
        store.set('draft', '');
      },
    },
  },
};

const editing = {
  state: { id: null, draft: '' },
  actions: {
    start: {
      args: { id: 'number', text: 'string' },
      run: (store, { id, text }) => {
        store.set('id', id);
        store.set('draft', text);
      },
    },
    setDraft: { args: { value: 'string' }, run: (store, { value }) => store.set('draft', value) },
    // Saving and cancelling are safe to repeat: the second call finds nothing being edited (blur follows Enter in a browser).
    save: {
      args: {},
      calls: ['notes.rename'],
      run: (store, args, call) => {
        const id = store.get('id');
        if (id === null) return;
        const text = store.get('draft').trim();
        if (text) call('notes.rename', { id, text });
        store.set('id', null);
        store.set('draft', '');
      },
    },
    cancel: {
      args: {},
      run: (store) => {
        store.set('id', null);
        store.set('draft', '');
      },
    },
  },
};

export const page = { head: { title: 'Notes - cookbook' }, namespaces: { notes, composer, editing } };
