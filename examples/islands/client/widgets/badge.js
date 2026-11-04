// The cart badge island in the host's header: it knows only its own count, which the catalog island sends it (client/islands.js).
import { app } from '@ehtb/agent-ui';
import { span, state } from '@ehtb/agent-ui/spec';

export const badge = {
  state: { count: 0 },
  actions: {
    set: { args: { count: 'number' }, run: (store, { count }) => store.set('count', count) },
  },
};

export const badgeView = span({ id: 'badge', 'aria-live': 'polite' }, 'Cart: ', state('badge.count'));

export const createBadge = ({ root, dev, initialState = {} }) => app({ namespaces: { badge }, initialState, spec: badgeView, root, dev });
