// The hydration example end to end: build, render each URL on the server (cli/ssr-server.mjs), then let the
// browser app take over from the embedded state.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { definePage } from '@ehtb/agent-ui/pages';
import { createRoot, createWindow, findByTag, fireEvent } from '@ehtb/agent-ui/testing/dom-shim.mjs';
import { createFakeFetch, sleep } from '@ehtb/agent-ui/testing/helpers.mjs';

const { build } = await import('@ehtb/agent-ui/build/build.mjs');
const { createSsrServer } = await import('@ehtb/agent-ui/cli/ssr-server.mjs');
const { loadConfig } = await import('@ehtb/agent-ui/build/config.mjs');
const { page: listPage } = await import('./pages/page.js');
const { page: articlePage } = await import('./pages/article/[id]/page.js');
const { view: listView, layout: listLayout } = await import('./pages/view.js');
const { view: articleView, layout: articleLayout } = await import('./pages/article/[id]/view.js');
const list = definePage(listPage, { path: '/', view: listView, layout: listLayout });
const article = definePage(articlePage, { path: '/article/:id', view: articleView, layout: articleLayout });
const { readServerState } = await import('@ehtb/agent-ui/hydrate');

const repositoryRoot = dirname(fileURLToPath(import.meta.url));
const outDir = '.output-test';
const articles = JSON.parse(readFileSync(join(repositoryRoot, 'public/articles.json'), 'utf8'));
let server;
let base;

before(async () => {
  const config = await loadConfig({ root: repositoryRoot });
  build({ ...config, projectRoot: repositoryRoot, outDir });
  server = await createSsrServer({ config, outDir, root: repositoryRoot });
  await new Promise((resolveListening) => server.listen(0, resolveListening));
  base = `http://localhost:${server.address().port}`;
});

after(() => {
  server?.close();
  rmSync(join(repositoryRoot, outDir), { recursive: true, force: true });
});

const get = async (path) => {
  const response = await fetch(base + path);
  return { status: response.status, html: await response.text() };
};
// The rendered markup only (the embedded state legitimately contains every article).
const markup = (html) => html.slice(html.indexOf('<!--ssr:start-->'), html.indexOf('<!--ssr:end-->'));
const embeddedState = (html) => JSON.parse(html.match(/<script type="application\/json" id="agent-ui-state">([\s\S]*?)<\/script>/)[1]);

test('every URL arrives rendered for that URL: the list, an article, and a missing article with a 404', async () => {
  const listed = await get('/');
  assert.equal(listed.status, 200);
  for (const entry of articles) assert.ok(listed.html.includes(entry.title), entry.title);
  assert.match(listed.html, /href="\/article\/1"/);

  const page = await get('/article/2');
  assert.equal(page.status, 200);
  assert.ok(markup(page.html).includes(articles[1].title) && markup(page.html).includes(articles[1].body));
  assert.ok(!markup(page.html).includes(articles[0].body)); // only this article is in the markup
  assert.deepEqual(embeddedState(page.html).route, { params: { id: '2' }, hydrated: false });
  assert.match(page.html, /Server-rendered: waiting for JavaScript/);
  assert.match(page.html, /<title>[^<]*<\/title>/);

  const missing = await get('/article/999');
  assert.equal(missing.status, 404);
  assert.match(missing.html, /Article not found/);
});

test('the served page is the template filled in per request: one state script, one markup block, assets absolute', async () => {
  const { html } = await get('/article/3');
  assert.equal(html.split('id="agent-ui-state"').length, 2);
  assert.equal(html.split('<!--ssr:start-->').length, 2);
  assert.match(html, /<script type="module" src="\/assets\/article-id\.[0-9a-f]{8}\.js">/);
  assert.ok(html.indexOf('agent-ui-state') < html.indexOf('type="module"')); // state is available before the app starts
  assert.ok(!html.includes('</script><script>alert')); // state is escaped
});

test('the browser takes over from the embedded state: first render equals the server markup, then it is interactive', async () => {
  const { html } = await get('/article/2');
  const initialState = embeddedState(html);
  const documentStub = { getElementById: (id) => (id === 'agent-ui-state' ? { textContent: JSON.stringify(initialState) } : null) };
  assert.equal(readServerState(documentStub).articles.status, 'ready');

  const fetchFunction = createFakeFetch(() => articles);
  const win = createWindow('/article/2');
  const client = article.create({ root: createRoot(), win, fetchFunction, dev: false, initialState: readServerState(documentStub) });
  // Before any fetch finishes the article is already on screen: no empty "loading" flash.
  assert.equal(client.outline()[0].children.find((node) => node.id === 'article-view').children.find((node) => node.id === 'article-title').text, articles[1].title);
  assert.match(JSON.stringify(client.outline()), /Server-rendered: waiting for JavaScript/);

  client.dispatch('route.hydrate'); // what startPage does when the browser entry has created the app
  await sleep(20);
  await client.settle();
  assert.match(JSON.stringify(client.outline()), /Interactive: the browser has taken over/);

  const like = client.tree().find((entry) => entry.id === 'like');
  assert.equal(like.label, 'Like (0)');
  client.dispatch('likes.add', { id: '2' });
  await client.settle();
  assert.equal(client.tree().find((entry) => entry.id === 'like').label, 'Like (1)');
  assert.equal(client.errors.length, 0);
});

test('client side: searching works after takeover, and an unknown article is a not-found view', async () => {
  const { html } = await get('/');
  const fetchFunction = createFakeFetch(() => articles);
  const root = createRoot();
  const client = list.create({ root, win: createWindow('/'), fetchFunction, dev: false, initialState: embeddedState(html) });
  await client.settle();

  fireEvent(findByTag(root, 'input')[0], 'input', { target: Object.assign(findByTag(root, 'input')[0], { value: 'real urls' }) });
  await client.settle();
  assert.equal(client.derived().articles.visible.length, 1);

  const missing = article.create({ root: createRoot(), win: createWindow('/article/77'), fetchFunction, dev: false });
  await sleep(20);
  await missing.settle();
  assert.equal(missing.derived().articles.isNotFound, true);
});

test('static files are served from public/, and unknown files are 404', async () => {
  assert.equal((await get('/articles.json')).status, 200);
  assert.equal((await get('/nothing.js')).status, 404);
});
