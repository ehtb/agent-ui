// The page "eventArchived": /event/archived. It lives next to the "event" route, whose pattern /event/:id would also
// match this URL. The router picks the most specific pattern, so this page wins for /event/archived and the event
// page keeps every other /event/<id>, whatever the order in routes.js. Own folder, own state, own view.
// page.js is page-shape and behavior only; the content is view.js next to it.
import { events, eventsSettled, plugins } from '../../shared.js';

const ARCHIVE_BEFORE = '2026-11-20'; // events dated before this day count as archived

const eventArchived = {
  derive: {
    events: (get) => get('events.list').filter((event) => event.date < ARCHIVE_BEFORE),
    label: (get) => {
      const count = get('events').length;
      return `${count} archived ${count === 1 ? 'event' : 'events'}`;
    },
  },
};

export const page = {
  namespaces: { events, eventArchived },
  plugins,
  head: { title: 'Archived events - Meetups', description: 'Events that already took place.' },
  ready: eventsSettled,
};
