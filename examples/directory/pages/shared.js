// People directory: the integration example for async data and URLs. Two pages share what is in this module: the list at "/"
// (pages/page.js) and a person at "/person/:id" (pages/person/[id]/page.js).
// Shows: a declared async resource (loading/failed states as data), route params (/person/:id), nested lists (tags inside
// each row, with `key: "."` for plain strings), `when` with `otherwise`, a <select> whose options come from `each`, window
// events (offline banner, Escape clears the search), and spec-level operators.
import { withResources } from '@ehtb/agent-ui/resources';
import { windowEvents } from '@ehtb/agent-ui/window-events';

// Three namespaces: `people` (the directory data, loaded by a declared resource, plus the views derived from it),
// `filters` (search text and team) and `network` (online or not). Which person is shown comes from the URL: `route.params`.
// `people.visible` reads the filters; reading another namespace is open, writing is not.
export const namespaces = {
  people: {
    state: {
      list: [],
      status: 'idle', // 'idle' | 'loading' | 'ready' | 'failed'
      errorMessage: '',
      reloadCount: 0,
      simulateFailure: false,
    },
    derive: {
      visible: (get) => {
        const query = get('filters.query').trim().toLowerCase();
        const team = get('filters.team');
        return get('list').filter(
          (person) =>
            (team === 'all' || person.team === team) &&
            (!query || person.name.toLowerCase().includes(query) || person.tags.some((tag) => tag.includes(query))),
        );
      },
      teamOptions: (get) => {
        const teams = [...new Set(get('list').map((person) => person.team))].sort();
        return [{ value: 'all', label: 'All teams' }, ...teams.map((team) => ({ value: team, label: team }))];
      },
      // Route params arrive as strings, ids in the data are numbers.
      selected: (get) => get('list').find((person) => String(person.id) === get('route.params').id) ?? null,
    },
    actions: {
      loading: {
        args: {},
        run: (store) => {
          store.set('status', 'loading');
          store.set('errorMessage', '');
        },
      },
      loaded: {
        args: { data: 'json' },
        run: (store, { data }) => {
          store.set('list', data);
          store.set('status', 'ready');
        },
      },
      failed: {
        args: { message: 'string' },
        run: (store, { message }) => {
          store.set('status', 'failed');
          store.set('errorMessage', message);
        },
      },
      reload: { args: {}, run: (store) => store.set('reloadCount', store.get('reloadCount') + 1) },
      toggleFailure: { args: {}, run: (store) => store.set('simulateFailure', !store.get('simulateFailure')) },
    },
    resources: [
      {
        watch: ['reloadCount', 'simulateFailure'],
        owns: ['list', 'status', 'errorMessage'],
        request: ({ simulateFailure }) => ({ url: simulateFailure ? '/missing.json' : '/people.json' }),
        onStart: 'loading',
        onSuccess: 'loaded',
        onError: 'failed',
      },
    ],
  },
  filters: {
    state: { query: '', team: 'all' },
    actions: {
      setQuery: { args: { value: 'string' }, run: (store, { value }) => store.set('query', value) },
      clearQuery: { args: {}, run: (store) => store.set('query', '') },
      setTeam: { args: { value: 'string' }, run: (store, { value }) => store.set('team', value) },
    },
  },
  network: {
    state: { online: true },
    actions: { set: { args: { online: 'boolean' }, run: (store, { online }) => store.set('online', online) } },
  },
};

// The page is ready when the people have loaded (or failed): the server renders it after that.
export const peopleSettled = (state) => state.people.status === 'ready' || state.people.status === 'failed';

// What both pages need from outside their state: the resource, and the window events (offline banner, Escape clears the search).
export const plugins = [
  withResources,
  ({ win }) =>
    windowEvents(win, {
      offline: ['network.set', { online: false }],
      online: ['network.set', { online: true }],
      'keydown.Escape': ['filters.clearQuery'],
    }),
];
