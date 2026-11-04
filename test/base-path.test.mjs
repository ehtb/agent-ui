// A site served below a base path (src/base-path.js): the app and the API work in the site's own paths, and the base exists only on
// the wire. The runtime writes it before root-absolute URLs, the build before asset URLs, the render server takes it off a request,
// and soft navigation adds it to the address.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRoot, findElements } from './support/dom-shim.mjs';
import { copyFixture } from './copy-fixture.mjs';
import { withBase, withBaseInAttribute, withoutBase } from '../src/base-path.js';
import { isBasePath } from '../src/base-path-checks.js';
import { app } from '../src/ui.js';
import { checkConfig } from '../build/config-check.mjs';
import { renderPage } from '../server/render-page.js';
import { navigation } from '../src/navigation.js';

const { a, div, form, img, state } = await import('../src/spec.js');

test('withBase adds the base to a root-absolute URL only; withoutBase takes it off, and says null outside it', () => {
  assert.equal(withBase('/shop', '/about'), '/shop/about');
  assert.equal(withBase('/shop', '/'), '/shop/');
  for (const left of ['https://example.com/a', '//cdn.example.com/a.js', '#top', 'about', '?q=1', 'mailto:a@b.c']) assert.equal(withBase('/shop', left), left);
  assert.equal(withBase('', '/about'), '/about');
  assert.equal(withoutBase('/shop', '/shop/about'), '/about');
  assert.equal(withoutBase('/shop', '/shop'), '/');
  assert.equal(withoutBase('/shop', '/shop/'), '/');
  assert.equal(withoutBase('/shop', '/shopping'), null, 'a path that only starts with the same letters is outside');
  assert.equal(withoutBase('/shop', '/about'), null);
  assert.equal(withoutBase('', '/about'), '/about');
  assert.equal(withBaseInAttribute('/shop', 'srcset', '/a.png 1x, /b.png 2x, https://cdn.example.com/c.png 3x'), '/shop/a.png 1x, /shop/b.png 2x, https://cdn.example.com/c.png 3x');
  assert.equal(withBaseInAttribute('/shop', 'srcset', '/a.png'), '/shop/a.png');
  assert.equal(withBaseInAttribute('/shop', 'ping', '/track https://example.com/t'), '/shop/track https://example.com/t');
  assert.equal(withBaseInAttribute('/shop', 'cite', '/source'), '/shop/source');
  assert.equal(withBaseInAttribute('', 'srcset', '/a.png 1x'), '/a.png 1x');
  for (const good of ['', '/shop', '/apps/shop', '/a.b', '/v1~x']) assert.equal(isBasePath(good), true, good);
  for (const bad of ['/', 'shop', '/shop/', '//shop', '/sh op', '/..', '/a/../b', '/./a', null, 3]) assert.equal(isBasePath(bad), false, String(bad));
});

test('every public entry that takes a base path refuses one that is not one: build, writeSite, prerender, createStaticHandler', async () => {
  const { build } = await import('../build/build.mjs');
  const { writeSite } = await import('../build/write-site.mjs');
  const { prerender } = await import('../build/prerender.mjs');
  const { createStaticHandler } = await import('../cli/static-handler.mjs');
  assert.throws(() => build({ projectRoot: '/nowhere', entries: [{ name: 'a', path: 'a.js' }], basePath: 'shop' }), /^Error: build: basePath "shop" is not allowed\. Write basePath as a path below the root/);
  assert.throws(() => writeSite({ projectRoot: '/nowhere', outDir: 'dist', assetsDir: 'assets', basePath: '/shop/' }), /^Error: writeSite: basePath "\/shop\/" is not allowed/);
  await assert.rejects(prerender({ projectRoot: '/nowhere', outDir: 'dist', pages: [], basePath: '//shop' }), /^Error: prerender: basePath "\/\/shop" is not allowed/);
  assert.throws(() => createStaticHandler('/nowhere', { basePath: 'shop' }), /^Error: createStaticHandler: basePath "shop" is not allowed/);
});

test('the build config refuses a base path that is not one, with the form to write', () => {
  assert.deepEqual(checkConfig({ basePath: '/shop' }), []);
  assert.deepEqual(checkConfig({ basePath: 'shop/' }), ['build config "basePath": "shop/" is not a base path. Write basePath as a path below the root with no trailing slash, for example "/shop" or "/apps/shop", or leave it out for a site at the root']);
  assert.match(checkConfig({ basePth: '/shop' })[0], /unknown option\. Did you mean "basePath"\?/);
});

for (const dev of [true, false]) {
  test(`dev: ${dev}: app() writes the base before every root-absolute URL it puts in the page, and leaves other URLs alone`, async () => {
    const root = createRoot();
    const spec = div(null, a({ id: 'home', href: '/' }, 'Home'), a({ id: 'item', href: state('links.item') }, 'Item'), a({ id: 'away', href: 'https://example.com/' }, 'Away'), a({ id: 'top', href: '#top' }, 'Top'), img({ id: 'logo', src: '/logo.png', srcset: '/logo.png 1x, /logo@2x.png 2x', alt: 'Logo' }), form({ id: 'form', action: '/contact' }, 'x'));
    const ui = app({ namespaces: { links: { state: { item: '/item/1' }, actions: { set: { args: { href: 'string' }, run: (store, { href }) => store.set('item', href) } } } }, spec, root, dev, basePath: '/shop' });
    const attribute = (id, name) => findElements(root, (element) => element.getAttribute('data-id') === id)[0].getAttribute(name);
    assert.equal(attribute('home', 'href'), '/shop/');
    assert.equal(attribute('item', 'href'), '/shop/item/1');
    assert.equal(attribute('away', 'href'), 'https://example.com/');
    assert.equal(attribute('top', 'href'), '#top');
    assert.equal(attribute('logo', 'src'), '/shop/logo.png');
    assert.equal(attribute('logo', 'srcset'), '/shop/logo.png 1x, /shop/logo@2x.png 2x');
    assert.equal(attribute('form', 'action'), '/shop/contact');
    ui.dispatch('links.set', { href: '/item/2' });
    await ui.settle();
    assert.equal(attribute('item', 'href'), '/shop/item/2', 'a bound URL gets the base on every change');
    assert.deepEqual(ui.state().links, { item: '/item/2' }, 'the state keeps the site path');
  });
}

test('app() refuses a base path that is not one, in development and with dev: false', () => {
  for (const dev of [true, false]) {
    assert.throws(() => app({ spec: div(null, 'x'), root: createRoot(), dev, basePath: '/shop/' }), /app: basePath "\/shop\/" is not allowed\. Write basePath as a path below the root with no trailing slash/);
  }
});

test('renderPage below a base path: the page reads its parameters from the site path, its links and head URLs carry the base', async () => {
  const { definePage } = await import('../src/pages.js');
  const entry = definePage(
    { head: { title: 'Item', tags: [{ tag: 'link', props: { rel: 'canonical', href: '/item/7' } }, { tag: 'link', props: { rel: 'icon', href: 'https://cdn.example.com/i.png' } }] } },
    { path: '/item/:id', view: div(null, a({ id: 'back', href: '/' }, 'Back'), state('route.params.id')) },
  );
  const result = await renderPage(entry.create, { url: '/item/7', dev: true, basePath: '/shop' });
  try {
    assert.match(result.html, /href="\/shop\/"/);
    assert.match(result.html, />7</);
    assert.equal(result.state.route.params.id, '7');
    const { tags } = entry.describePage(result.state, { basePath: result.basePath });
    assert.deepEqual(tags.map((tag) => tag.attributes.href), ['/shop/item/7', 'https://cdn.example.com/i.png']);
  } finally {
    result.ui.destroy();
  }
  await assert.rejects(renderPage(entry.create, { url: '/', dev: true, basePath: 'shop' }), /renderPage: basePath "shop" is not allowed/);
});

test('a site built and served below /shop: assets, links and pages carry the base, the API and forms see site paths, and a path outside is the host\'s', async () => {
  const project = copyFixture('pages-site');
  const { build } = await import('../build/build.mjs');
  const { loadConfig } = await import('../build/config.mjs');
  const { createSsrHandler } = await import('../server/ssr-handler.mjs');
  const { createStaticHandler } = await import('../cli/static-handler.mjs');
  project.write('build.config.mjs', `import { frameworkBuildOptions } from '@ehtb/agent-ui/build/presets.mjs';
export default ({ dev = false, validator } = {}) => ({ ...frameworkBuildOptions({ dev, validator, projectRoot: import.meta.dirname }), outDir: 'dist', basePath: '/shop', api: 'api.mjs' });
`);
  project.write('api.mjs', `export const createApi = () => ({
  handle: ({ method, pathname }) => (pathname === '/api/where' ? { status: 200, body: { method, pathname } } : null),
  handleForm: ({ pathname }) => (pathname === '/contact' ? { redirect: '/item/1' } : null),
});
`);
  let server = null;
  try {
    const config = await loadConfig({ root: project.root });
    build({ ...config, projectRoot: project.root });
    const entryText = readdirSync(join(project.root, '.agent-ui/item-id')).map((file) => readFileSync(join(project.root, '.agent-ui/item-id', file), 'utf8')).find((text) => text.includes('startPage('));
    assert.match(entryText, /dev: false, basePath: '\/shop' \}\);/, 'the generated entry writes the base down');
    const manifest = JSON.parse(project.read('dist/manifest.json'));
    assert.equal(manifest.basePath, '/shop');
    assert.ok(Object.values(manifest.chunks).every((chunk) => chunk.javascript.startsWith('/shop/assets/')));
    const render = await createSsrHandler({ config, root: project.root });
    const files = createStaticHandler(join(project.root, 'dist'), { basePath: '/shop' });
    server = createServer((request, response) => render(request, response, () => files(request, response, () => response.writeHead(404, { 'x-from': 'host' }).end('host'))));
    await new Promise((done) => server.listen(0, done));
    const origin = `http://localhost:${server.address().port}`;

    const home = await fetch(`${origin}/shop/`);
    assert.equal(home.status, 200);
    const homeHtml = await home.text();
    assert.match(homeHtml, /href="\/shop\/item\/1"/, 'a link of the spec carries the base');
    const script = homeHtml.match(/src="(\/shop\/assets\/[^"]+\.js)"/)?.[1];
    assert.ok(script, 'the entry script is below the base');
    assert.equal((await fetch(origin + script)).status, 200, 'and is served there');
    assert.equal((await fetch(`${origin}/shop`)).status, 200, 'the base itself is the home page');

    const item = await (await fetch(`${origin}/shop/item/2`)).text();
    assert.match(item, /"params":\{"id":"2"\}/, 'the page reads its parameters from the site path');
    assert.equal((await fetch(`${origin}/shop/item/99`)).status, 404);

    const outside = await fetch(`${origin}/item/2`);
    assert.equal(outside.headers.get('x-from'), 'host', 'a path outside the base goes to the host');

    const api = await fetch(`${origin}/shop/api/where`);
    assert.deepEqual(await api.json(), { method: 'GET', pathname: '/api/where' }, 'the API sees the site path');
    const posted = await fetch(`${origin}/shop/contact`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'a=1', redirect: 'manual' });
    assert.equal(posted.status, 303);
    assert.equal(posted.headers.get('location'), '/shop/item/1', 'a form redirect gets the base on the wire');
  } finally {
    server?.closeAllConnections?.();
    server?.close();
    project.cleanup();
  }
});

test('soft navigation below a base path fetches the site path, pushes the address with the base, and leaves a link outside the base to the browser', async () => {
  const listeners = { click: [], popstate: [], pagehide: [], pageshow: [] };
  const pushed = [];
  const assigned = [];
  const fetched = [];
  const location = { pathname: '/shop/', search: '', hash: '', origin: 'http://localhost', href: 'http://localhost/shop/', assign: (href) => assigned.push(href) };
  const win = {
    location,
    document: { head: { childNodes: [] }, addEventListener: (type, listener) => listeners[type].push(listener), removeEventListener() {} },
    history: { state: null, pushState: (state, title, href) => pushed.push(href), replaceState() {} },
    addEventListener: (type, listener) => listeners[type].push(listener),
    removeEventListener() {},
  };
  const warn = console.warn;
  console.warn = () => {};
  try {
    const api = { destroyed: false, onDestroy() {}, dispatch() {} };
    // The answer names no page script, so the swap ends in a normal load of the same address: with the base.
    navigation({ win, basePath: '/shop', shellName: 'main', fetchFunction: async (url) => (fetched.push(url), { ok: true, redirected: false, status: 200, headers: { get: () => 'text/html' }, text: async () => '<html></html>' }) })(api);
    await api.navigate('/item/2?x=1');
    assert.deepEqual(fetched, ['/item/2?x=1'], 'the fetch gets the site path (the browser fetch adds the base)');
    assert.deepEqual(assigned, ['/shop/item/2?x=1'], 'a page load goes to the address with the base');
    assert.deepEqual(pushed, []);
    const link = (href) => ({ localName: 'a', getAttribute: (name) => (name === 'href' ? href : null), hasAttribute: (name) => name === 'href' });
    const click = (href) => {
      const event = { target: { closest: () => link(href) }, button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      listeners.click.forEach((listener) => listener(event));
      return event;
    };
    assert.equal(click('/other-site/page').defaultPrevented, false, 'a link outside the base is the browser\'s');
    assert.equal(click('/shop/item/3').defaultPrevented, true, 'a link below the base is soft');
  } finally {
    console.warn = warn;
  }
});
