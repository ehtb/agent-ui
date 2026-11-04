// The host: a plain node:http server that owns the page, its header, its routes and its files. agent-ui is used as a library: no pages/
// folder, no `agent-ui build`. The server renders each island with renderPage into its own element of the host's page, writes the
// state next to it, and the browser loads the package's modules as they are, through an import map.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPage, stateScriptHtml } from '@ehtb/agent-ui/server';
import { ISLANDS } from './client/islands.js';
import { createBadge } from './client/widgets/badge.js';
import { createCatalog } from './client/widgets/catalog.js';

const clientDirectory = resolve(dirname(fileURLToPath(import.meta.url)), 'client');
// The package's browser modules (its src/ folder), served below /agent-ui/src/. A production site would bundle them instead.
const frameworkDirectory = dirname(fileURLToPath(import.meta.resolve('@ehtb/agent-ui')));

const IMPORT_MAP = {
  imports: {
    '@ehtb/agent-ui': '/agent-ui/src/ui.js',
    '@ehtb/agent-ui/spec': '/agent-ui/src/spec.js',
    '@ehtb/agent-ui/sync-apps': '/agent-ui/src/sync-apps.js',
    '@ehtb/agent-ui/hydrate': '/agent-ui/src/hydrate.js',
  },
};

// One island: its markup inside its own element, and its state in a script the browser reads (client/islands.js). The app ends with
// the render: the request is answered from the markup and the state.
const renderIsland = async (create, { elementId, stateId }, initialState) => {
  const result = await renderPage(create, { url: '/', dev: false, initialState });
  try {
    return { html: `<div id="${elementId}">${result.html}</div>${stateScriptHtml(result.state, stateId)}`, state: result.state };
  } finally {
    result.ui.destroy();
  }
};

const page = (badge, catalog) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tea shop</title>
<script type="importmap">${JSON.stringify(IMPORT_MAP)}</script>
</head>
<body>
<header><strong>Tea shop</strong> ${badge}</header>
<main>${catalog}</main>
<footer>The header, this footer and the routes are the host's; the product list and the badge are agent-ui apps.</footer>
<script type="module" src="/client/browser.js"></script>
</body>
</html>
`;

// A JavaScript file below `directory`, or null: the path is resolved and must stay inside it.
const readScript = async (directory, relativePath) => {
  const file = resolve(directory, `.${relativePath}`);
  if (!file.startsWith(directory + sep) || extname(file) !== '.js') return null;
  try {
    return await readFile(file);
  } catch {
    return null;
  }
};

export const createIslandsServer = ({ products }) =>
  createServer(async (request, response) => {
    const send = (status, type, body) => response.writeHead(status, { 'content-type': type, 'x-content-type-options': 'nosniff' }).end(body);
    try {
      const { pathname } = new URL(request.url, 'http://localhost');
      if (request.method !== 'GET' && request.method !== 'HEAD') return send(405, 'text/plain; charset=utf-8', 'method not allowed');
      if (pathname === '/') {
        const catalog = await renderIsland(createCatalog, ISLANDS.catalog, { catalog: { products } });
        const badge = await renderIsland(createBadge, ISLANDS.badge, { badge: { count: catalog.state.catalog.inCart.length } });
        return send(200, 'text/html; charset=utf-8', page(badge.html, catalog.html));
      }
      const [prefix, directory] = pathname.startsWith('/agent-ui/src/') ? ['/agent-ui/src', frameworkDirectory] : pathname.startsWith('/client/') ? ['/client', clientDirectory] : [];
      const script = prefix ? await readScript(directory, decodeURIComponent(pathname.slice(prefix.length))) : null;
      if (script) return send(200, 'text/javascript; charset=utf-8', script);
      send(404, 'text/plain; charset=utf-8', 'not found');
    } catch (error) {
      console.error(error);
      send(500, 'text/plain; charset=utf-8', 'internal server error');
    }
  });

export const PRODUCTS = [
  { id: 'sencha', name: 'Sencha' },
  { id: 'assam', name: 'Assam' },
  { id: 'rooibos', name: 'Rooibos' },
];
