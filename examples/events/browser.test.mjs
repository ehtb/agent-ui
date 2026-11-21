// The production site of this example (esbuild leaves out what no page uses, then minifies) in a real browser: Chrome, headless, driven over the
// DevTools protocol (@ehtb/agent-ui/testing/browser.mjs), against the built site served by the render server. Tree shaking rewrites the code a
// browser runs, so the shim tests, which run the source, cannot show that the shaken chunks still work. It skips itself when there is no Chrome.
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

test('the shaken production pages start in a browser, take over the server markup and answer to the visitor', { skip: browser ? false : 'no Chrome found (set CHROME_PATH)' }, async () => {
  const site = await serveSite({ projectRoot });
  cleanups.push(site.close);

  const { evaluate, until, report } = await browser.open(`${site.url}/`);
  await until(`window.__ui && document.querySelector('[data-id="result-count"]')?.textContent`, 'the page to start');
  const total = await evaluate(`document.querySelector('[data-id="result-count"]').textContent`);
  assert.match(total, /\d/, total);

  // The visitor types in the search box: the list is the app's work, so the browser's handlers and derived values are the ones that were shaken.
  await evaluate(`const box = document.querySelector('[data-id="search"]'); box.value = 'zzzz-no-such-event'; box.dispatchEvent(new Event('input', { bubbles: true })); true`);
  await until(`document.querySelector('[data-id="no-results"]')`, 'the empty result');
  assert.notEqual(await evaluate(`document.querySelector('[data-id="result-count"]').textContent`), total);

  // Another page, by a normal page load: its own chunks are shaken too.
  const about = await browser.open(`${site.url}/about`);
  await about.until(`window.__ui && document.querySelector('h1')`, 'the about page to start');
  assert.deepEqual(report.console, [], 'nothing was reported in the console');
  assert.deepEqual(about.report.console, [], 'nothing was reported in the console of the about page');
});
