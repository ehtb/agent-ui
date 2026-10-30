// Contacts manager. State is data in namespaces, behavior is named actions, the UI is a JSON spec.
// Shows: a real <form> with a submit handler, a <select>, search/filter/sort via derive, inline edit with `when`,
// and spec-level operators ({length}, {greaterThan}, {join}) instead of one-off derived values.
//
// page.js is page-shape and behavior only; the content is view.js next to it.

// The groups, shared with view.js (the create form's <select> and the group-filter buttons).
export const GROUPS = ['friends', 'work', 'family'];
const GROUP_FILTERS = ['all', ...GROUPS];
const CONTACT_FIELDS = { id: 'number', name: 'string', email: 'string', group: 'string' };

// Four namespaces, each answering one question:
//   contacts  the contacts; the only place they are written
//   form      the unsent "add contact" form: drafts and the validation message
//   view      how the list is shown: search, group filter, sort order
//   editing   which row is being renamed
// The workflows that cross namespaces go through `calls`: `form.submit` calls `contacts.add`, `editing.save` calls
// `contacts.rename`, and `contacts.clear` calls `editing.cancel`. The list reads `view` from `contacts` (reading is open).
export const namespaces = {
  contacts: {
    state: { items: [], nextId: 1 },
    // What one contact looks like. Every write of `items` is checked against it, and so are the `{item}` bindings over
    // `items` and over the derived list `visible` (a derived list gets the static check only).
    shapes: { items: { fields: CONTACT_FIELDS }, visible: { fields: CONTACT_FIELDS } },
    derive: {
      visible: (get) => {
        const query = get('view.search').trim().toLowerCase();
        const groupFilter = get('view.groupFilter');
        const matching = get('items').filter((contact) => {
          const matchesGroup = groupFilter === 'all' || contact.group === groupFilter;
          const matchesQuery = !query || contact.name.toLowerCase().includes(query) || contact.email.toLowerCase().includes(query);
          return matchesGroup && matchesQuery;
        });
        const direction = get('view.sortAscending') ? 1 : -1;
        return matching.sort((left, right) => direction * left.name.localeCompare(right.name));
      },
    },
    actions: {
      add: {
        args: { name: 'string', email: 'string', group: 'string' },
        run: (store, { name, email, group }) => {
          const id = store.get('nextId');
          store.set('items', [...store.get('items'), { id, name, email, group }]);
          store.set('nextId', id + 1);
        },
      },
      remove: {
        args: { id: 'number' },
        run: (store, { id }) => store.set('items', store.get('items').filter((contact) => contact.id !== id)),
      },
      rename: {
        args: { id: 'number', name: 'string' },
        run: (store, { id, name }) =>
          store.set('items', store.get('items').map((contact) => (contact.id === id && contact.name !== name ? { ...contact, name } : contact))),
      },
      clear: {
        args: {},
        calls: ['editing.cancel'],
        run: (store, args, call) => {
          store.set('items', []);
          call('editing.cancel', {});
        },
      },
    },
  },
  form: {
    state: { name: '', email: '', group: 'friends', error: '' },
    actions: {
      setName: { args: { value: 'string' }, run: (store, { value }) => store.set('name', value) },
      setEmail: { args: { value: 'string' }, run: (store, { value }) => store.set('email', value) },
      setGroup: { args: { value: 'string' }, run: (store, { value }) => store.set('group', value) },
      submit: {
        args: {},
        calls: ['contacts.add'],
        run: (store, args, call) => {
          const name = store.get('name').trim();
          const email = store.get('email').trim();
          if (!name) return store.set('error', 'Name is required');
          if (!email.includes('@')) return store.set('error', 'Email must contain @');
          call('contacts.add', { name, email, group: store.get('group') });
          store.set('name', '');
          store.set('email', '');
          store.set('error', '');
        },
      },
    },
  },
  view: {
    state: { search: '', groupFilter: 'all', sortAscending: true },
    derive: {
      sortLabel: (get) => (get('sortAscending') ? 'Name A-Z' : 'Name Z-A'),
      groupFilterButtons: (get) => GROUP_FILTERS.map((group) => ({ group, label: group, selected: group === get('groupFilter') })),
    },
    actions: {
      setSearch: { args: { value: 'string' }, run: (store, { value }) => store.set('search', value) },
      setGroupFilter: { args: { value: 'string' }, run: (store, { value }) => store.set('groupFilter', value) },
      toggleSort: { args: {}, run: (store) => store.set('sortAscending', !store.get('sortAscending')) },
    },
  },
  editing: {
    state: { id: null, name: '' },
    actions: {
      start: {
        args: { id: 'number', name: 'string' },
        run: (store, { id, name }) => {
          store.set('id', id);
          store.set('name', name);
        },
      },
      setName: { args: { value: 'string' }, run: (store, { value }) => store.set('name', value) },
      save: {
        args: {},
        calls: ['contacts.rename'],
        run: (store, args, call) => {
          const id = store.get('id');
          if (id === null) return; // idempotent: focusout can follow Enter
          const name = store.get('name').trim();
          if (name) call('contacts.rename', { id, name });
          store.set('id', null);
          store.set('name', '');
        },
      },
      cancel: {
        args: {},
        run: (store) => {
          store.set('id', null);
          store.set('name', '');
        },
      },
    },
  },
};

export const page = { head: { title: 'Contacts' }, namespaces };
