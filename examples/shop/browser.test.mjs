// The soft navigation of the shop in a real browser: Chrome, headless, driven over the DevTools protocol (@ehtb/agent-ui/testing/browser.mjs,
// Node's own WebSocket, no library), against the built site served by the render server. The shim tests of the framework cannot show that a browser really keeps
// the document, so this one does. It skips itself when there is no Chrome (set CHROME_PATH to use another build).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, serveSite } from '@ehtb/agent-ui/testing/browser.mjs';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const browser = await launchBrowser(); // null without Chrome (set CHROME_PATH to use another build)
const cleanups = [];
after(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  await browser?.close();
});

test('soft links replace the page and keep the document and the shell; the address, the head and the history follow', { skip: browser ? false : 'no Chrome found (set CHROME_PATH)' }, async () => {
  const site = await serveSite({ projectRoot });
  cleanups.push(site.close);
  const base = site.url;

  const { evaluate, until, report } = await browser.open(`${base}/`);
  // Marks the document, the header's element and the shell's app, to see afterwards that they are the same ones.
  await evaluate(`window.__document = 'the first one'; document.querySelector('[data-id="shop-header"]').__mark = 1; window.__firstPage = window.__ui; window.__firstShell = window.__shell; true`);
  const where = () => evaluate(`JSON.stringify({ path: location.pathname, title: document.title, document: window.__document, header: document.querySelector('[data-id="shop-header"]').__mark === 1, shell: window.__shell === window.__firstShell, badge: document.querySelector('[data-id="nav-cart"]').textContent, current: [...document.querySelectorAll('[data-id="shop-nav"] a.active')].map((link) => link.dataset.id), styles: [...document.querySelectorAll('link[rel=stylesheet]')].map((link) => link.getAttribute('href').split('/').pop().replace(/\\.[0-9a-f]{8}/, '')), heading: document.querySelector('#app h2')?.textContent, focus: document.activeElement?.id })`).then(JSON.parse);
  const click = (selector) => evaluate(`document.querySelector('${selector}').click()`);

  assert.deepEqual(await where(), { path: '/', title: 'Trailside', document: 'the first one', header: true, shell: true, badge: 'Cart (0)', current: ['nav-shop'], styles: ['shared-checkout-index-product-id.css', 'index.css'], heading: 'Products', focus: '' });

  await click('[data-id="nav-checkout"]'); // a soft link in the shell's footer
  await until(`location.pathname === '/checkout' && document.querySelector('[data-id="checkout-title"]')`, 'the checkout page');
  const checkout = await where();
  assert.deepEqual({ ...checkout, styles: undefined }, { path: '/checkout', title: 'Checkout - Trailside', document: 'the first one', header: true, shell: true, badge: 'Cart (0)', current: ['nav-cart'], styles: undefined, heading: 'Checkout', focus: 'app' });
  assert.deepEqual(checkout.styles, ['shared-checkout-index-product-id.css', 'checkout.css'], 'the list page\'s stylesheet was removed and the checkout page\'s added');
  assert.equal(await evaluate('window.__firstPage.destroyed'), true, 'the page that was replaced was destroyed');

  await click('[data-id="back-to-shop"]');
  await until(`location.pathname === '/' && document.querySelector('[data-id="products"]')`, 'the list page');
  await click('a[href="/product/2"]'); // a soft link of the page's own content
  await until(`location.pathname === '/product/2' && document.querySelector('[data-id="add-to-cart"]')`, 'the product page');
  assert.equal((await where()).title, 'Insulated bottle', 'the head follows the page');
  await click('[data-id="add-to-cart"]');
  await until(`document.querySelector('[data-id="nav-cart"]').textContent === 'Cart (1)'`, 'the shell to show the cart of the page');
  await click('[data-id="to-checkout"]'); // a button: route.go
  await until(`location.pathname === '/checkout' && document.querySelector('[data-id="checkout-form"]')`, 'the checkout page by route.go');
  assert.equal((await where()).badge, 'Cart (1)');

  await evaluate('history.back()');
  await until(`location.pathname === '/product/2' && document.querySelector('[data-id="add-to-cart"]')`, 'back to the product page');
  await evaluate('history.forward()');
  await until(`location.pathname === '/checkout' && document.querySelector('[data-id="checkout-form"]')`, 'forward to the checkout page');
  const end = await where();
  assert.equal(end.document, 'the first one');
  assert.equal(end.header && end.shell, true);

  assert.deepEqual(report.loads, [`${base}/`], 'the browser loaded one document; every other page was a swap');
  assert.deepEqual(report.console, [], 'nothing was reported in the console');

  // What is not a plain page ends in a normal page load of the URL, with the reason in the console.
  await evaluate(`(() => { const link = document.createElement('a'); link.href = '/product/99'; link.setAttribute('data-soft', ''); link.textContent = 'x'; document.querySelector('#app').append(link); link.click(); })()`);
  await until(`location.pathname === '/product/99' && window.__document === undefined`, 'the normal page load of a page that answers 404');
  assert.ok(report.loads.length === 2 && report.console.some((line) => /soft navigation to \/product\/99: the answer is 404/.test(line)));
});

test('the first page takes over the markup the server wrote: no element of the shell or the page is made again, and the page works', { skip: browser ? false : 'no Chrome found (set CHROME_PATH)' }, async () => {
  const site = await serveSite({ projectRoot, outDir: '.output-browser-adopt' });
  cleanups.push(site.close);
  // Records every element that is added to or removed from the document from the moment the browser has read it (the scripts of the page run
  // right after): a page that built its markup again would have removed every element the server wrote and added the same ones.
  const watch = `
    window.__changes = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const [kind, nodes] of [['added', record.addedNodes], ['removed', record.removedNodes]]) {
          for (const node of nodes) if (node.nodeType === 1) window.__changes.push(kind + ' ' + node.localName + ' ' + (node.getAttribute('data-id') ?? ''));
        }
      }
    });
    observer.observe(document, { childList: true, subtree: true });
    document.addEventListener('readystatechange', () => {
      if (document.readyState === 'interactive') {
        observer.takeRecords();
        window.__changes.length = 0;
      }
    });`;
  const { evaluate, until, report } = await browser.open(`${site.url}/`, { beforeLoad: watch });
  await until(`document.readyState === 'complete' && window.__shell && window.__ui.state().route.hydrated`, 'the page and the shell to start');
  await evaluate('window.__ui.settle().then(() => window.__shell.settle()).then(() => true)');
  assert.deepEqual(await evaluate('window.__changes'), [], 'no element was added or removed while the page started');
  assert.deepEqual([await evaluate('window.__ui.errors'), await evaluate('window.__shell.errors')], [[], []]);
  assert.deepEqual(report.console.filter((line) => /AUI0305|differs from the markup/.test(line)), [], 'and the browser found nothing different from what the server wrote');
  assert.match(await evaluate(`document.querySelector('[data-id="nav-cart"]').textContent`), /^Cart \(\d+\)$/, 'the shell shows the cart of the page it took over (the server holds the cart, so earlier tests may have filled it)');
  await evaluate(`document.querySelector('[data-id="nav-checkout"]').click()`);
  await until(`location.pathname === '/checkout' && document.querySelector('[data-id="checkout-title"]')`, 'the checkout page, by a soft link of the adopted shell');
});
