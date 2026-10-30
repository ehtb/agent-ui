// The page "/entry/:id": one entry. An id that names no entry shows a message and answers 404. Behavior only; the
// content is in view.js next to it.
import { entriesSettled, guestbook, plugins } from '../../shared.js';
import { withHead } from '@ehtb/agent-ui/head';

const findEntry = (entries, routeParams) => entries.find((entry) => String(entry.id) === routeParams.id) ?? null;

const entryDerive = {
    current: (get) => findEntry(get('guestbook.entries'), get('route.params')),
    // Only after loading: a failed load is not "not found".
    isMissing: (get) => get('guestbook.status') === 'ready' && !findEntry(get('guestbook.entries'), get('route.params')),
};

export const page = {
  namespaces: { guestbook, entry: { derive: entryDerive } },
  plugins: [...plugins, withHead],
  head: {
    title: (state) => {
      const entry = findEntry(state.guestbook.entries, state.route.params);
      return entry ? `${entry.name} - Guestbook` : 'Entry - Guestbook';
    },
    description: (state) => findEntry(state.guestbook.entries, state.route.params)?.message ?? 'A guestbook entry',
  },
  ready: entriesSettled,
  // An id that names no entry answers 404 once the entries have loaded; a failed load answers 503.
  status: (state) => (state.guestbook.status === 'failed' ? 503 : state.guestbook.status === 'ready' && !findEntry(state.guestbook.entries, state.route.params) ? 404 : 200),
};
