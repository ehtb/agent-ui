// `notes` holds the notes, `composer` the unsent draft. Submitting changes both, so
// `composer.submit` calls `notes.add` (listed in `calls`) instead of writing the notes itself.
//
// page.js is page-shape and behavior only; the content is view.js next to it.
export const namespaces = {
  notes: {
    state: { items: [], nextId: 1 },
    derive: { label: (get) => `${get('items').length} ${get('items').length === 1 ? 'note' : 'notes'}` },
    actions: {
      add: {
        args: { text: 'string' },
        run: (store, { text }) => {
          const id = store.get('nextId');
          store.set('items', [...store.get('items'), { id, text }]);
          store.set('nextId', id + 1);
        },
      },
      remove: {
        args: { id: 'number' },
        run: (store, { id }) => store.set('items', store.get('items').filter((note) => note.id !== id)),
      },
    },
  },
  composer: {
    state: { draft: '' },
    actions: {
      setDraft: { args: { value: 'string' }, run: (store, { value }) => store.set('draft', value) },
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
  },
};

export const page = { head: { title: 'Notes' }, namespaces };
