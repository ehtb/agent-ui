// Recipe: state that belongs to each row of a list.
// Each person can be opened to show a note field. Whether a row is open and what its note says are per-row state: declared once with
// their defaults (`rowState`), read in the row with rowState('details.open'), written by the namespace's own actions with
// store.setRow(id, { ... }). The state is one key, `details.rowState`, holding only the rows that differ from the defaults, so it is
// plain data: logged, replayed, sent from the server. A row's state stays when its item leaves the list until the owner forgets it:
// removing a person calls `details.forget`.
const details = {
  rowState: { open: false, note: '' },
  actions: {
    toggle: { args: { id: 'number' }, run: (store, { id }) => store.setRow(id, { open: !store.getRow(id).open }) },
    write: { args: { id: 'number', note: 'string' }, run: (store, { id, note }) => store.setRow(id, { note }) },
    forget: { args: { id: 'number' }, run: (store, { id }) => store.clearRow(id) },
  },
};

const people = {
  state: {
    items: [
      { id: 1, name: 'Ada' },
      { id: 2, name: 'Bo' },
      { id: 3, name: 'Cy' },
    ],
  },
  actions: {
    remove: {
      args: { id: 'number' },
      calls: ['details.forget'],
      run: (store, { id }, call) => {
        store.set('items', store.get('items').filter((person) => person.id !== id));
        call('details.forget', { id });
      },
    },
  },
};

export const page = { head: { title: 'People - cookbook' }, namespaces: { people, details } };
