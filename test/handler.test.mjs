// The request handlers behind `serve`, used from a host server: handler(request, response, next?).
// A tiny Express-like chain stands in for the host, so no web framework is needed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createStaticHandler } from '../cli/static-handler.mjs';
import { createSsrHandler } from '../server/ssr-handler.mjs';
import { build } from '../build/build.mjs';
import { loadConfig } from '../build/config.mjs';
import { frameworkBuildOptions } from '../build/presets.mjs';

// The site is test/fixtures/pages-site: four pages found in its pages/ folders.
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/pages-site');
const outDir = '.output-handler';
let server;
let origin;
let builtConfig;
const hostCalls = [];

// A host with its own route, its own file server for the built assets and a not-found of its own, and the agent-ui render
// handler mounted in front of them: the framework renders pages, everything else is the host's.
const createHost = (handler) => {
  const files = createStaticHandler(resolve(repositoryRoot, outDir));
  return createServer((request, response) => {
    hostCalls.push(`${request.method} ${request.url}`);
    if (request.url === '/host/ping') return void response.writeHead(200).end('pong from the host');
    const notFound = () => response.writeHead(404, { 'x-from': 'host' }).end('host not found');
    handler(request, response, () => files(request, response, notFound));
  });
};

before(async () => {
  const config = await loadConfig({ root: repositoryRoot, mode: { dev: true }, file: 'build.config.mjs' });
  builtConfig = { ...config, outDir };
  build({ ...builtConfig, projectRoot: repositoryRoot });
  const handler = await createSsrHandler({ config: builtConfig, root: repositoryRoot });
  server = createHost(handler);
  await new Promise((done) => server.listen(0, done));
  origin = `http://localhost:${server.address().port}`;
});

after(() => {
  server?.closeAllConnections?.();
  server?.close();
  rmSync(join(repositoryRoot, outDir), { recursive: true, force: true });
});

test('the host keeps its own routes and serves the assets; the handler renders pages for the URL, with the status the page answers', async () => {
  assert.equal(await (await fetch(`${origin}/host/ping`)).text(), 'pong from the host');
  const page = await fetch(`${origin}/item/2`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /<!--ssr:start-->/);
  assert.match(html, /<title>Item 2<\/title>/);
  assert.match(html, /"params":\{"id":"2"\}/);
  const script = html.match(/src="(\/assets\/[^"]+\.js)"/)[1];
  assert.equal((await fetch(origin + script)).status, 200);
  const unknown = await fetch(`${origin}/item/99`); // not generated as a file, and the page says 404
  assert.equal(unknown.status, 404);
  assert.match(await unknown.text(), /<title>Item 99<\/title>/);
  assert.equal((await fetch(`${origin}/item/2/`)).status, 200); // a trailing slash is the same page
  assert.match(await (await fetch(`${origin}/`)).text(), /<!--ssr:start-->.*Home/s);
});

test('a read-only load finds the same pages and rewrites no generated module', async () => {
  const generated = resolve(repositoryRoot, '.agent-ui/index/app.js');
  const before = statSync(generated).mtimeMs;
  const { pages } = await loadConfig({ root: repositoryRoot, file: 'build.config.mjs', readOnly: true });
  assert.deepEqual(pages.map((page) => [page.name, page.app]), builtConfig.pages.map((page) => [page.name, page.app]));
  assert.equal(statSync(generated).mtimeMs, before);
});

test('an answer says its length, in bytes, instead of arriving chunked', async () => {
  const response = await fetch(`${origin}/`);
  const body = Buffer.from(await response.arrayBuffer());
  assert.equal(Number(response.headers.get('content-length')), body.length);
  assert.equal(response.headers.get('transfer-encoding'), null);
});

test('a parameter with an encoded percent or slash matches its page: patterns see the path as sent', async () => {
  const percent = await fetch(`${origin}/item/100%25`);
  assert.equal(percent.status, 404); // the page answers 404 for an unknown id, but it was matched and rendered
  assert.match(await percent.text(), /<!--ssr:start-->/);
  const slash = await fetch(`${origin}/item/a%2Fb`);
  assert.match(await slash.text(), /"params":\{"id":"a\/b"\}/);
});

test('what the handler does not answer goes to next(): unknown paths, other methods, traversal', async () => {
  const unknown = await fetch(`${origin}/nothing/here.js`);
  assert.equal(unknown.status, 404);
  assert.equal(unknown.headers.get('x-from'), 'host');
  const post = await fetch(`${origin}/item/1`, { method: 'POST', body: 'x' });
  assert.equal(post.headers.get('x-from'), 'host');
  assert.equal((await fetch(`${origin}/item/1`, { method: 'DELETE' })).headers.get('x-from'), 'host');
  assert.equal((await fetch(`${origin}/item/1/extra/segments`)).headers.get('x-from'), 'host'); // no page has this URL
});

test('the site hooks run only for an answer: a request that goes to next() does not call them', async () => {
  const calls = [];
  const handler = await createSsrHandler({
    config: builtConfig,
    root: repositoryRoot,
    transformResponse: () => { calls.push('transformResponse'); throw new Error('transformResponse must not run'); },
  });
  const server = createServer((request, response) => handler(request, response, () => response.writeHead(200, { 'content-type': 'text/plain' }).end('from the host')));
  await new Promise((done) => server.listen(0, done));
  try {
    const answer = await fetch(`http://localhost:${server.address().port}/assets/not-a-page.js`);
    assert.equal(answer.status, 200);
    assert.equal(await answer.text(), 'from the host');
    assert.deepEqual(calls, []);
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});

test('createStaticHandler without next answers 404 and 405 itself, and with next defers', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'agent-ui-static-'));
  try {
    mkdirSync(join(directory, 'assets'));
    writeFileSync(join(directory, 'index.html'), '<p>home</p>');
    const handler = createStaticHandler(directory);
    const standalone = createServer((request, response) => handler(request, response));
    await new Promise((done) => standalone.listen(0, done));
    const base = `http://localhost:${standalone.address().port}`;
    assert.equal(await (await fetch(base)).text(), '<p>home</p>');
    assert.equal((await fetch(`${base}/missing.css`)).status, 404);
    assert.equal((await fetch(base, { method: 'PUT' })).status, 405);
    standalone.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a render that never became ready answers 503 by default, and onTimeout: "serve" keeps the partial page', async () => {
  const messages = [];
  const handler = await createSsrHandler({ config: builtConfig, root: repositoryRoot, timeoutMs: 20, log: (message) => messages.push(message) });
  const stuckServer = createServer((request, response) => handler(request, response));
  await new Promise((done) => stuckServer.listen(0, done));
  try {
    const answer = await fetch(`http://localhost:${stuckServer.address().port}/stuck`);
    assert.equal(answer.status, 503);
    assert.equal(await answer.text(), 'service unavailable');
    assert.equal(messages.length, 1);
    assert.match(messages[0], /render \/stuck: gave up waiting for the page to become ready/);
    assert.match(messages[0], /answered 503 because onTimeout is "error"/);
  } finally {
    stuckServer.closeAllConnections?.();
    stuckServer.close();
  }
  const partial = await createSsrHandler({ config: builtConfig, root: repositoryRoot, timeoutMs: 20, onTimeout: 'serve', log: (message) => messages.push(message) });
  const partialServer = createServer((request, response) => partial(request, response));
  await new Promise((done) => partialServer.listen(0, done));
  try {
    const answer = await fetch(`http://localhost:${partialServer.address().port}/stuck`);
    assert.equal(answer.status, 200);
    assert.match(await answer.text(), /content/);
    assert.match(messages.at(-1), /served what exists/);
  } finally {
    partialServer.closeAllConnections?.();
    partialServer.close();
  }
});

test('a client that disconnects stops the render: no answer and no error are written', async () => {
  const { EventEmitter } = await import('node:events');
  const errors = [];
  const handler = await createSsrHandler({ config: builtConfig, root: repositoryRoot, timeoutMs: 5000, onError: (error) => errors.push(error) });
  const incoming = new EventEmitter();
  Object.assign(incoming, { url: '/stuck', method: 'GET', headers: { host: 'localhost' } });
  const outgoing = new EventEmitter();
  Object.assign(outgoing, {
    headersSent: false,
    writableEnded: false,
    destroyed: false,
    writeHead() { throw new Error('a closed request must not be answered'); },
    end() { throw new Error('a closed request must not be answered'); },
  });
  const answered = handler(incoming, outgoing);
  await new Promise((done) => setTimeout(done, 10)); // the page has started and is waiting for a ready that never comes
  outgoing.emit('close');
  await answered;
  await new Promise((done) => setTimeout(done, 20));
  assert.deepEqual(errors, []);
});

test('the render handler gives pages, the API and form handlers one request, applies response headers through transformResponse and a CSP nonce, and redirects forms with 303', async () => {
  const project = mkdtempSync(join(tmpdir(), 'agent-ui-request-'));
  const frameworkRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const pagesModule = pathToFileURL(join(frameworkRoot, 'src/pages.js')).href;
  mkdirSync(join(project, 'dist'), { recursive: true });
  writeFileSync(
    join(project, 'app.mjs'),
    `import { definePage } from ${JSON.stringify(pagesModule)};
     const definition = definePage({
       head: { title: 'Session' },
       namespaces: { session: { state: { user: 'guest' } }, probe: { state: { pathname: '', search: '', method: '' } }, note: { state: { text: '' } } },
     }, { path: '/', view: { tag: 'main', id: 'page', children: [
       { tag: 'p', id: 'who', children: { state: 'session.user' } },
       { tag: 'p', id: 'probe-path', children: { state: 'probe.pathname' } },
       { tag: 'p', id: 'probe-search', children: { state: 'probe.search' } },
       { tag: 'p', id: 'probe-method', children: { state: 'probe.method' } },
     ] } });
     export const create = definition.create;
     export const describePage = definition.describePage;`,
  );
  writeFileSync(
    join(project, 'api.mjs'),
    `export const createApi = () => ({
       handle: ({ method, pathname, query, headers, cookies, body }) => pathname === '/api/who'
         ? { status: 200, body: { method, q: query.get('q'), session: cookies.session ?? null, authorization: headers.authorization ?? null, body }, headers: { 'x-api': 'yes', 'set-cookie': ['api=1; Path=/', 'api2=2; Path=/'] } }
         : null,
       handleForm: ({ pathname, form }) => {
         if (pathname === '/login') return { redirect: '/', headers: { 'set-cookie': ['session=' + form.user + '; Path=/; HttpOnly', 'seen=1; Path=/'] } };
         if (pathname === '/greet') return { status: 200, url: '/?sent=1', initialState: { session: { user: form.user } }, headers: { 'set-cookie': 'session=' + form.user + '; Path=/' } };
         if (pathname === '/external') return { redirect: 'https://example.com/' };
         if (pathname === '/header') return { redirect: '/', headers: { location: '/' } };
         if (pathname === '/cache') return { redirect: '/', headers: { 'cache-control': 'public' } };
         return null;
       },
     });`,
  );
  writeFileSync(join(project, 'dist/home.html'), '<html><head><title>placeholder</title></head><body><div id="app"></div><script type="module" src="/assets/home.js"></script></body></html>');
  const errors = [];
  const nonce = 'n0nce123';
  const config = { api: 'api.mjs', pages: [{ name: 'home', path: '/', app: 'app.mjs', file: 'pages/page.js' }], outDir: 'dist' };
  const handler = await createSsrHandler({
    config,
    root: project,
    initialStateFor: (request) => ({
      session: { user: request.cookies.session ?? 'guest' },
      ...(request.pathname === '/' ? { probe: { pathname: request.pathname, search: request.search, method: request.method }, note: { text: '<script>alert(1)</script>' } } : {}),
    }),
    transformResponse: (request, response) => {
      const html = String(response.headers['content-type'] ?? '').startsWith('text/html');
      const headers = {
        'x-site': request.pathname + request.search,
        'content-security-policy': `default-src 'self'; script-src 'self'${html ? ` 'nonce-${nonce}'` : ''}; style-src 'self'`,
        'set-cookie': 'site=1; Path=/',
      };
      // A page keeps its no-cache default; an API answer gets a private policy here.
      if (request.pathname.startsWith('/api/')) headers['cache-control'] = 'private, max-age=30';
      return { headers, ...(html ? { body: response.body.replace(/<script(?=[\s>])(?![^>]*\bsrc\s*=)/g, `<script nonce="${nonce}"`) } : {}) };
    },
    onError: (error) => errors.push(error.message),
  });
  const server = createServer((request, response) => handler(request, response));
  await new Promise((done) => server.listen(0, done));
  try {
    const origin = `http://localhost:${server.address().port}`;
    const page = await fetch(`${origin}/?q=hello`, { headers: { cookie: 'session=ada; theme=dark' } });
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('x-site'), '/?q=hello');
    assert.equal(page.headers.get('cache-control'), 'no-cache');
    assert.match(page.headers.get('content-security-policy'), /'nonce-n0nce123'/);
    assert.deepEqual(page.headers.getSetCookie(), ['site=1; Path=/']);
    const pageHtml = await page.text();
    assert.match(pageHtml, /<p data-id="who">ada<\/p>/);
    assert.match(pageHtml, /<p data-id="probe-path">\/<\/p>/);
    assert.match(pageHtml, /<p data-id="probe-search">\?q=hello<\/p>/);
    assert.match(pageHtml, /<p data-id="probe-method">GET<\/p>/);
    assert.match(pageHtml, /<script nonce="n0nce123" type="application\/json" id="agent-ui-state">/);
    assert.match(pageHtml, /\\u003cscript>alert\(1\)\\u003c\/script>/);
    assert.doesNotMatch(pageHtml, /<script>alert\(1\)<\/script>/);

    const guest = await fetch(`${origin}/`);
    assert.equal(guest.headers.get('cache-control'), 'no-cache');

    const apiResponse = await fetch(`${origin}/api/who?q=hello`, { headers: { cookie: 'session=ada', authorization: 'Bearer token' } });
    assert.equal(apiResponse.status, 200);
    assert.equal(apiResponse.headers.get('x-api'), 'yes');
    assert.equal(apiResponse.headers.get('x-site'), '/api/who?q=hello');
    assert.equal(apiResponse.headers.get('cache-control'), 'private, max-age=30');
    assert.equal(apiResponse.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(apiResponse.headers.getSetCookie(), ['api=1; Path=/', 'api2=2; Path=/', 'site=1; Path=/']);
    assert.deepEqual(await apiResponse.json(), { method: 'GET', q: 'hello', session: 'ada', authorization: 'Bearer token', body: {} });

    const login = await fetch(`${origin}/login`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'user=ada', redirect: 'manual' });
    assert.equal(login.status, 303);
    assert.equal(login.headers.get('location'), '/');
    assert.equal(login.headers.get('x-site'), '/login');
    assert.equal(login.headers.get('cache-control'), 'no-store');
    assert.deepEqual(login.headers.getSetCookie(), ['session=ada; Path=/; HttpOnly', 'seen=1; Path=/', 'site=1; Path=/']);
    assert.equal(await login.text(), '');

    const greet = await fetch(`${origin}/greet`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'user=ada', redirect: 'manual' });
    assert.equal(greet.status, 200);
    assert.equal(greet.headers.get('x-site'), '/?sent=1');
    assert.equal(greet.headers.get('cache-control'), 'no-store');
    assert.deepEqual(greet.headers.getSetCookie(), ['session=ada; Path=/', 'site=1; Path=/']);
    const greetHtml = await greet.text();
    assert.match(greetHtml, /<p data-id="who">ada<\/p>/);
    assert.match(greetHtml, /<p data-id="probe-path">\/<\/p>/);
    assert.match(greetHtml, /<p data-id="probe-search">\?sent=1<\/p>/);
    assert.match(greetHtml, /<p data-id="probe-method">POST<\/p>/);
    assert.match(greetHtml, /nonce="n0nce123"/);

    const missing = await fetch(`${origin}/missing`);
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get('x-site'), '/missing');
    assert.equal(missing.headers.get('cache-control'), 'no-store');
    assert.match(missing.headers.get('content-security-policy'), /script-src 'self'/);
    assert.doesNotMatch(missing.headers.get('content-security-policy'), /nonce-null/);
    assert.equal(missing.headers.get('x-content-type-options'), 'nosniff');

    for (const path of ['/external', '/header', '/cache']) {
      const answer = await fetch(`${origin}${path}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: '' });
      assert.equal(answer.status, 500, path);
      assert.equal(answer.headers.get('cache-control'), 'no-store', path);
      assert.match(await answer.text(), /internal server error/);
    }
    assert.ok(errors.some((message) => /redirect "https:\/\/example\.com\/" is not a path of this site/.test(message)));
    assert.ok(errors.some((message) => /the header "location" is written for this response by the framework/.test(message)));
    assert.ok(errors.some((message) => /the header "cache-control" is written for this response by the framework/.test(message)));
  } finally {
    server.closeAllConnections?.();
    server.close();
    rmSync(project, { recursive: true, force: true });
  }
});

test('the render handler destroys the page after each request, also when describing its document fails', async () => {
  const handler = await createSsrHandler({ config: builtConfig, root: repositoryRoot });
  const countedServer = createServer((request, response) => handler(request, response));
  await new Promise((done) => countedServer.listen(0, done));
  const url = `http://localhost:${countedServer.address().port}/counted`;
  globalThis.destroyedPages = 0;
  try {
    assert.equal((await fetch(url)).status, 200);
    assert.equal(globalThis.destroyedPages, 1, 'a rendered page is destroyed');
    globalThis.failCountedRender = true;
    assert.equal((await fetch(url)).status, 500);
    assert.equal(globalThis.destroyedPages, 2, 'a page whose document could not be written is destroyed too');
  } finally {
    delete globalThis.failCountedRender;
    delete globalThis.destroyedPages;
    countedServer.closeAllConnections?.();
    countedServer.close();
  }
});
