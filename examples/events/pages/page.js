// The page "list": the event list with search and category filters. Its state, derived values and actions are the namespace "list".
// page.js is page-shape and behavior only; the content is view.js next to it, which only the server and the build import.
import { events, eventsSettled, plugins } from './shared.js';

// The filter names are shared: the view offers them as options, the action rejects anything else.
export const CATEGORIES = ['all', 'talk', 'workshop', 'social'];

const matchesFilters = (event, query, category) =>
  (category === 'all' || event.category === category) && (!query || `${event.title} ${event.summary} ${event.place}`.toLowerCase().includes(query));

const list = {
  state: { query: '', category: 'all' },
  derive: {
    visible: (get) => {
      const query = get('query').trim().toLowerCase();
      return get('events.list').filter((event) => matchesFilters(event, query, get('category')));
    },
    resultLabel: (get) => {
      const count = get('visible').length;
      return `${count} ${count === 1 ? 'event' : 'events'}`;
    },
  },
  actions: {
    setQuery: { args: { value: 'string' }, run: (store, { value }) => store.set('query', value) },
    setCategory: { args: { value: 'string' }, run: (store, { value }) => store.set('category', CATEGORIES.includes(value) ? value : 'all') },
  },
};

export const page = {
  namespaces: { events, list },
  plugins,
  head: { title: 'Meetups', description: 'Talks, workshops and socials about building interfaces with agents.' },
  ready: eventsSettled, // the server renders the list after the events have loaded
};
