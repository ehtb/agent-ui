// Two apps on one page the host owns. Each island is a separate app with its own state and its own log; syncApps is the one way they
// talk: the catalog's count goes to the badge through the badge's own action, one way.
import { syncApps } from '@ehtb/agent-ui/sync-apps';
import { readServerState } from '@ehtb/agent-ui/hydrate';
import { createBadge } from './widgets/badge.js';
import { createCatalog } from './widgets/catalog.js';

// The element and the state script of each island, as the server writes them (server.js).
export const ISLANDS = {
  catalog: { elementId: 'catalog-island', stateId: 'catalog-state' },
  badge: { elementId: 'badge-island', stateId: 'badge-state' },
};

export const connectIslands = (catalogApp, badgeApp) => syncApps({ from: catalogApp, to: badgeApp, watch: ['catalog.count'], action: 'badge.set', args: { count: 'catalog.count' } });

// In the browser: each island takes over the markup the server wrote, from the state the server embedded next to it.
export const startIslands = ({ document, dev }) => {
  const start = (create, { elementId, stateId }) => create({ root: document.getElementById(elementId), dev, initialState: readServerState(document, stateId) });
  const catalogApp = start(createCatalog, ISLANDS.catalog);
  const badgeApp = start(createBadge, ISLANDS.badge);
  return { catalogApp, badgeApp, stop: connectIslands(catalogApp, badgeApp) };
};
