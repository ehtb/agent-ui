// Where this example's pages get their data while they are rendered on the server (`agent-ui check`, `agent-ui
// serve`): requests to /api/ are answered in process by api.js (the same instance that serves the HTTP endpoints, so both
// see the same data); every other request reads public/, the same bytes the browser fetches from the static host. The
// framework has no default source of data; build.config.mjs names this function as `fetchFunction`.
import { readFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDirectory = resolve(dirname(fileURLToPath(import.meta.url)), 'public');

const readPublicFile = async (url) => {
  try {
    const file = resolve(publicDirectory, `.${decodeURIComponent(new URL(url, 'http://localhost').pathname)}`);
    if (!file.startsWith(publicDirectory + sep)) return new Response(null, { status: 404 });
    return new Response(await readFile(file, 'utf8'), { headers: { 'content-type': 'application/json' } });
  } catch {
    return new Response(null, { status: 404 });
  }
};

export const fetchFunction = async (url, init = {}) => {
  const { pathname } = new URL(url, 'http://localhost');
  if (!pathname.startsWith('/api/')) return readPublicFile(url);
  let body = {};
  try {
    if (init.body) body = JSON.parse(init.body);
  } catch {
    return Response.json({ message: 'the request body is not JSON' }, { status: 400 });
  }
  const { createApi } = await import('./api.js'); // loaded when first needed: build.config.mjs is read by commands that never render
  const answer = createApi().handle({ method: init.method ?? 'GET', pathname, body });
  return answer ? Response.json(answer.body, { status: answer.status }) : readPublicFile(url);
};
