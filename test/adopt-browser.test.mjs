// An app that takes over server markup, in a real browser (headless Chrome over the DevTools protocol, test/support/browser.mjs; the test
// skips itself where there is none). The shim cannot show what a browser's HTML parser does with the markup: it joins texts, drops empty
// ones, and rewrites some nestings. Here the markup of a real server render is served as a page, and the app takes it over.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome, launchBrowser } from './support/browser.mjs';
import { createServerDocument, serialize } from '../src/server-dom.js';

const { app } = await import('../src/ui.js');
const { div, h1, p, span, ul, li, table, tbody, tr, td, state, each, when } = await import('../src/spec.js');

const sourceDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const browser = await launchBrowser();
const cleanups = [];
after(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  await browser?.close();
});
const skip = browser ? false : 'no Chrome found (set CHROME_PATH)';

// The page: the markup of a server render inside #app, the scenario as data, and a module that starts the app on it with adopt: true.
const pageFor = ({ namespaces, spec, markup, initialState, specChecked = false }) => `<!doctype html>
<html><head><meta charset="utf-8"><title>adopt</title></head>
<body><div id="app">${markup}</div>
<script type="application/json" id="scenario">${JSON.stringify({ namespaces, spec, initialState, specChecked }).replace(/</g, '\\u003c')}</script>
<script type="module">
  import { app } from '/src/ui.js';
  const { namespaces, spec, initialState, specChecked } = JSON.parse(document.getElementById('scenario').textContent);
  app({ namespaces, spec, initialState, specChecked, root: document.getElementById('app'), dev: true, adopt: true });
</script></body></html>`;

const serve = async (html) => {
  const server = createServer((request, response) => {
    if (request.url.startsWith('/src/')) {
      response.setHeader('content-type', 'text/javascript');
      response.end(readFileSync(join(sourceDirectory, request.url.slice('/src/'.length))));
    } else {
      response.setHeader('content-type', 'text/html');
      response.end(html);
    }
  });
  await new Promise((resolveListening) => server.listen(0, '127.0.0.1', resolveListening));
  cleanups.push(() => server.close());
  return `http://127.0.0.1:${server.address().port}/`;
};

// What the page does while it starts: every element added to or removed from the document after the browser has read it.
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

const serverMarkup = ({ namespaces, spec, initialState, specChecked = false }) => {
  const root = createServerDocument().createElement('div');
  const ui = app({ namespaces, spec, initialState, specChecked, root, dev: false });
  const markup = serialize(root);
  ui.destroy();
  return markup;
};

const shop = { shop: { state: { title: 'Shop', count: 2, note: '', items: [{ id: 'a', name: 'Apple' }, { id: 'b', name: 'Pear' }], open: true } } };
const page = div(
  { id: 'root' },
  h1({ id: 'title' }, 'Hello, ', state('shop.title'), '!'),
  p({ id: 'note' }, state('shop.note')),
  p({ id: 'count' }, 'Count: ', state('shop.count'), ' items'),
  ul({ id: 'list' }, each('shop.items', 'id', li({ id: 'row' }, span({ id: 'name' }, state('shop.title')), ' - ', 'item'))),
  when(state('shop.open'), div({ id: 'panel' }, 'open'), p({ id: 'closed' }, 'closed')),
);
const run = async (scenario, browserState) => {
  const markup = serverMarkup({ ...scenario, initialState: scenario.initialState });
  const url = await serve(pageFor({ ...scenario, markup, initialState: browserState ?? scenario.initialState }));
  const opened = await browser.open(url, { beforeLoad: watch });
  await opened.evaluate('window.__ui.settle().then(() => true)');
  return { ...opened, changes: await opened.evaluate('window.__changes'), text: (id) => opened.evaluate(`document.querySelector('[data-id="${id}"]').textContent`), reported: opened.report.console.filter((line) => /AUI0305|differs from the markup/.test(line)) };
};

test('in Chrome the page takes over the markup the server wrote: no element is added or removed, the texts a parser joined are taken apart, and the page works', { skip }, async () => {
  const { changes, text, reported, evaluate } = await run({ namespaces: shop, spec: page });
  assert.deepEqual(changes, [], 'no element was added or removed');
  assert.deepEqual(reported, []);
  assert.equal(await text('title'), 'Hello, Shop!');
  assert.equal(await text('count'), 'Count: 2 items');
  assert.equal(await evaluate(`document.querySelector('[data-id="title"]').childNodes.length`), 5, 'three texts and the two separators the server wrote between them');
  assert.equal(await evaluate(`window.__ui.dispatch('shop.nope') === undefined`), false, 'the app answers (an unknown action is reported)');
});

test('in Chrome a value that differs is written where it stands; a branch that differs is made again alone, and reported', { skip }, async () => {
  const values = await run({ namespaces: shop, spec: page }, { shop: { title: 'Store', count: 9 } });
  assert.deepEqual(values.changes, [], 'a value is written in its text node: no element changed');
  assert.deepEqual(values.reported, [], 'and a value that differs is not a report');
  assert.equal(await values.text('title'), 'Hello, Store!');
  assert.equal(await values.text('count'), 'Count: 9 items');

  const branch = await run({ namespaces: shop, spec: page }, { shop: { open: false } });
  assert.ok(branch.changes.includes('removed div panel') && branch.changes.includes('added p closed'), branch.changes.join(', '));
  assert.ok(branch.changes.every((change) => /panel|closed/.test(change)), `nothing else was touched: ${branch.changes.join(', ')}`);
  assert.equal(branch.reported.length, 1);
  assert.match(branch.reported[0], /AUI0305|the first render differs from the markup the server wrote/);
  assert.equal(await branch.text('closed'), 'closed');
  assert.equal(await branch.evaluate(`document.querySelector('[data-id="panel"]')`), null);
});

test('in Chrome a nesting the HTML parser rewrites (a row straight in a table) ends as the tree of the spec, with the browser\'s tbody gone and the difference reported', { skip }, async () => {
  // A spec the validator refuses (specChecked skips the validator, as a production build does): the server writes <table><tr>, and the parser inserts a <tbody>.
  const namespaces = { shop: { state: { label: 'cell' } } };
  const spec = div({ id: 'root' }, table({ id: 'grid' }, tr({ id: 'line' }, td({ id: 'cell' }, state('shop.label')))), p({ id: 'after' }, 'after'));
  const rewritten = await run({ namespaces, spec, specChecked: true });
  assert.equal(await rewritten.evaluate(`document.querySelector('[data-id="grid"]').children.length`), 1);
  assert.equal(await rewritten.evaluate(`document.querySelector('[data-id="grid"]').firstElementChild.dataset.id`), 'line', 'the table holds the row the spec says, and the tbody the parser made is gone');
  assert.equal(await rewritten.text('cell'), 'cell');
  assert.equal(await rewritten.text('after'), 'after', 'what follows the table was taken over');
  assert.equal(rewritten.reported.length, 1, 'and the browser said the markup was not what its render made');
  assert.ok(rewritten.changes.includes('added tr line') && rewritten.changes.includes('removed tbody '), rewritten.changes.join(', '));
  assert.ok(!rewritten.changes.some((change) => /after|grid|root/.test(change)), `the root, the table and what follows were kept (the row and its cell are made again with the row): ${rewritten.changes.join(', ')}`);

  const proper = table({ id: 'grid' }, tbody({ id: 'body' }, tr({ id: 'line' }, td({ id: 'cell' }, state('shop.label')))));
  const kept = await run({ namespaces, spec: div({ id: 'root' }, proper, p({ id: 'after' }, 'after')) });
  assert.deepEqual(kept.changes, [], 'the same table written the way a parser keeps it is taken over whole');
  assert.deepEqual(kept.reported, []);
});
