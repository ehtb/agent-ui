// Express owns the server, the routes and the API. agent-ui contributes one thing: a request handler that renders the
// guestbook pages (the folders below pages/).
//
//   npm install && npm start        then open http://localhost:3000   (start.js listens; this file only builds the server)
//
// Order matters: the host's own routes come first, then the host's file server for the built assets, then the agent-ui handler,
// then the host's own 404. The handler answers only the pages and calls next() for everything else.
import express from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSsrHandler } from '@ehtb/agent-ui/server/ssr-handler.mjs';
import { loadConfig } from '@ehtb/agent-ui/build/config.mjs';
import { createStore, validateEntry } from './store.js';

const root = dirname(fileURLToPath(import.meta.url));

export const createServer = async ({ outDir = 'dist', store = createStore() } = {}) => {
  const config = await loadConfig({ root, file: 'build.config.mjs' });
  const server = express();
  server.disable('x-powered-by');
  server.use(express.json());

  // The host's routes and API.
  server.get('/api/entries', (request, response) => response.json(store.list()));
  server.post('/api/entries', (request, response) => {
    const errors = validateEntry(request.body ?? {});
    if (Object.keys(errors).length) return response.status(422).json({ message: Object.values(errors)[0], errors });
    response.status(201).json(store.add(request.body));
  });

  // The page. While rendering on the server the app asks for /api/entries; answer from the same store, in process.
  const fetchFunction = async (url) =>
    url === '/api/entries'
      ? { ok: true, status: 200, json: async () => store.list() }
      : { ok: false, status: 404, json: async () => null };
  // The built files (assets) are the host's to serve; agent-ui renders the pages.
  server.use(express.static(resolve(root, outDir), { index: false }));
  server.use(await createSsrHandler({ config: { ...config, fetchFunction }, root, outDir }));

  server.use((request, response) => response.status(404).type('text').send('Not found'));
  return server;
};
