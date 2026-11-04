// The same page in a real browser (headless Chrome, skipped where there is none): the import map loads the package's modules as they
// are, both islands take over the server's markup, and a click in one reaches the other.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findChrome, launchBrowser } from '@ehtb/agent-ui/testing/browser.mjs';
import { PRODUCTS, createIslandsServer } from './server.js';

test('in Chrome, the islands start from the import map and a click in the catalog updates the badge', { skip: findChrome() ? false : 'no Chrome found' }, async () => {
  const server = createIslandsServer({ products: PRODUCTS });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const browser = await launchBrowser();
  try {
    const page = await browser.open(`http://127.0.0.1:${server.address().port}/`);
    await page.click('[data-key="assam"] button');
    await page.until(`document.querySelector('[data-id="badge"]').textContent === 'Cart: 1'`, 'the badge to count 1');
    assert.equal(await page.evaluate(`document.querySelector('[data-id="badge"]').textContent`), 'Cart: 1');
  } finally {
    await browser.close();
    server.close();
  }
});
