// Hot reload of `agent-ui dev` (cli/hot-reload.mjs, cli/hot-client.js, src/hot.js): after an edit the running page is swapped for the edited one,
// with the state it had, and a stylesheet is swapped without a page load. The first test needs no browser and reads what the dev server sends;
// the second drives a real Chrome (skipped without one: set CHROME_PATH).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { startDev } from '../cli/dev.mjs';
import { launchBrowser } from './support/browser.mjs';
import { copyFixture } from './copy-fixture.mjs';

const repository = resolve(import.meta.dirname, '..');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const createProject = () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-ui-hot-'));
  const write = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  mkdirSync(join(root, 'node_modules/@ehtb'), { recursive: true });
  symlinkSync(repository, join(root, 'node_modules/@ehtb/agent-ui'));
  write('package.json', '{"name":"hot-site","private":true,"type":"module"}');
  write('build.config.mjs', `
    import { frameworkBuildOptions } from '@ehtb/agent-ui/build/presets.mjs';
    export default ({ dev }) => ({ ...frameworkBuildOptions({ dev, projectRoot: import.meta.dirname }), outDir: 'dist' });
  `);
  write('pages/page.js', `export const page = {
    head: { title: 'Hot' },
    namespaces: { counter: { state: { count: 0 }, actions: { increment: { args: {}, run: (store) => store.set('count', store.get('count') + 1) } } } },
  };\n`);
  write('pages/view.js', `import { button, div, h1, state, act } from '@ehtb/agent-ui/spec';
export const view = div({ id: 'root' }, h1({ id: 'title' }, 'Hello v1'), div({ id: 'count' }, state('counter.count')), button({ id: 'inc', on: { click: act('counter.increment') } }, 'Add'));\n`);
  write('pages/page.css', '[data-id=title] { color: rgb(0, 0, 255); }\n');
  write('pages/other/page.js', "export const page = { head: { title: 'Other' } };\n");
  write('pages/other/view.js', "export const view = { tag: 'p', id: 'other', children: 'Other' };\n");
  write('pages/other/page.css', '@import "../../shared/part.css";\n[data-id=other] { color: rgb(0, 128, 0); }\n');
  write('shared/part.css', '.part { padding: 0; }\n');
  return { root, write, cleanup: () => rmSync(root, { recursive: true, force: true }) };
};

// The messages the dev server publishes, read from its event stream.
// The element with the spec address `id` (data-id), as an expression to evaluate in the page.
const el = (id) => `document.querySelector('[data-id="${id}"]')`;

const listen = async (port) => {
  const reader = (await fetch(`http://localhost:${port}/__dev/events`)).body.getReader();
  const messages = [];
  (async () => {
    const decoder = new TextDecoder();
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      for (const line of decoder.decode(chunk.value).split('\n\n')) if (line.startsWith('data: ')) messages.push(JSON.parse(line.slice(6)));
    }
  })().catch(() => {});
  return { messages, stop: () => reader.cancel() };
};
const waitFor = async (check, what) => {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (await check()) return;
    await sleep(50);
  }
  assert.fail(`timed out waiting for ${what}`);
};

test('the dev server puts a version in every chunk URL and tells the pages which entry or stylesheet changed, and when only a reload will do', async () => {
  const project = createProject();
  const dev = await startDev({ root: project.root, port: 0, quiet: true });
  const events = await listen(dev.server.address().port);
  try {
    const html = readFileSync(join(project.root, 'dist/index.html'), 'utf8');
    assert.match(html, /<script type="module" src="\/assets\/index\.js\?v=[0-9a-f]{8}"><\/script>/);
    assert.match(html, /<link rel="stylesheet" href="\/assets\/index\.css\?v=[0-9a-f]{8}">/);
    const entry = readFileSync(join(project.root, 'dist/assets/index.js'), 'utf8');
    assert.match(entry, /from "\.\/agent-ui\.js\?v=[0-9a-f]{8}"/);
    assert.match(readFileSync(join(project.root, 'dist/assets/agent-ui.js'), 'utf8'), /from "\.\/validator\.js\?v=[0-9a-f]{8}"/);
    await waitFor(() => events.messages.some((message) => message.hello), 'the greeting');

    await sleep(300); // a file system watcher can miss a change made in the first instants after it was created
    project.write('pages/view.js', readFileSync(join(project.root, 'pages/view.js'), 'utf8').replace('Hello v1', 'Hello v2'));
    await waitFor(() => events.messages.some((message) => Object.keys(message.entries ?? {}).length), 'the update after editing the view');
    const update = events.messages.find((message) => message.entries && Object.keys(message.entries).length);
    assert.equal(update.reload, false);
    assert.deepEqual(update.css, {}, 'the stylesheet did not change');
    assert.match(update.entries['/assets/index.js'].url, /^\/assets\/index\.js\?v=[0-9a-f]{8}$/);
    assert.equal(update.entries['/assets/index.js'].onlyEntry, true);
    assert.notEqual(update.entries['/assets/index.js'].url, html.match(/\/assets\/index\.js\?v=[0-9a-f]{8}/)[0], 'a new version, not the one the page was loaded with');

    const before = events.messages.length;
    project.write('pages/page.css', '[data-id=title] { color: rgb(255, 0, 0); }\n');
    await waitFor(() => events.messages.length > before && Object.keys(events.messages.at(-1).css).length, 'the update after editing the stylesheet');
    const cssUpdate = events.messages.at(-1);
    assert.equal(cssUpdate.reload, false);
    assert.deepEqual(Object.keys(cssUpdate.css), ['/assets/index.css']);

    // Making the page import the CSS that the other page already imports gives it a new shared <link>. The running
    // document cannot gain it by swapping the page's existing stylesheet, so the client must reload.
    const beforeStylesheet = events.messages.length;
    project.write('pages/page.css', '@import "../shared/part.css";\n[data-id=title] { color: rgb(255, 0, 0); }\n');
    await waitFor(() => events.messages.length > beforeStylesheet && events.messages.at(-1).reload, 'a reload after the page gained a shared stylesheet');

    const count = events.messages.length;
    project.write('pages/about/page.js', "export const page = { head: { title: 'About' } };\n");
    project.write('pages/about/view.js', "export const view = { tag: 'p', id: 'about', children: 'about' };\n");
    await waitFor(() => events.messages.length > count && events.messages.at(-1).reload, 'a reload after a page was added');
  } finally {
    await events.stop();
    dev.stop();
    project.cleanup();
  }
});

test('a custom assetsDir still hot-swaps: the assets directory is not mistaken for copied files', async () => {
  const project = createProject();
  project.write('build.config.mjs', `
    import { frameworkBuildOptions } from '@ehtb/agent-ui/build/presets.mjs';
    export default ({ dev }) => ({ ...frameworkBuildOptions({ dev, projectRoot: import.meta.dirname }), outDir: 'dist', assetsDir: 'static' });
  `);
  const dev = await startDev({ root: project.root, port: 0, quiet: true });
  const events = await listen(dev.server.address().port);
  try {
    await waitFor(() => events.messages.some((message) => message.hello), 'the greeting');
    await sleep(300);
    project.write('pages/view.js', readFileSync(join(project.root, 'pages/view.js'), 'utf8').replace('Hello v1', 'Hello v2'));
    await waitFor(() => events.messages.some((message) => Object.keys(message.entries ?? {}).length), 'the update after editing the view');
    const update = events.messages.find((message) => message.entries && Object.keys(message.entries).length);
    assert.equal(update.reload, false);
    assert.deepEqual(Object.keys(update.entries), ['/static/index.js']);
  } finally {
    await events.stop();
    dev.stop();
    project.cleanup();
  }
});

const browser = await launchBrowser();
after(async () => {
  await browser?.close();
});

test('in Chrome, an edit swaps the page with the state it had and swaps a stylesheet, without a page load; a page that cannot take the state starts afresh; an added page reloads', { skip: browser ? false : 'no Chrome found (set CHROME_PATH)' }, async () => {
  const project = createProject();
  const dev = await startDev({ root: project.root, port: 0, quiet: true });
  try {
    const page = await browser.open(`http://localhost:${dev.server.address().port}/`);
    await page.evaluate("window.__sameDocument = 'yes'");
    await page.click('[data-id="inc"]');
    await page.click('[data-id="inc"]');
    await page.settle();
    assert.equal(await page.evaluate(`${el('count')}.textContent`), '2');
    const loads = page.report.loads.length;
    const sameDocument = () => page.evaluate('window.__sameDocument');

    await sleep(500); // the event stream is connected and the watcher is ready
    project.write('pages/view.js', readFileSync(join(project.root, 'pages/view.js'), 'utf8').replace('Hello v1', 'Hello v2'));
    await page.until(`${el('title')}?.textContent === 'Hello v2'`, 'the edited view');
    assert.equal(await sameDocument(), 'yes', 'no page load');
    assert.equal(await page.evaluate(`${el('count')}.textContent`), '2', 'the state came along');
    assert.equal(await page.evaluate('window.__ui.state().counter.count'), 2);
    await page.click('[data-id="inc"]'); // the new app is the one that answers
    await page.settle();
    assert.equal(await page.evaluate(`${el('count')}.textContent`), '3');

    project.write('pages/page.css', '[data-id=title] { color: rgb(255, 0, 0); }\n');
    await page.until(`getComputedStyle(${el('title')}).color === 'rgb(255, 0, 0)'`, 'the edited stylesheet');
    assert.equal(await sameDocument(), 'yes', 'no page load for a stylesheet');
    assert.equal(await page.evaluate("document.querySelectorAll('link[rel=stylesheet]').length"), 1, 'the old stylesheet is gone');

    // A namespace whose key was renamed cannot take the old state: the page starts afresh, in the same document.
    project.write('pages/page.js', readFileSync(join(project.root, 'pages/page.js'), 'utf8').replace(/\bcount\b/g, 'total'));
    project.write('pages/view.js', readFileSync(join(project.root, 'pages/view.js'), 'utf8').replace("state('counter.count')", "state('counter.total')"));
    await page.until(`${el('count')}?.textContent === '0'`, 'the page to start afresh');
    assert.equal(await sameDocument(), 'yes');
    assert.equal(page.report.loads.length, loads, 'no navigation happened');
    assert.ok(page.report.console.some((line) => /did not accept the state it had/.test(line)), page.report.console.join(' | '));

    project.write('pages/about/page.js', "export const page = { head: { title: 'About' } };\n");
    project.write('pages/about/view.js', "export const view = { tag: 'p', id: 'about', children: 'about' };\n");
    await page.until("window.__sameDocument === undefined && !!window.__ui", 'a reload after a page was added');
  } finally {
    dev.stop();
    project.cleanup();
  }
});

test('in Chrome, a page with a shell: an edit of the page swaps it inside the kept shell, an edit of the shell reloads', { skip: browser ? false : 'no Chrome found (set CHROME_PATH)' }, async () => {
  const project = copyFixture('shell-site');
  const dev = await startDev({ root: project.root, port: 0, quiet: true });
  try {
    const page = await browser.open(`http://localhost:${dev.server.address().port}/`);
    await page.until(`${el('items')}?.children.length === 2`, 'the items');
    await page.evaluate(`window.__sameDocument = 'yes'; ${el('frame-header')}.__kept = 'yes'`);
    await sleep(500);
    project.write('pages/view.js', project.read('pages/view.js').replace("li(null, item('title'))", "li(null, join('Item: ', item('title')))").replace('each, item,', 'each, item, join,'));
    await page.until(`${el('items')}?.children[0]?.textContent === 'Item: Boots'`, 'the edited page');
    assert.equal(await page.evaluate('window.__sameDocument'), 'yes', 'no page load for an edit of the page');
    assert.equal(await page.evaluate(`${el('frame-header')}.__kept`), 'yes', 'the shell is the one that was there');

    // The shell is not swapped: its content changed, so the document is loaded again.
    project.write('shared/shell-view.js', project.read('shared/shell-view.js').replace("'Fixture site'", "'Fixture site 2'"));
    await page.until(`window.__sameDocument === undefined && ${el('frame-title')}?.textContent === 'Fixture site 2'`, 'a reload after the shell changed');
  } finally {
    dev.stop();
    project.cleanup();
  }
});

// HTTP/1.1 gives a host six connections. A page kept for Back/Forward that still held its event stream kept one of them, so after
// a few page loads the next one waited seconds for a connection to free up. The client closes the stream when the page is hidden
// and opens it again when the page comes back.
test('in Chrome, many page loads in a row do not wait for a connection, and a page restored by Back still hears edits', { skip: browser ? false : 'no Chrome found (set CHROME_PATH)' }, async () => {
  const project = createProject();
  const dev = await startDev({ root: project.root, port: 0, quiet: true });
  const events = await listen(dev.server.address().port);
  try {
    const origin = `http://localhost:${dev.server.address().port}`;
    const page = await browser.open(`${origin}/`);
    const timings = [];
    for (let load = 0; load < 10; load++) {
      const path = load % 2 ? '/' : '/other/';
      const started = performance.now();
      await page.send('Page.navigate', { url: `${origin}${path}` });
      await page.until(`location.pathname === '${path}' && document.readyState === 'complete' && !!window.__ui`, `the page ${path}`);
      timings.push(Math.round(performance.now() - started));
    }
    assert.ok(timings.every((ms) => ms < 1500), `every page load is quick, none waits for a connection: ${timings.join(', ')} ms`);

    // Edit /other/ while that page is hidden in the Back/Forward cache. The page's event stream is closed, so it misses the
    // broadcast; when it comes back, hello carries the new build number and the page loads it instead of showing stale content.
    const buildStarted = events.messages.length;
    project.write('pages/other/view.js', "export const view = { tag: 'p', id: 'other', children: 'Other v2' };\n");
    await waitFor(() => events.messages.length > buildStarted, 'the rebuild while /other/ is hidden');
    await page.evaluate("history.back()");
    await page.until(`location.pathname === '/other/' && ${el('other')}?.textContent === 'Other v2'`, 'the edit missed while the page was hidden');

    // A page restored by Back reconnects and still hears edits after that.
    const reconnectedAt = events.messages.length;
    project.write('pages/other/view.js', "export const view = { tag: 'p', id: 'other', children: 'Other v3' };\n");
    await waitFor(() => events.messages.length > reconnectedAt, 'the rebuild after reconnecting');
    await page.until(`${el('other')}?.textContent === 'Other v3'`, 'an edit after reconnecting');
  } finally {
    await events.stop();
    dev.stop();
    project.cleanup();
  }
});
