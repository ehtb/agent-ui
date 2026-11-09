// Things that must never happen in the servers and the build: reading outside the served directory, a request that
// crashes or hangs the server, text corrupted while it is put into a page, a build that deletes the project.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createStaticServer } from '../cli/static-handler.mjs';
import { createSsrHandler } from '../server/ssr-handler.mjs';
import { createSsrServer } from '../cli/ssr-server.mjs';
import { resolveInside, readPathname, BadRequestError } from '../cli/safe-path.mjs';
import { injectMarkup } from '../server/document.mjs';
import { injectHead } from '../server/document.mjs';
import { assertSafeOutputDirectory } from '../build/build.mjs';
import { writeSite } from '../build/write-site.mjs';
import { buildModuleGraph } from '../build/module-graph.mjs';
import { assignChunks } from '../build/assign-chunks.mjs';
import { generateChunks } from '../build/generate-chunks.mjs';
import { createServer } from 'node:http';

const sandbox = mkdtempSync(join(tmpdir(), 'agent-ui-safety-'));
const dist = join(sandbox, 'dist');
const distSecret = join(sandbox, 'dist-secret');
let staticServer;
let staticPort;

before(async () => {
  mkdirSync(dist, { recursive: true });
  mkdirSync(distSecret, { recursive: true });
  writeFileSync(join(dist, 'index.html'), '<html><body>public</body></html>');
  writeFileSync(join(dist, 'data.json'), '{"ok":true}');
  writeFileSync(join(distSecret, 'key.txt'), 'SECRET');
  writeFileSync(join(sandbox, 'outside.txt'), 'OUTSIDE');
  staticServer = createStaticServer(dist, { onError: () => {} });
  await new Promise((done) => staticServer.listen(0, done));
  staticPort = staticServer.address().port;
});

after(() => {
  staticServer?.closeAllConnections?.();
  staticServer?.close();
  rmSync(sandbox, { recursive: true, force: true });
});

// Sends the path exactly as written: fetch() would tidy "/../" away before it reached the server.
const raw = (port, path, { method = 'GET', headers = {}, body } = {}) =>
  new Promise((done, fail) => {
    // DELETE sent without a content length would put its body on the wire as a second, broken request.
    const sized = body === undefined ? headers : { ...headers, 'content-length': Buffer.byteLength(body) };
    const outgoing = request({ port, path, method, headers: sized }, (response) => {
      let text = '';
      response.on('data', (chunk) => (text += chunk));
      response.on('end', () => done({ status: response.statusCode, text, headers: response.headers }));
    });
    outgoing.on('error', fail);
    outgoing.end(body);
  });

test('resolveInside admits the directory and what is below it, and nothing else', () => {
  const root = '/srv/site/dist';
  assert.equal(resolveInside(root, '/'), resolve(root));
  assert.equal(resolveInside(root, '/a/b.js'), resolve(root, 'a/b.js'));
  assert.equal(resolveInside(root, 'a/b.js'), resolve(root, 'a/b.js'));
  assert.equal(resolveInside(root, '/..hidden/x'), resolve(root, '..hidden/x')); // a name that merely starts with dots
  for (const bad of ['/../dist-secret/key', '/../../etc/passwd', '/a/../../x', '/..', '/a/../..', '/..\\x'.replace('\\', '/'), '/a\0b']) {
    assert.equal(resolveInside(root, bad), null, JSON.stringify(bad));
  }
  assert.equal(resolveInside(root, '/a/../b'), resolve(root, 'b')); // going up and back down inside is fine
  assert.equal(resolveInside(root, undefined), null);
});

test('a sibling directory whose name starts with the served one cannot be read (dist vs dist-secret)', async () => {
  assert.equal((await raw(staticPort, '/')).status, 200);
  assert.equal((await raw(staticPort, '/data.json')).text, '{"ok":true}');
  for (const path of ['/..%2Fdist-secret%2Fkey.txt', '/%2e%2e/dist-secret/key.txt', '/../dist-secret/key.txt', '/..%2Foutside.txt', '/a/..%2F..%2Foutside.txt']) {
    const answer = await raw(staticPort, path);
    assert.notEqual(answer.status, 200, path);
    assert.doesNotMatch(answer.text, /SECRET|OUTSIDE/, path);
  }
});

test('readPathname refuses malformed percent-encoding with a BadRequestError', () => {
  assert.equal(readPathname('/a%20b?x=1'), '/a b');
  assert.throws(() => readPathname('/%E0%A4%A'), BadRequestError);
  assert.throws(() => readPathname('/%'), /malformed percent-encoding/);
});

test('a malformed URL answers 400 and an unknown route 404; the server keeps serving', async () => {
  assert.equal((await raw(staticPort, '/%E0%A4%A')).status, 400);
  assert.equal((await raw(staticPort, '/some/route')).status, 404);
  assert.equal((await raw(staticPort, '/data.json')).status, 200); // still alive
});

// ---- text put into pages -------------------------------------------------------------------------------------------

test('rendered text with "$&", "$\'" or "$`" reaches the page unchanged', () => {
  const template = '<html><head><title>x</title></head><body><div id="app"></div><script type="module" src="/a.js"></script></body></html>';
  const nasty = "Price: $& then $' and $` and $1 and $$";
  const page = injectMarkup(template, { html: `<p>${nasty}</p>`, stateScript: '<script type="application/json" id="agent-ui-state">{}</script>' });
  assert.ok(page.includes(`<p>${nasty}</p>`));
  assert.ok(page.includes('<script type="module" src="/a.js"></script>'));
  const head = injectHead(template, { title: nasty, description: nasty });
  const escaped = nasty.replace(/&/g, '&amp;'); // "&" is escaped on purpose; what must not happen is "$&" being read as "the match"
  assert.ok(head.includes(`<title>${escaped}</title>`));
  assert.ok(head.includes(`content="${escaped}"`));
  assert.equal(head.split('</head>').length, 2);
});

// ---- the render server ---------------------------------------------------------------------------------------------

test('PUT, PATCH and DELETE endpoints receive their JSON body; a broken body is a 400, a failing endpoint a 500', async () => {
  const project = join(sandbox, 'project');
  mkdirSync(join(project, 'dist'), { recursive: true });
  writeFileSync(
    join(project, 'api.mjs'),
    `export const createApi = () => ({
       handle: ({ method, pathname, body }) => {
         if (pathname === '/api/boom') throw new Error('endpoint failed');
         return pathname.startsWith('/api/') ? { status: 200, body: { method, body } } : null;
       },
     });`,
  );
  const reportedErrors = [];
  const reportedContexts = [];
  const handler = await createSsrHandler({ config: { api: 'api.mjs', pages: [], outDir: 'dist' }, root: project, onError: (error, context) => { reportedErrors.push(error.message); reportedContexts.push(context); } });
  const server = createServer((incoming, outgoing) => handler(incoming, outgoing));
  await new Promise((done) => server.listen(0, done));
  const port = server.address().port;
  try {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const answer = await raw(port, '/api/thing', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 7 }) });
      assert.equal(answer.status, 200, `${method}: ${answer.text}`);
      assert.deepEqual(JSON.parse(answer.text), { method, body: { id: 7 } }, method);
    }
    assert.equal((await raw(port, '/api/thing')).status, 200); // GET carries no body
    assert.equal((await raw(port, '/api/thing', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{broken' })).status, 400);
    const boom = await raw(port, '/api/boom', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(boom.status, 500);
    assert.deepEqual(JSON.parse(boom.text), { message: 'internal server error' }, 'what the endpoint threw stays on the server');
    assert.equal(boom.headers['x-content-type-options'], 'nosniff');
    assert.deepEqual(reportedErrors, ['endpoint failed']);
    assert.equal(reportedContexts[0].method, 'POST');
    assert.equal(reportedContexts[0].pathname, '/api/boom');
    assert.ok(reportedContexts[0].signal instanceof AbortSignal, 'the hook gets the request context, including the disconnect signal');
    assert.equal((await raw(port, '/%E0%A4%A')).status, 400);
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});

test('a request body is read only as JSON or a form: 415 for another type or none, 400 for broken JSON', async () => {
  const project = join(sandbox, 'content-types');
  mkdirSync(join(project, 'dist'), { recursive: true });
  writeFileSync(
    join(project, 'api.mjs'),
    `export const createApi = () => ({
       handle: ({ pathname, body }) => (pathname.startsWith('/api/') ? { status: 200, body: { body } } : null),
     });`,
  );
  const handler = await createSsrHandler({ config: { api: 'api.mjs', pages: [], outDir: 'dist' }, root: project });
  const server = createServer((incoming, outgoing) => handler(incoming, outgoing));
  await new Promise((done) => server.listen(0, done));
  try {
    const port = server.address().port;
    const missing = await raw(port, '/api/echo', { method: 'POST', body: '{"a":1}' });
    assert.equal(missing.status, 415);
    assert.match(missing.text, /the request has no content-type\. Send application\/json or application\/x-www-form-urlencoded/);
    const text = await raw(port, '/api/echo', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{"a":1}' });
    assert.equal(text.status, 415);
    assert.match(JSON.parse(text.text).message, /content-type "text\/plain" is not supported/);
    const multipart = await raw(port, '/api/echo', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=x' }, body: '--x--' });
    assert.equal(multipart.status, 415);
    assert.match(multipart.text, /multipart\/form-data is not supported by createSsrHandler\. Parse the upload in the host server/);
    const json = await raw(port, '/api/echo', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: '{"a":1}' });
    assert.equal(json.status, 200, json.text);
    assert.deepEqual(JSON.parse(json.text), { body: { a: 1 } });
    const broken = await raw(port, '/api/echo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{broken' });
    assert.equal(broken.status, 400);
    const form = await raw(port, '/api/echo', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'a=1&b=two' });
    assert.equal(form.status, 200, form.text);
    assert.deepEqual(JSON.parse(form.text), { body: { a: '1', b: 'two' } });
    const jsonSubtype = await raw(port, '/api/echo', { method: 'POST', headers: { 'content-type': 'application/ld+json' }, body: '{"a":1}' });
    assert.equal(jsonSubtype.status, 200, 'a +json media type is JSON');
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});

test('a raw API answer sends its own content type and bytes, and refuses to guess either', async () => {
  const project = join(sandbox, 'raw-api');
  mkdirSync(join(project, 'dist'), { recursive: true });
  writeFileSync(
    join(project, 'api.mjs'),
    `export const createApi = () => ({
       handle: ({ pathname }) => {
         if (pathname === '/api/csv') return { status: 200, raw: true, body: 'name,count\\nAda,2\\n', headers: { 'content-type': 'text/csv; charset=utf-8' } };
         if (pathname === '/api/bytes') return { status: 200, raw: true, body: new Uint8Array([65, 0, 66]), headers: { 'content-type': 'application/octet-stream' } };
         if (pathname === '/api/bytes-body') return { status: 200, raw: true, body: new Uint8Array([65]), headers: { 'content-type': 'application/octet-stream' } };
         if (pathname === '/api/empty') return { status: 204, raw: true, body: '' };
         if (pathname === '/api/no-type') return { status: 200, raw: true, body: 'x' };
         if (pathname === '/api/bad-body') return { status: 200, raw: true, body: { a: 1 }, headers: { 'content-type': 'application/json' } };
         if (pathname === '/api/bad-raw') return { status: 200, raw: 'yes', body: 'x' };
         if (pathname === '/api/extra') return { status: 200, raw: true, body: 'x', headers: { 'content-type': 'text/plain' }, extra: true };
         return null;
       },
     });`,
  );
  const reported = [];
  let binaryBody = '';
  const handler = await createSsrHandler({
    config: { api: 'api.mjs', pages: [], outDir: 'dist' },
    root: project,
    onError: (error) => reported.push(error.message),
    transformResponse: (request, response) => {
      if (request.pathname === '/api/bytes-body' && response.headers['content-type'] === 'application/octet-stream') {
        binaryBody = response.body;
        return { body: 'changed' };
      }
      return { headers: { 'x-transform': 'seen' } };
    },
  });
  const server = createServer((incoming, outgoing) => handler(incoming, outgoing));
  await new Promise((done) => server.listen(0, done));
  try {
    const port = server.address().port;
    const csv = await raw(port, '/api/csv');
    assert.equal(csv.status, 200);
    assert.equal(csv.headers['content-type'], 'text/csv; charset=utf-8');
    assert.equal(csv.headers['x-transform'], 'seen', 'a text raw answer still gets the site-wide transform headers');
    assert.equal(csv.text, 'name,count\nAda,2\n');
    const bytes = await raw(port, '/api/bytes');
    assert.equal(bytes.status, 200);
    assert.equal(bytes.headers['content-type'], 'application/octet-stream');
    assert.equal(bytes.headers['x-transform'], 'seen', 'a binary raw answer still gets the site-wide transform headers');
    assert.deepEqual([...bytes.text].map((character) => character.charCodeAt(0)), [65, 0, 66]);
    assert.equal((await raw(port, '/api/bytes-body')).status, 500);
    assert.equal(binaryBody, '', 'a binary raw body reaches the hook as no text');
    assert.match(reported.at(-1), /returned a body for a binary raw answer\. A binary raw answer is sent unchanged: return headers only/);
    const empty = await raw(port, '/api/empty');
    assert.equal(empty.status, 204);
    assert.equal(empty.text, '');
    assert.equal((await raw(port, '/api/no-type')).status, 500);
    assert.match(reported.at(-1), /answered raw: true without a "content-type" header\. Set headers: \{ "content-type": "text\/csv; charset=utf-8" \}/);
    assert.equal((await raw(port, '/api/bad-body')).status, 500);
    assert.match(reported.at(-1), /answered raw: true with a body of type object\. Return a string \(CSV, XML, plain text\) or a Uint8Array \(bytes\)/);
    assert.equal((await raw(port, '/api/bad-raw')).status, 500);
    assert.match(reported.at(-1), /answered raw: "yes", not true or false\. Write raw: true/);
    assert.equal((await raw(port, '/api/extra')).status, 500);
    assert.match(reported.at(-1), /answered the unknown key "extra"/);
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});

test('stateForBrowser keeps a server-only key out of the document and gives the hook the request', async () => {
  const project = join(sandbox, 'state-for-browser');
  mkdirSync(join(project, 'dist'), { recursive: true });
  const uiModule = pathToFileURL(resolve(import.meta.dirname, '../src/ui.js')).href;
  writeFileSync(
    join(project, 'app.mjs'),
    `import { app } from ${JSON.stringify(uiModule)};
     export const create = (environment) => app({ dev: false, namespaces: { account: { state: { name: '', token: '' } } }, spec: { tag: 'p', id: 'account', children: { state: 'account.name' } }, root: environment.root, initialState: environment.initialState });`,
  );
  writeFileSync(join(project, 'dist/account.html'), '<html><head><title>x</title></head><body><div id="app"></div><script type="module" src="/a.js"></script></body></html>');
  let seen = null;
  const config = {
    pages: [{ name: 'account', path: '/account', app: 'app.mjs', file: 'pages/account/page.js' }],
    outDir: 'dist',
    stateForBrowser: (state, request) => {
      seen = request.pathname;
      return { account: { name: state.account.name } };
    },
  };
  const handler = await createSsrHandler({ config, root: project, initialStateFor: () => ({ account: { name: 'Ada', token: 'server-secret' } }) });
  const server = createServer((incoming, outgoing) => handler(incoming, outgoing));
  await new Promise((done) => server.listen(0, done));
  try {
    const answer = await raw(server.address().port, '/account');
    assert.equal(answer.status, 200, answer.text);
    assert.match(answer.text, /<p data-id="account">Ada<\/p>/, 'the markup keeps what the page rendered');
    assert.match(answer.text, /"account":\{"name":"Ada"\}/);
    assert.doesNotMatch(answer.text, /server-secret/, 'the token stays on the server');
    assert.equal(seen, '/account', 'the hook sees the request it renders for');
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});

test('the render handler alone serves no files, answers 404 without a next and 400 for a malformed URL, and refuses a missing template at startup', async () => {
  const project = join(sandbox, 'render-only');
  mkdirSync(join(project, 'dist'), { recursive: true });
  writeFileSync(join(project, 'app.mjs'), 'export const create = () => { throw new Error("never rendered"); };');
  const config = { pages: [{ name: 'site', path: '/site', app: 'app.mjs', file: 'pages/site/page.js' }], outDir: 'dist' };
  await assert.rejects(createSsrHandler({ config, root: project }), /site\.html does not exist\. Build the site first: agent-ui build/);
  writeFileSync(join(project, 'dist/site.html'), '<html><head><title>x</title></head><body><div id="app"></div><script type="module" src="/a.js"></script></body></html>');
  const handler = await createSsrHandler({ config, root: project });
  const server = createServer((incoming, outgoing) => handler(incoming, outgoing));
  await new Promise((done) => server.listen(0, done));
  try {
    const port = server.address().port;
    assert.equal((await raw(port, '/a.js')).status, 404);
    assert.equal((await raw(port, '/other')).text, 'not found');
    const malformed = await raw(port, '/%E0%A4%A');
    assert.equal(malformed.status, 400);
    assert.equal(malformed.headers['x-content-type-options'], 'nosniff');
    assert.equal((await raw(port, '/other')).headers['x-content-type-options'], 'nosniff');
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});

test('a request body that closes before its end is answered 400, not awaited forever', async () => {
  const project = join(sandbox, 'closed-body');
  mkdirSync(join(project, 'dist'), { recursive: true });
  writeFileSync(join(project, 'api.mjs'), 'export const createApi = () => ({ handle: () => ({ status: 200, body: {} }) });');
  const handler = await createSsrHandler({ config: { api: 'api.mjs', pages: [], outDir: 'dist' }, root: project });
  // A request that ends before its Content-Length: the handler must settle on "close" and answer, not hold the promise.
  const incoming = new EventEmitter();
  Object.assign(incoming, { url: '/api/x', method: 'POST', headers: { 'content-type': 'application/json' } });
  const outgoing = {
    headersSent: false,
    status: 0,
    text: '',
    writeHead(status) { this.status = status; this.headersSent = true; return this; },
    end(text) { this.text = text; },
  };
  const answered = handler(incoming, outgoing);
  await Promise.resolve(); // the body listeners are registered before the first await returns
  incoming.emit('data', Buffer.from('{"a":1'));
  incoming.emit('close');
  await answered;
  assert.equal(outgoing.status, 400);
  assert.match(outgoing.text, /request body ended before it was complete/);
});

test('the render handler reads every page template at startup; a later build needs a restart and is not picked up silently', async () => {
  const project = join(sandbox, 'template-cache');
  mkdirSync(join(project, 'dist'), { recursive: true });
  const uiModule = pathToFileURL(resolve(import.meta.dirname, '../src/ui.js')).href;
  writeFileSync(
    join(project, 'app.mjs'),
    `import { app } from ${JSON.stringify(uiModule)};
     export const create = (environment) => app({ dev: true, namespaces: {}, spec: { tag: 'p', id: 'note', children: 'ok' }, root: environment.root });`,
  );
  const template = '<html><head><title>x</title></head><body><div id="app"></div><script type="module" src="/a.js"></script></body></html>';
  writeFileSync(join(project, 'dist/site.html'), template);
  const config = { pages: [{ name: 'site', path: '/site', app: 'app.mjs', file: 'pages/site/page.js' }], outDir: 'dist' };
  const handler = await createSsrHandler({ config, root: project });
  const server = createServer((incoming, outgoing) => handler(incoming, outgoing));
  await new Promise((done) => server.listen(0, done));
  try {
    const port = server.address().port;
    const first = await raw(port, '/site');
    assert.equal(first.status, 200, first.text);
    assert.match(first.text, /<p data-id="note">ok<\/p>/);
    // The build is the one the handler started with: deleting or replacing a template while it serves changes nothing.
    rmSync(join(project, 'dist/site.html'));
    const second = await raw(port, '/site');
    assert.equal(second.status, 200, second.text);
    assert.match(second.text, /<p data-id="note">ok<\/p>/);
    // A new process for a new build starts from the files that are there then; a missing one fails at startup, not on a visit.
    await assert.rejects(createSsrHandler({ config, root: project }), /site\.html does not exist\. Build the site first: agent-ui build/);
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});

test('the render handler waits for an async api, finds the page of a form outcome with a query, and treats //path as a path of this site', async () => {
  const project = join(sandbox, 'async-api');
  mkdirSync(join(project, 'dist'), { recursive: true });
  const uiModule = pathToFileURL(resolve(import.meta.dirname, '../src/ui.js')).href;
  writeFileSync(
    join(project, 'app.mjs'),
    `import { app } from ${JSON.stringify(uiModule)};
     export const create = (environment) => app({ dev: true, namespaces: {}, spec: { tag: 'p', id: 'note', children: 'ok' }, root: environment.root });`,
  );
  writeFileSync(
    join(project, 'api.mjs'),
    `export const createApi = () => ({
       handle: async ({ pathname }) => (pathname === '/api/later' ? { status: 201, body: { later: true } } : null),
       handleForm: async ({ pathname }) => (pathname === '/send' ? { status: 200, url: '/contact?sent=1', initialState: {} } : null),
     });`,
  );
  const template = '<html><head><title>x</title></head><body><div id="app"></div><script type="module" src="/a.js"></script></body></html>';
  for (const name of ['contact', 'about', 'user']) writeFileSync(join(project, `dist/${name}.html`), template);
  const config = { api: 'api.mjs', pages: [{ name: 'contact', path: '/contact', app: 'app.mjs', file: 'pages/contact/page.js' }, { name: 'about', path: '/about', app: 'app.mjs', file: 'pages/about/page.js' }, { name: 'user', path: '/user/:handle', app: 'app.mjs', file: 'pages/user/page.js' }], outDir: 'dist' };
  const handler = await createSsrHandler({ config, root: project });
  const server = createServer((incoming, outgoing) => handler(incoming, outgoing));
  await new Promise((done) => server.listen(0, done));
  try {
    const port = server.address().port;
    const later = await raw(port, '/api/later');
    assert.equal(later.status, 201, later.text);
    assert.deepEqual(JSON.parse(later.text), { later: true });
    const sent = await raw(port, '/send', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'a=1' });
    assert.equal(sent.status, 200, sent.text);
    assert.match(sent.text, /<p data-id="note">ok<\/p>/);
    const head = await raw(port, '/contact', { method: 'HEAD' });
    assert.equal(head.status, 200, 'HEAD answers a page like GET');
    assert.equal(head.text, '', 'and sends no body');
    assert.equal((await raw(port, '//about')).status, 404, '"//about" is not the page "/about"');
    assert.equal((await raw(port, '/user/jane.doe')).status, 200, 'a dot in the last segment of a parameterized page is not a file');
    assert.equal((await raw(port, '/user/logo.png')).status, 404, 'but a known file extension is');
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});

test('an api answer of the wrong shape is reported to onError with the shape it should have, and an endpoint cannot drop the security headers', async () => {
  const project = join(sandbox, 'bad-shape');
  mkdirSync(join(project, 'dist'), { recursive: true });
  writeFileSync(
    join(project, 'api.mjs'),
    `export const createApi = () => ({
       handle: ({ pathname }) => (pathname === '/api/nostatus' ? { body: 1 } : pathname === '/api/headerstring' ? { status: 200, body: 1, headers: 'no-store' } : pathname === '/api/headers' ? { status: 200, body: 1, headers: { 'x-content-type-options': 'sniff' } } : null),
       handleForm: ({ pathname }) => (pathname === '/send' ? { url: '/contact' } : null),
     });`,
  );
  writeFileSync(join(project, 'app.mjs'), 'export const create = () => { throw new Error("not rendered"); };');
  writeFileSync(join(project, 'dist/contact.html'), '<html><body><div id="app"></div></body></html>');
  const reported = [];
  const config = { api: 'api.mjs', pages: [{ name: 'contact', path: '/contact', app: 'app.mjs', file: 'pages/contact/page.js' }], outDir: 'dist' };
  const handler = await createSsrHandler({ config, root: project, onError: (error) => reported.push(error.message) });
  const server = createServer((incoming, outgoing) => handler(incoming, outgoing));
  await new Promise((done) => server.listen(0, done));
  try {
    const port = server.address().port;
    assert.equal((await raw(port, '/api/nostatus')).status, 500);
    assert.equal((await raw(port, '/send', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'a=1' })).status, 500);
    assert.match(reported[0], /api\.handle: answered \{"body":1\}, which has no integer "status"\. Answer \{ status, body, headers\? \}/);
    assert.match(reported[1], /api\.handleForm: answered \{"url":"\/contact"\}, not \{ status, url, initialState\?, headers\? \} or \{ redirect, headers\? \}\. Answer the HTTP status/);
    assert.equal((await raw(port, '/api/headerstring')).status, 500);
    assert.match(reported[2], /api\.handle: "headers" must be an object/);
    assert.equal((await raw(port, '/api/headers')).headers['x-content-type-options'], 'nosniff');
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});

test('a bad initialStateFor or transformResponse is reported with the shape it must have, and a form outcome names its keys', async () => {
  const project = join(sandbox, 'bad-hooks');
  mkdirSync(join(project, 'dist'), { recursive: true });
  writeFileSync(join(project, 'app.mjs'), 'export const create = () => { throw new Error("not rendered"); };');
  writeFileSync(join(project, 'dist/home.html'), '<html><body><div id="app"></div></body></html>');
  writeFileSync(
    join(project, 'api.mjs'),
    `export const createApi = () => ({ handle: () => null, handleForm: ({ pathname }) =>
       pathname === '/unknown' ? { status: 200, url: '/', state: {} }
       : pathname === '/initial' ? { status: 200, url: '/', initialState: 'event' }
       : pathname === '/both' ? { redirect: '/', status: 303 }
       : pathname === '/three' ? { status: 303, url: '/' }
       : pathname === '/absolute' ? { status: 200, url: 'https://example.com/' }
       : pathname === '/relative' ? { status: 200, url: 'contact' }
       : pathname === '/protocol-relative' ? { status: 200, url: '//example.com/' }
       : pathname === '/backslash' ? { status: 200, url: '/\\\\example.com/' }
       : pathname === '/redirect' ? { redirect: '//example.com/' }
       : null });`,
  );
  const config = { api: 'api.mjs', pages: [{ name: 'home', path: '/', app: 'app.mjs', file: 'pages/page.js' }], outDir: 'dist' };
  const run = async (options, path = '/', method = 'GET') => {
    const reported = [];
    const handler = await createSsrHandler({ config, root: project, onError: (error) => reported.push(error.message), ...options });
    const server = createServer((request, response) => handler(request, response));
    await new Promise((done) => server.listen(0, done));
    try {
      const answer = await raw(server.address().port, path, { method, ...(method === 'POST' && { headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: '' }) });
      return { answer, reported };
    } finally {
      server.closeAllConnections?.();
      server.close();
    }
  };

  const initialState = await run({ initialStateFor: () => 'session' });
  assert.equal(initialState.answer.status, 500);
  assert.match(initialState.reported[0], /createSsrHandler initialStateFor: returned "session", not a state object \{ namespace: \{ key: value \} \}\. Return an object in the shape of ui\.state\(\)/);

  const shape = await run({ transformResponse: () => 'not a result' }, '/missing');
  assert.equal(shape.answer.status, 500);
  assert.match(shape.reported[0], /createSsrHandler transformResponse: returned string, not \{ headers\?, body\? \} or null\. Return \{ headers\?, body\? \} to change the answer/);

  const unknownKey = await run({ transformResponse: () => ({ header: {} }) }, '/missing');
  assert.equal(unknownKey.answer.status, 500);
  assert.match(unknownKey.reported[0], /createSsrHandler transformResponse: returned the unknown key "header"\. Did you mean "headers"\? Allowed keys: headers, body/);

  const copied = await run({ transformResponse: (request, response) => {
    response.headers['x-hidden'] = 'yes';
    response.headers['cache-control'] = 'public';
    return null;
  } }, '/missing');
  assert.equal(copied.answer.status, 404);
  assert.equal(copied.answer.headers['x-hidden'], undefined, 'mutating the headers passed in changes nothing');
  assert.equal(copied.answer.headers['cache-control'], 'no-store', 'the framework cache header is not changed by mutation');

  const failure = await run({ transformResponse: () => ({ headers: { 'x-transform': 'seen' } }) }, '/');
  assert.equal(failure.answer.status, 500);
  assert.equal(failure.answer.headers['x-transform'], 'seen', 'the transform runs for the handler\'s own 500');

  const body = await run({ transformResponse: () => ({ body: 1 }) }, '/missing');
  assert.equal(body.answer.status, 500);
  assert.match(body.reported[0], /createSsrHandler transformResponse: returned a body that is number, not a string/);

  const headers = await run({ transformResponse: () => ({ headers: 'x' }) }, '/missing');
  assert.equal(headers.answer.status, 500);
  assert.match(headers.reported[0], /createSsrHandler transformResponse: headers must be an object of header names and values, not string/);

  const owned = await run({ transformResponse: () => ({ headers: { 'content-type': 'text/html' } }) }, '/missing');
  assert.equal(owned.answer.status, 500);
  assert.match(owned.reported[0], /createSsrHandler transformResponse: the header "content-type" is written by the framework/);

  let transformCalls = 0;
  const thrown = await run({ transformResponse: () => { transformCalls += 1; throw new Error('transform failed'); } }, '/missing');
  assert.equal(thrown.answer.status, 500);
  assert.equal(transformCalls, 1, 'a failing transform is not run again on its own 500');
  assert.match(thrown.reported[0], /transform failed/);

  const unknown = await run({}, '/unknown', 'POST');
  assert.equal(unknown.answer.status, 500);
  assert.match(unknown.reported[0], /api\.handleForm: unknown key "state"\. Did you mean "status"\? Allowed keys: status, url, initialState, headers/);

  const initial = await run({}, '/initial', 'POST');
  assert.equal(initial.answer.status, 500);
  assert.match(initial.reported[0], /api\.handleForm: initialState is string, not an object \{ namespace: \{ key: value \} \}\. Nest the outcome by namespace/);

  const both = await run({}, '/both', 'POST');
  assert.equal(both.answer.status, 500);
  assert.match(both.reported[0], /api\.handleForm: answered both "redirect" and "status"\. Answer one outcome/);

  const three = await run({}, '/three', 'POST');
  assert.equal(three.answer.status, 500);
  assert.match(three.reported[0], /api\.handleForm: answered status 303 with a url\. For a redirect after a form post answer \{ redirect: "\/path", headers\? \}/);

  for (const [path, pattern] of [
    ['/absolute', /url "https:\/\/example\.com\/" is not a path of this site/],
    ['/relative', /url "contact" is not a path of this site/],
    ['/protocol-relative', /url "\/\/example\.com\/" is not a path of this site/],
    ['/backslash', /url "\/\\\\example\.com\/" is not a path of this site/],
    ['/redirect', /redirect "\/\/example\.com\/" is not a path of this site/],
  ]) {
    const outcome = await run({}, path, 'POST');
    assert.equal(outcome.answer.status, 500);
    assert.match(outcome.reported[0], pattern);
  }
});

test('createSsrHandler without a config says what to pass', async () => {
  await assert.rejects(() => createSsrHandler({}), /pass `config`, the build configuration/);
});

// ---- the build deletes its output directory: only a plain build output qualifies ------------------------------------

test('the build refuses an output directory that is the project, outside it, or holds its sources', () => {
  const project = join(sandbox, 'buildroot');
  mkdirSync(join(project, 'pages/home'), { recursive: true });
  mkdirSync(join(project, 'public'), { recursive: true });
  mkdirSync(join(project, 'dist'), { recursive: true });
  mkdirSync(join(project, 'other-project'), { recursive: true });
  writeFileSync(join(project, 'other-project/package.json'), '{}');
  const check = (outDir) => assertSafeOutputDirectory({ projectRoot: project, outDir, entryPaths: ['pages/home'], publicDirectories: ['public'] });
  assert.doesNotThrow(() => check('dist'));
  assert.doesNotThrow(() => check('build/output'));
  for (const outDir of ['.', '', '..', '../elsewhere', project, 'pages', 'pages/home', 'public', 'other-project']) {
    assert.throws(() => check(outDir), /outDir ".*" .*\. The build deletes its output directory first/, JSON.stringify(outDir));
  }
  assert.throws(() => check('.'), /is the project root or outside it/);
  assert.throws(() => check('pages'), /contains "pages\/home", which the build reads/);
  assert.throws(() => check('other-project'), /contains a package\.json or build\.config\.mjs/);
  // The entries of a page project are generated into .agent-ui, so the pages folder is protected by name.
  assert.throws(() => assertSafeOutputDirectory({ projectRoot: project, outDir: 'pages', entryPaths: ['.agent-ui/home'], publicDirectories: [] }), /contains "pages", which the build reads/);
});

test('writeSite itself refuses an unsafe output directory, so importing it directly is as safe as the CLI', () => {
  const project = join(sandbox, 'direct-write');
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, 'package.json'), '{"type":"module"}');
  writeFileSync(join(project, 'main.js'), 'export const one = 1;');
  const graph = buildModuleGraph({ projectRoot: project, entries: [{ name: 'main', path: 'main.js' }] });
  const plan = assignChunks(graph, {});
  const generated = generateChunks({ projectRoot: project, graph, plan, hash: false, minify: false });
  assert.throws(() => writeSite({ projectRoot: project, outDir: '.', assetsDir: 'assets', graph, plan, generated }), /outDir "\." is the project root or outside it/);
  assert.ok(existsSync(join(project, 'main.js')), 'the project files are still there');
});

test('immutable caching follows the configured assets directory, not a hard-coded name', async () => {
  const site = join(sandbox, 'cache-site');
  mkdirSync(join(site, 'static'), { recursive: true });
  mkdirSync(join(site, 'assets'), { recursive: true });
  writeFileSync(join(site, 'static/app.js'), 'export {}');
  writeFileSync(join(site, 'assets/other.js'), 'export {}');
  const server = createStaticServer(site, { assetsDir: 'static' });
  await new Promise((done) => server.listen(0, done));
  try {
    const cacheControl = (path) =>
      new Promise((done, fail) => {
        request({ port: server.address().port, path }, (response) => {
          response.resume();
          done(response.headers['cache-control']);
        }).on('error', fail).end();
      });
    assert.equal(await cacheControl('/static/app.js'), 'public, max-age=31536000, immutable');
    assert.equal(await cacheControl('/assets/other.js'), 'no-cache');
  } finally {
    server.close();
  }
});

test('maxBodyBytes limits the request bodies the API reads, and must be a whole number of bytes', async () => {
  const project = join(sandbox, 'limited');
  mkdirSync(join(project, 'dist'), { recursive: true });
  writeFileSync(join(project, 'api.mjs'), "export const createApi = () => ({ handle: ({ pathname, body }) => (pathname.startsWith('/api/') ? { status: 200, body } : null) });");
  const config = { api: 'api.mjs', pages: [], outDir: 'dist' };
  await assert.rejects(() => createSsrHandler({ config, root: project, maxBodyBytes: 0 }), /createSsrHandler: maxBodyBytes 0 is not allowed\. Pass a whole number of bytes, for example maxBodyBytes: 100000/);
  const handler = await createSsrHandler({ config, root: project, maxBodyBytes: 20, transformResponse: () => ({ headers: { 'x-transform': 'seen' } }) });
  const server = createServer((incoming, outgoing) => handler(incoming, outgoing));
  await new Promise((done) => server.listen(0, done));
  const port = server.address().port;
  try {
    const post = (body) => raw(port, '/api/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    assert.equal((await post('{"a":1}')).status, 200);
    const tooLarge = await post(JSON.stringify({ text: 'x'.repeat(50) }));
    assert.equal(tooLarge.status, 413, 'a declared length over the limit is refused before reading');
    assert.equal(tooLarge.headers['x-transform'], 'seen', 'the transform runs for a body it cannot read');
    assert.match(tooLarge.text, /request body too large \(more than 20 bytes\)\. Raise maxBodyBytes of createSsrHandler/);
    // A chunked body has no declared length: it is counted while it is read, and refused with the same status.
    const streamed = await new Promise((done, failRequest) => {
      const outgoing = request({ port, path: '/api/x', method: 'POST', headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' } }, (response) => {
        let text = '';
        response.on('data', (chunk) => (text += chunk));
        response.on('end', () => done({ status: response.statusCode, text }));
      });
      outgoing.on('error', failRequest);
      outgoing.write('{"text":"');
      outgoing.end(`${'x'.repeat(50)}"}`);
    });
    assert.equal(streamed.status, 413);
    assert.match(streamed.text, /request body too large/);
    const compressed = await raw(port, '/api/x', { method: 'POST', headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' }, body: 'xx' });
    assert.equal(compressed.status, 415);
    assert.match(compressed.text, /content-encoding \\"gzip\\" is not decoded by createSsrHandler\. Decode the body in the host server/);
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});

test('a page whose URL has a dot in its last segment is found by its rewrite, and a known file extension is still a file', async () => {
  const site = join(sandbox, 'dotted');
  mkdirSync(site, { recursive: true });
  writeFileSync(join(site, 'user.html'), '<html><body>user shell</body></html>');
  const server = createStaticServer(site, { rewrites: () => [{ pattern: '/user/:handle', page: 'user.html' }], onError: () => {} });
  await new Promise((done) => server.listen(0, done));
  try {
    const port = server.address().port;
    assert.match((await raw(port, '/user/jane.doe')).text, /user shell/, 'a dotted value goes through the rewrite');
    assert.equal((await raw(port, '/user/missing.png')).status, 404);
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});

test('a server bound to this machine refuses a request under another name (DNS rebinding) with 421, and answers its own names', async () => {
  const { hostsFor } = await import('../server/request.mjs');
  const site = join(sandbox, 'hosts');
  mkdirSync(site, { recursive: true });
  writeFileSync(join(site, 'index.html'), '<html><body>private</body></html>');
  const server = createStaticServer(site, { hosts: hostsFor('127.0.0.1') });
  const open = createStaticServer(site, { hosts: hostsFor('0.0.0.0') });
  await Promise.all([server, open].map((each) => new Promise((done) => each.listen(0, done))));
  try {
    const port = server.address().port;
    for (const host of [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]) assert.equal((await raw(port, '/', { headers: { host } })).status, 200, host);
    const rebound = await raw(port, '/', { headers: { host: `attacker.example:${port}` } });
    assert.equal(rebound.status, 421);
    assert.doesNotMatch(rebound.text, /private/);
    assert.equal((await raw(open.address().port, '/', { headers: { host: 'anything.example' } })).status, 200, 'a server told to serve the network answers to any name');
  } finally {
    for (const each of [server, open]) {
      each.closeAllConnections?.();
      each.close();
    }
  }
});

test('"//path" is a path of this site for the static handler too, not a host', async () => {
  const { parseRequestUrl } = await import('../server/request.mjs');
  assert.equal(parseRequestUrl('//evil.example/x').pathname, '//evil.example/x');
  assert.equal(readPathname('//evil.example/x'), '//evil.example/x');
  assert.equal(parseRequestUrl('/a?b=1').search, '?b=1');
});

test('transformResponse does not run for the 421 or the malformed-URL 400', async () => {
  const calls = [];
  const handler = await createSsrHandler({
    config: { pages: [], outDir: 'dist' },
    root: sandbox,
    hosts: ['localhost'],
    transformResponse: () => {
      calls.push('transformResponse');
      return null;
    },
  });
  const server = createServer((incoming, outgoing) => handler(incoming, outgoing));
  await new Promise((done) => server.listen(0, done));
  try {
    const port = server.address().port;
    assert.equal((await raw(port, '/', { headers: { host: 'attacker.example' } })).status, 421);
    assert.equal((await raw(port, '/%E0%A4%A', { headers: { host: 'localhost' } })).status, 400);
    assert.deepEqual(calls, [], 'the hook runs only once a request context exists');
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});

test('createSsrHandler and createStaticHandler refuse a "hosts" that is not a list, at startup (a string would be a substring test)', async () => {
  const config = { pages: [], outDir: 'dist' };
  await assert.rejects(createSsrHandler({ config, hosts: 'localhost' }), /createSsrHandler: "hosts" is "localhost", not a list of host names\. Pass a list such as hostsFor\("127\.0\.0\.1"\)/);
  const { createStaticHandler } = await import('../cli/static-handler.mjs');
  assert.throws(() => createStaticHandler(sandbox, { hosts: ['localhost', 7] }), /createStaticHandler: "hosts" is \["localhost",7\], not a list of host names/);
});

test('createSsrHandler checks the API module and createApi() before it answers anything', async () => {
  const project = join(sandbox, 'api-shape');
  mkdirSync(join(project, 'dist'), { recursive: true });
  writeFileSync(join(project, 'no-create-api.mjs'), 'export const create = () => ({})');
  await assert.rejects(createSsrHandler({ config: { api: 'no-create-api.mjs', pages: [], outDir: 'dist' }, root: project }), /createSsrHandler: config\.api "no-create-api\.mjs" does not export a function createApi\. Did you mean "create"\? Export `createApi\(\{ root \}\) => \{ handle, handleForm\?, apiBase\? \}`/);
  writeFileSync(join(project, 'no-handle.mjs'), 'export const createApi = () => ({ handleForm: () => null })');
  await assert.rejects(createSsrHandler({ config: { api: 'no-handle.mjs', pages: [], outDir: 'dist' }, root: project }), /createApi\(\) of no-handle\.mjs returned an object without "handle"\. .*Return \{ handle/);
  writeFileSync(join(project, 'not-an-object.mjs'), 'export const createApi = () => "api"');
  await assert.rejects(createSsrHandler({ config: { api: 'not-an-object.mjs', pages: [], outDir: 'dist' }, root: project }), /createApi\(\) of not-an-object\.mjs returned "api", not an object \{ handle, handleForm\?, apiBase\? \}/);
});

test('an API answer without a body is refused with the fix, instead of an empty 500 without a reason', async () => {
  const project = join(sandbox, 'api-body');
  mkdirSync(join(project, 'dist'), { recursive: true });
  writeFileSync(join(project, 'api.mjs'), "export const createApi = () => ({ handle: ({ pathname }) => (pathname === '/api/empty' ? { status: 200 } : null) });");
  const reported = [];
  const handler = await createSsrHandler({ config: { api: 'api.mjs', pages: [], outDir: 'dist' }, root: project, onError: (error) => reported.push(error.message) });
  const server = createServer((incoming, outgoing) => handler(incoming, outgoing));
  await new Promise((done) => server.listen(0, done));
  try {
    const answer = await raw(server.address().port, '/api/empty');
    assert.equal(answer.status, 500);
    assert.match(reported[0], /api\.handle: answered status 200 without "body"\. Add body: the JSON value to send \(null for an empty one\), or answer a status that carries no body \(a 3xx redirect, 204 or 304\)/);
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});

test('a 3xx answer from api.handle may leave its body out: a redirect is answered with an empty body', async () => {
  const project = join(sandbox, 'api-redirect');
  mkdirSync(join(project, 'dist'), { recursive: true });
  writeFileSync(join(project, 'api.mjs'), "export const createApi = () => ({ handle: ({ pathname }) => (pathname === '/api/old' ? { status: 302, headers: { location: '/api/new' } } : null) });");
  const handler = await createSsrHandler({ config: { api: 'api.mjs', pages: [], outDir: 'dist' }, root: project });
  const server = createServer((incoming, outgoing) => handler(incoming, outgoing));
  await new Promise((done) => server.listen(0, done));
  try {
    const answer = await raw(server.address().port, '/api/old');
    assert.equal(answer.status, 302);
    assert.equal(answer.headers.location, '/api/new');
    assert.equal(answer.text, '');
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});

test('createSsrHandler refuses an option it does not know, with a suggestion (the old fetchFunction option must not be ignored silently)', async () => {
  const config = { pages: [], outDir: 'dist' };
  await assert.rejects(createSsrHandler({ config, fetchFunction: async () => null }), /createSsrHandler: unknown option "fetchFunction"\. Allowed options: config, root, outDir, maxBodyBytes, timeoutMs, onTimeout, log, onError, hosts, initialStateFor, stateForBrowser, transformResponse\. The data requests of a page are answered by `fetchFunction` of the config/);
  await assert.rejects(createSsrHandler({ config, maxBodyByte: 5 }), /unknown option "maxBodyByte"\. Did you mean "maxBodyBytes"\?/);
  await assert.rejects(createSsrHandler({ config, transformResponse: 'no' }), /createSsrHandler: "transformResponse" must be a function of \(request, response\)/);
  await assert.rejects(createSsrHandler({ config, stateForBrowser: 'all' }), /createSsrHandler: "stateForBrowser" must be a function of \(state, request\)/);
  await assert.rejects(createSsrHandler({ config, timeoutMs: 0 }), /createSsrHandler: timeoutMs 0 is not allowed/);
  await assert.rejects(createSsrHandler({ config, onTimeout: 'partial' }), /createSsrHandler: onTimeout "partial" is not allowed/);
});
