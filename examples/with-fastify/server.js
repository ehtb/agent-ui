// Fastify owns the server, the routes and the API. agent-ui contributes one thing: a request handler that renders the
// guestbook pages (the folders below pages/).
//
//   npm install && npm start        then open http://localhost:3000   (start.js listens; this file only builds the server)
//
// Fastify routes first; whatever no route matches reaches the not-found handler, which gives the raw Node request and
// response to agent-ui's handler (`reply.hijack()` tells Fastify that the response is handled elsewhere). The handler
// answers only the pages and calls next() for everything else: here, Fastify-style 404 text. The built assets are served by
// the host, with @fastify/static.
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSsrHandler } from '@ehtb/agent-ui/server/ssr-handler.mjs';
import { loadConfig } from '@ehtb/agent-ui/build/config.mjs';
import { createStore, validateEntry } from './store.js';

const root = dirname(fileURLToPath(import.meta.url));

export const createServer = async ({ outDir = 'dist', store = createStore() } = {}) => {
  const config = await loadConfig({ root, file: 'build.config.mjs' });
  const server = Fastify();
  // The built assets are the host's to serve (only the assets folder: the pages are rendered, not served as files); whatever is
  // not an asset reaches the not-found handler below.
  await server.register(fastifyStatic, { root: resolve(root, outDir, 'assets'), prefix: '/assets/' });

  // The host's routes and API (Fastify parses JSON bodies by itself).
  server.get('/api/entries', async () => store.list());
  server.post('/api/entries', async (request, reply) => {
    const errors = validateEntry(request.body ?? {});
    if (Object.keys(errors).length) return reply.code(422).send({ message: Object.values(errors)[0], errors });
    return reply.code(201).send(store.add(request.body));
  });

  // The page. While rendering on the server the app asks for /api/entries; answer from the same store, in process.
  const fetchFunction = async (url) =>
    url === '/api/entries'
      ? { ok: true, status: 200, json: async () => store.list() }
      : { ok: false, status: 404, json: async () => null };
  const handler = await createSsrHandler({ config: { ...config, fetchFunction }, root, outDir });

  server.setNotFoundHandler((request, reply) => {
    reply.hijack();
    const notFound = () => reply.raw.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
    handler(request.raw, reply.raw, notFound).catch((error) => reply.raw.writeHead(500, { 'content-type': 'text/plain' }).end(error.message));
  });
  return server;
};
