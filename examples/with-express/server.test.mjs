// The Express server end to end: build the site, start the server, and talk to it over HTTP.
// Needs Express: run `npm install` in this example first (the test is skipped until then).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '@ehtb/agent-ui/build/build.mjs';
import { createStore } from './store.js';

const express = await import('express').catch(() => null);
const projectRoot = dirname(fileURLToPath(import.meta.url));
const outDir = '.output-test';
let listener;
let origin;
let store;

before(async () => {
  if (!express) return;
  const { createServer } = await import('./server.js');
  const config = await (await import('@ehtb/agent-ui/build/config.mjs')).loadConfig({ root: projectRoot });
  build({ ...config, projectRoot, outDir });
  store = createStore();
  const server = await createServer({ outDir, store });
  listener = await new Promise((resolve) => {
    const started = server.listen(0, () => resolve(started));
  });
  origin = `http://localhost:${listener.address().port}`;
});

after(() => {
  listener?.closeAllConnections?.();
  listener?.close();
  rmSync(join(projectRoot, outDir), { recursive: true, force: true });
});

const skip = !express && 'run `npm install` in this example first';

test('the host answers its own API', { skip }, async () => {
  assert.deepEqual(await (await fetch(`${origin}/api/entries`)).json(), store.list());
  const refused = await fetch(`${origin}/api/entries`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'A', message: '' }) });
  assert.equal(refused.status, 422);
});

test('the guestbook page arrives rendered with the host data, and its assets are served', { skip }, async () => {
  const response = await fetch(`${origin}/`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<!--ssr:start-->/);
  assert.match(html, /Ada/);
  assert.match(html, /1 entry/);
  const script = html.match(/src="(\/assets\/[^"]+\.js)"/)[1];
  assert.equal((await fetch(origin + script)).status, 200);
});

test('an entry posted to the API shows up in the next server-rendered page', { skip }, async () => {
  const created = await fetch(`${origin}/api/entries`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Grace', message: 'Hello from a test' }) });
  assert.equal(created.status, 201);
  assert.match(await (await fetch(`${origin}/`)).text(), /Hello from a test/);
});

test('every page has its own URL, title and status', { skip }, async () => {
  const sign = await fetch(`${origin}/sign`);
  assert.equal(sign.status, 200);
  const signHtml = await sign.text();
  assert.match(signHtml, /<title>Sign - Guestbook<\/title>/);
  assert.match(signHtml, /id="entry-form"/);
  const about = await (await fetch(`${origin}/about`)).text();
  assert.match(about, /<title>About - Guestbook<\/title>/);
  const entry = await fetch(`${origin}/entry/1`);
  assert.equal(entry.status, 200);
  const entryHtml = await entry.text();
  assert.match(entryHtml, /<title>Ada - Guestbook<\/title>/);
  assert.match(entryHtml, /First!/);
  const missing = await fetch(`${origin}/entry/999`);
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /Entry not found/);
});

test('anything else goes to the host: its own 404', { skip }, async () => {
  const response = await fetch(`${origin}/nothing/here`);
  assert.equal(response.status, 404);
  assert.equal(await response.text(), 'Not found');
});
