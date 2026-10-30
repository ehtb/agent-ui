// What a browser bundle of a page contains. The server-only half of pages (static URL list, HTTP status) is never in it; the
// development checks of pages are in a development build and not in a production one.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../build/build.mjs';
import { loadConfig } from '../build/config.mjs';

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/pages-site');
const outputs = [];

const bundleText = async (dev) => {
  const outDir = `.output-pages-${dev ? 'dev' : 'prod'}`;
  outputs.push(join(siteRoot, outDir));
  const config = await loadConfig({ root: siteRoot, mode: { dev } });
  build({ ...config, projectRoot: siteRoot, outDir });
  const assets = join(siteRoot, outDir, 'assets');
  return readdirSync(assets).filter((file) => file.endsWith('.js')).map((file) => readFileSync(join(assets, file), 'utf8')).join('\n');
};

after(() => outputs.forEach((directory) => rmSync(directory, { recursive: true, force: true })));

const CHECK_MESSAGE = 'a page must be a plain object';
const SERVER_ONLY_MESSAGE = 'not an HTTP status';

test('a production bundle has neither the page checks nor the server-only part of pages', async () => {
  const text = await bundleText(false);
  assert.ok(!text.includes(CHECK_MESSAGE), 'page checks are in the production bundle');
  assert.ok(!text.includes(SERVER_ONLY_MESSAGE), 'the server-only half is in the production bundle');
});

test('a development bundle keeps the page checks and still leaves out the server-only part', async () => {
  const text = await bundleText(true);
  assert.ok(text.includes(CHECK_MESSAGE), 'page checks are missing from the development bundle');
  assert.ok(!text.includes(SERVER_ONLY_MESSAGE), 'the server-only half is in the development bundle');
});
