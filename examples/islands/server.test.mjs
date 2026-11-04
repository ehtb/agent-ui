// The host over HTTP: the page carries both islands rendered with their state, the import map and the entry; the package's modules and
// the client's are served, and nothing outside those two folders is.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { PRODUCTS, createIslandsServer } from './server.js';

let server;
let port;
before(async () => {
  server = createIslandsServer({ products: PRODUCTS });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  port = server.address().port;
});
after(() => server.close());

// A raw request: fetch would normalise "/agent-ui/src/../package.json" before sending it.
const get = (path) =>
  new Promise((done, fail) => {
    request({ port, path, host: '127.0.0.1' }, (response) => {
      let text = '';
      response.on('data', (chunk) => (text += chunk));
      response.on('end', () => done({ status: response.statusCode, type: response.headers['content-type'], text }));
    }).on('error', fail).end();
  });

test('the host page holds both islands, rendered on the server, each with the state it starts with', async () => {
  const page = await get('/');
  assert.equal(page.status, 200);
  assert.match(page.text, /<div id="catalog-island"><section data-id="catalog" aria-label="Products">.*Sencha.*Assam.*Rooibos/s);
  assert.match(page.text, /<div id="badge-island"><span data-id="badge" aria-live="polite">Cart: 0<\/span><\/div>/);
  assert.match(page.text, /<script type="application\/json" id="catalog-state">\{"catalog":\{"products":\[/);
  assert.match(page.text, /<script type="application\/json" id="badge-state">\{"badge":\{"count":0\}\}<\/script>/);
  assert.match(page.text, /<script type="importmap">\{"imports":\{"@ehtb\/agent-ui":"\/agent-ui\/src\/ui\.js"/);
  assert.match(page.text, /<header><strong>Tea shop<\/strong>/, 'the rest of the page is the host\'s');
});

test('the package\'s browser modules and the client\'s are served as JavaScript; nothing else is', async () => {
  for (const path of ['/agent-ui/src/ui.js', '/agent-ui/src/sync-apps.js', '/client/browser.js', '/client/widgets/catalog.js']) {
    const answer = await get(path);
    assert.equal(answer.status, 200, path);
    assert.match(answer.type, /^text\/javascript/);
  }
  for (const path of ['/agent-ui/src/../package.json', '/client/../server.js', '/client/%2e%2e/server.js', '/agent-ui/src/missing.js', '/elsewhere']) {
    assert.equal((await get(path)).status, 404, path);
  }
});
