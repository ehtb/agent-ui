// What the build does with one site of three pages: each page is its own entry that loads only what it imports, and what
// pages share is downloaded once. This is the claim the example exists to show, so it is asserted on the files that were written.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '@ehtb/agent-ui/build/build.mjs';
import { loadConfig } from '@ehtb/agent-ui/build/config.mjs';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const outputs = [];
const run = async (outDir, overrides = {}) => {
  outputs.push(outDir);
  const manifest = build({ ...(await loadConfig({ root: projectRoot })), projectRoot, outDir, ...overrides });
  const text = (name) => readFileSync(join(projectRoot, outDir, manifest.chunks[name].javascript), 'utf8');
  return { manifest, text };
};
after(() => outputs.forEach((outDir) => rmSync(join(projectRoot, outDir), { recursive: true, force: true })));

test('each page is an entry at the URL of its folder, and the manifest says which chunks it loads', async () => {
  const { manifest } = await run('.output-test');
  assert.deepEqual(Object.keys(manifest.pages).sort(), ['checkout', 'index', 'product-id']);
  assert.equal('rewrites' in manifest, false, 'the manifest holds no rewrite rules: the server renders the URLs');
  for (const page of Object.values(manifest.pages)) assert.equal(page.chunksLoadedAtStartup[0], 'agent-ui'); // the runtime first, cached for every page
});

test('every page loads the runtime, the framework\'s shared chunk, the shop\'s shared chunk and only its own page chunk', async () => {
  const { manifest } = await run('.output-test');
  const shared = Object.keys(manifest.chunks).filter((name) => name.startsWith('shared-'));
  assert.equal(shared.length, 1, `small shared pieces are folded into one chunk: ${shared}`);
  for (const [name, page] of Object.entries(manifest.pages)) assert.deepEqual(page.chunksLoadedAtStartup, ['agent-ui', 'agent-ui-checkout-index-product-id', shared[0], name]);
});

test('the framework\'s code and the shop\'s are never one file, so a deploy of the shop leaves the framework\'s chunks cached', async () => {
  const { manifest } = await run('.output-test');
  const isFramework = (path) => path.includes('/src/');
  for (const [name, chunk] of Object.entries(manifest.chunks)) {
    const framework = chunk.modules.filter(isFramework);
    assert.ok(framework.length === 0 || framework.length === chunk.modules.length, `chunk "${name}" mixes the framework's modules with the shop's: ${chunk.modules.join(', ')}`);
  }
  assert.ok(manifest.chunks['agent-ui-checkout-index-product-id'].modules.every(isFramework));
});

test('each page ships only its own finished spec, and the shared behavior is in the shared chunk once', async () => {
  const { manifest, text } = await run('.output-test');
  const shared = Object.keys(manifest.chunks).find((name) => name.startsWith('shared-'));
  const only = { index: ['product-list', 'result-count'], 'product-id': ['add-to-cart', 'in-cart-title'], checkout: ['checkout-form', 'place-order'] };
  for (const [page, markers] of Object.entries(only)) {
    for (const marker of markers) {
      assert.ok(text(page).includes(marker), `the ${page} chunk should contain "${marker}"`);
      for (const other of Object.keys(only).filter((name) => name !== page)) assert.ok(!text(other).includes(marker), `the ${other} chunk must not contain "${marker}"`);
      assert.ok(!text(shared).includes(marker), `the shared chunk must not contain "${marker}"`);
    }
  }
  // The cart and the catalog are behavior (page.js), reached by several pages: their modules are shared, never repeated in a page chunk.
  for (const modulePath of ['shared/cart.js', 'shared/catalog.js']) {
    assert.ok(manifest.chunks[shared].modules.some((path) => path.endsWith(modulePath)), `the shared chunk should contain "${modulePath}"`);
    for (const page of Object.keys(only)) assert.ok(!manifest.chunks[page].modules.some((path) => path.endsWith(modulePath)), `the ${page} chunk must not contain "${modulePath}" (it is shared)`);
  }
});

test('the code that builds a view reaches no browser chunk: a page downloads behavior and the finished spec', async () => {
  const { manifest } = await run('.output-test');
  const shipped = Object.values(manifest.chunks).flatMap((chunk) => chunk.modules);
  for (const modulePath of ['pages/view.js', 'pages/product/[id]/view.js', 'pages/checkout/view.js', 'shared/shell-view.js', 'shared/components/cart-badge.js', 'shared/components/cart-lines.js', 'pages/components/product-card.js', 'src/spec.js']) {
    assert.ok(!shipped.some((shippedPath) => shippedPath.endsWith(modulePath)), `${modulePath} builds the view and must not be in a browser chunk`);
  }
  for (const name of Object.keys(manifest.pages)) assert.ok(shipped.includes(`.agent-ui/${name}/spec.js`), `the ${name} page should ship its finished spec as data`);
});

test('the shell is behavior and data: its code, the navigation plugin and its content are in the shared chunks once, and no page repeats the header', async () => {
  const { manifest, text } = await run('.output-test');
  const shared = Object.keys(manifest.chunks).find((name) => name.startsWith('shared-'));
  for (const modulePath of ['shared/shell.js', '.agent-ui/shells/main.js']) {
    assert.ok(manifest.chunks[shared].modules.some((path) => path.endsWith(modulePath)), `the shared chunk should contain "${modulePath}"`);
  }
  for (const modulePath of ['src/shell.js', 'src/navigation.js']) {
    assert.ok(manifest.chunks['agent-ui-checkout-index-product-id'].modules.some((path) => path.endsWith(modulePath)), `the framework's shared chunk should contain "${modulePath}"`);
  }
  assert.ok(text(shared).includes('shop-header'), 'the header\'s content ships in the shared chunk');
  for (const page of Object.keys(manifest.pages)) assert.ok(!text(page).includes('shop-header'), `the ${page} chunk must not repeat the header: the shell's content is shared`);
  for (const modulePath of ['shared/shell-view.js', 'src/spec.js']) assert.ok(!Object.values(manifest.chunks).some((chunk) => chunk.modules.some((path) => path.endsWith(modulePath))), `${modulePath} builds the view and must not be in a browser chunk`);
});

test('the head code is in a shared chunk (the navigation plugin copies the head of the next page), and its server half is in no chunk', async () => {
  const { manifest } = await run('.output-test');
  const loaded = (page) => manifest.pages[page].chunksLoadedAtStartup.flatMap((name) => manifest.chunks[name].modules);
  for (const page of ['index', 'product-id', 'checkout']) assert.ok(loaded(page).some((path) => path.endsWith('src/head.js')), `the ${page} page loads src/head.js through the shell`);
  for (const [name, chunk] of Object.entries(manifest.chunks)) assert.ok(!chunk.modules.some((path) => path.endsWith('src/head-document.js')), `chunk "${name}" holds the server half of the head`);
});

test('with minSharedChunkBytes: 0 the build keeps one chunk per combination of pages, and the checkout page never loads the catalog', async () => {
  const { manifest, text } = await run('.output-test-exact', { minSharedChunkBytes: 0 });
  const shared = Object.keys(manifest.chunks).filter((name) => name.startsWith('shared-')).sort();
  assert.deepEqual(shared, ['shared-checkout-index-product-id', 'shared-index-product-id']);
  assert.ok(!manifest.pages.checkout.chunksLoadedAtStartup.includes('shared-index-product-id'));
  assert.ok(text('shared-index-product-id').includes('/products.json'));
  for (const name of manifest.pages.checkout.chunksLoadedAtStartup) assert.ok(!text(name).includes('/products.json'), `${name} is loaded by the checkout page and must not contain the catalog`);
});

test('the shared stylesheet is one file loaded by every page, and page styles stay with their page', async () => {
  const { manifest } = await run('.output-test');
  const shared = Object.keys(manifest.chunks).find((name) => name.startsWith('shared-'));
  const css = (name) => readFileSync(join(projectRoot, '.output-test', manifest.chunks[name].stylesheet), 'utf8');
  assert.ok(css(shared).includes('#shop-header'));
  assert.ok(css('index').includes('#products') && !css('index').includes('#shop-header'));
  assert.ok(css('checkout').includes('#checkout-form') && !css('checkout').includes('#products'));
  assert.equal(manifest.chunks['product-id'].stylesheet, undefined);
});
