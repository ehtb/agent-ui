// The production build and server: what `npm run build` writes and what server.mjs sends. It builds the site once into
// .output-test/ (no API, database or network) and talks to the server over HTTP.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, '.output-test');
let server;
let base;

before(async () => {
  execFileSync(join(root, 'node_modules/.bin/agent-ui'), ['build', `--out=${out}`], { cwd: root, stdio: 'pipe' });
  const { createAppServer } = await import('./server.mjs');
  server = await createAppServer({ root, outDir: '.output-test', log: { error: () => {} } });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    server.closeAllConnections?.();
    await new Promise((done) => server.close(done));
  }
  rmSync(out, { recursive: true, force: true });
});

const assets = () => readdirSync(join(out, 'assets'));
const get = (path, headers = {}) => fetch(`${base}${path}`, { headers });

test('the build is production: hashed names, no source maps, no validator chunk', () => {
  const scripts = assets().filter((name) => name.endsWith('.js'));
  assert.ok(scripts.length > 0);
  for (const name of scripts) assert.match(name, /\.[0-9a-f]{8}\.js$/);
  assert.deepEqual(assets().filter((name) => name.endsWith('.map')), [], 'source maps are off');
  const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
  assert.equal(manifest.chunks.validator, undefined, 'the validator is left out of a production build');
  assert.ok(manifest.chunks['agent-ui'], 'the runtime is its own chunk');
});

test('/healthz answers without rendering', async () => {
  const response = await get('/healthz');
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'ok');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('a page is rendered for its URL, plain, with the security and cache headers', async () => {
  const response = await get('/', { 'accept-encoding': 'br, gzip' });
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.equal(response.headers.get('content-encoding'), null, "compression is the CDN's");
  assert.equal(Number(response.headers.get('content-length')), Buffer.byteLength(body));
  assert.match(body, /<!--ssr:start-->/);
  assert.match(body, /<title>Production server<\/title>/);
  assert.match(body, /Server-rendered: waiting for JavaScript\./);
  assert.match(body, /0<!--\|--> of <!--\|-->6<!--\|--> checks done/);
  assert.match(body, /Render every page for its own URL/);
  const csp = response.headers.get('content-security-policy');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self';/);
  assert.match(csp, /style-src 'self' 'unsafe-inline'/);
  assert.match(csp, /connect-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('strict-transport-security'), /max-age=\d+/);
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  // The CDN caches the page; a browser asks again every time.
  assert.equal(response.headers.get('cache-control'), 'public, max-age=0, s-maxage=60');
});

test('a hashed asset is sent plain, cached for good, and revalidated by its ETag', async () => {
  const name = assets().find((file) => file.startsWith('agent-ui.') && file.endsWith('.js'));
  const response = await get(`/assets/${name}`, { 'accept-encoding': 'br, gzip' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-encoding'), null);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), readFileSync(join(out, 'assets', name)));
  const etag = response.headers.get('etag');
  assert.match(etag, /^"[A-Za-z0-9_-]{22}"$/);
  // `includes` matches the weak form a compressing CDN adds.
  const unchanged = await get(`/assets/${name}`, { 'if-none-match': `W/${etag}` });
  assert.equal(unchanged.status, 304);
  assert.equal(unchanged.headers.get('etag'), etag);
  assert.equal((await unchanged.arrayBuffer()).byteLength, 0);
});

test('a file that keeps its name is served with an ETag and a short cache', async () => {
  const response = await get('/robots.txt');
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'User-agent: *\nDisallow: /private\n');
  assert.equal(response.headers.get('cache-control'), 'public, max-age=3600');
  const etag = response.headers.get('etag');
  assert.match(etag, /^"[A-Za-z0-9_-]{22}"$/);
  const unchanged = await get('/robots.txt', { 'if-none-match': `W/${etag}` });
  assert.equal(unchanged.status, 304);
  assert.equal(unchanged.headers.get('etag'), etag);
  const stale = await get('/robots.txt', { 'if-none-match': '"other"' });
  assert.equal(stale.status, 200);
});

test('the manifest and the page shells are not served: the renderer owns them', async () => {
  assert.equal((await get('/manifest.json')).status, 404);
  assert.equal((await get('/index.html')).status, 404);
  assert.equal((await get('/')).status, 200);
});

test('HEAD answers the headers of a page without a body', async () => {
  const response = await fetch(`${base}/`, { method: 'HEAD' });
  assert.equal(response.status, 200);
  assert.ok(Number(response.headers.get('content-length')) > 0);
  assert.equal((await response.arrayBuffer()).byteLength, 0);
});

test('unknown paths and writes are refused', async () => {
  const missing = await get('/no-such-page');
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('cache-control'), 'no-store');
  const write = await fetch(`${base}/`, { method: 'POST' });
  assert.equal(write.status, 405);
  assert.equal(write.headers.get('allow'), 'GET, HEAD');
});

test('a connection is not held open by a slow request, and an idle one outlives the proxy', () => {
  assert.equal(server.requestTimeout, 10_000);
  assert.equal(server.headersTimeout, 10_000);
  assert.ok(server.keepAliveTimeout > 60_000);
});
