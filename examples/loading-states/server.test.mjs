// End to end over real HTTP: the real build, per-request rendering with the status each page declares, and the static files
// generated at build time.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '@ehtb/agent-ui/build/build.mjs';
import { createSsrServer } from '@ehtb/agent-ui/cli/ssr-server.mjs';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const outDir = '.output-test';
let server;
let origin;

before(async () => {
  const config = await (await import('@ehtb/agent-ui/build/config.mjs')).loadConfig({ root: projectRoot });
  build({ ...config, projectRoot, outDir });
  server = await createSsrServer({ config, outDir, root: projectRoot });
  await new Promise((resolve) => server.listen(0, resolve));
  origin = `http://localhost:${server.address().port}`;
});

after(() => {
  server?.closeAllConnections?.();
  server?.close();
  rmSync(join(projectRoot, outDir), { recursive: true, force: true });
});

const get = async (path) => {
  const response = await fetch(origin + path);
  return { status: response.status, html: await response.text() };
};

test('the server waits for ready: the products page arrives finished, never as its skeleton', async () => {
  const { status, html } = await get('/products');
  assert.equal(status, 200);
  assert.match(html, /Field notebook/);
  assert.doesNotMatch(html, /products-skeleton/);
  assert.match(html, /data-id="page-state"[^>]*>This page is <!---->ready<!---->\./);
  assert.match(html, /<title>Products - Loading states<\/title>/);
});

test('each page answers the status it declares', async () => {
  assert.equal((await get('/instant')).status, 200);
  assert.equal((await get('/products/2')).status, 200);
  const missing = await get('/products/99');
  assert.equal(missing.status, 404);
  assert.match(missing.html, /Product not found/);
  const unavailable = await get('/unavailable');
  assert.equal(unavailable.status, 503);
  assert.match(unavailable.html, /The service did not answer/);
});

