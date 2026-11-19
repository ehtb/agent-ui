// withViewTransition in a real browser (headless Chrome over the DevTools protocol, test/support/browser.mjs; the test skips itself where there
// is none). The shim cannot show what a browser does with the rule the plugin adds: that the root does not cross-fade while the page slot does,
// and that the name on the slot is gone when the transition ends. The plugin runs against a real document here; the swap is called the way the
// navigation plugin calls it (src/navigation.js): swap(update).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './support/browser.mjs';

const sourceDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const browser = await launchBrowser();
const cleanups = [];
after(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  await browser?.close();
});
const skip = browser ? false : 'no Chrome found (set CHROME_PATH)';

// A page with a shell around the slot: a header that stays, and #app, which a page swap changes. `window.run(options)` makes one swap and
// reports what the browser computed for the pictures of the transition once it was ready.
const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>vt</title><style>#header { height: 40px; background: #ccc } #app { height: 100px; background: #eee }</style></head>
<body><header id="header">Header</header><div id="app">old</div>
<script type="module">
  import { viewTransition } from '/src/view-transition.js';
  let swap;
  viewTransition({ win: window })({ extendNavigation: (extension) => { swap = extension.swap; } });
  window.__ui = { settle: () => Promise.resolve() };
  window.run = async ({ withoutTypes = false } = {}) => {
    if (withoutTypes) delete window.ViewTransition.prototype.types;
    const seen = {};
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = (argument) => {
      seen.argument = typeof argument === 'function' ? 'function' : Object.keys(argument).join() + ':' + [...(argument.types ?? [])].join();
      const transition = start(argument);
      transition.ready.then(() => {
        const style = (pseudo) => getComputedStyle(document.documentElement, pseudo);
        seen.rootOldDisplay = style('::view-transition-old(root)').display;
        seen.rootNewAnimation = style('::view-transition-new(root)').animationName;
        seen.rootGroupAnimation = style('::view-transition-group(root)').animationName;
        seen.pageOldAnimation = style('::view-transition-old(agent-ui-page)').animationName;
        seen.pageNewAnimation = style('::view-transition-new(agent-ui-page)').animationName;
        seen.slotName = document.getElementById('app').style.viewTransitionName;
        seen.rootOldAnimation = style('::view-transition-old(root)').animationName;
      }, () => {});
      return transition;
    };
    await swap(() => { document.getElementById('app').textContent = 'new'; });
    await new Promise((resolve) => setTimeout(resolve, 700));
    seen.slotNameAfter = document.getElementById('app').style.viewTransitionName;
    seen.text = document.getElementById('app').textContent;
    seen.sheets = document.adoptedStyleSheets.length;
    return seen;
  };
</script></body></html>`;

const serve = async () => {
  const server = createServer((request, response) => {
    if (request.url.startsWith('/src/')) {
      response.setHeader('content-type', 'text/javascript');
      response.end(readFileSync(join(sourceDirectory, request.url.slice('/src/'.length))));
    } else {
      response.setHeader('content-type', 'text/html');
      response.end(page);
    }
  });
  await new Promise((resolveListening) => server.listen(0, '127.0.0.1', resolveListening));
  cleanups.push(() => server.close());
  return `http://127.0.0.1:${server.address().port}/`;
};

test('in Chrome only the page slot fades: the root shows the new page at once, the slot is named while the transition runs, and its name is gone after', { skip }, async () => {
  const { evaluate } = await browser.open(await serve());
  const seen = await evaluate('window.run().then((seen) => JSON.stringify(seen))').then(JSON.parse);
  assert.equal(seen.argument, 'update,types:agent-ui-page', 'the transition has the update and the type the rule is written for');
  assert.equal(seen.slotName, 'agent-ui-page', 'the slot was named while the transition ran');
  assert.equal(seen.rootOldDisplay, 'none', 'the old root picture is not shown');
  assert.equal(seen.rootNewAnimation, 'none', 'the new root picture does not fade in: the shell stays where it is');
  assert.equal(seen.rootGroupAnimation, 'none');
  assert.notEqual(seen.pageOldAnimation, 'none', `the old page fades out (${seen.pageOldAnimation})`);
  assert.notEqual(seen.pageNewAnimation, 'none', `the new page fades in (${seen.pageNewAnimation})`);
  assert.equal(seen.slotNameAfter, '', 'the name is taken off when the transition has finished');
  assert.equal(seen.text, 'new', 'and the page was swapped');
  assert.equal(seen.sheets, 1, 'the rule is one adopted stylesheet');
});

test('in Chrome without View Transition types the transition is the plain one: the update alone, nothing named, and the whole page cross-fades', { skip }, async () => {
  const { evaluate } = await browser.open(await serve());
  const seen = await evaluate('window.run({ withoutTypes: true }).then((seen) => JSON.stringify(seen))').then(JSON.parse);
  assert.equal(seen.argument, 'function');
  assert.equal(seen.slotName, '', 'nothing was named');
  assert.notEqual(seen.rootOldAnimation, 'none', `the root fades as the browser does by default (${seen.rootOldAnimation})`);
  assert.equal(seen.text, 'new');
  assert.equal(seen.sheets, 0, 'and no rule was added');
});
