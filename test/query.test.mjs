// The query of the URL as state: route.query, written with route.setQuery and route.clearQuery, filled from the URL's
// search on every start (server render, browser, soft navigation), and kept in step with the address in the browser
// (replaceState, so the back button stays a page). The tests run the page on the test DOM and render one on the server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoot, createWindow, findElements } from '@ehtb/agent-ui/testing/dom-shim.mjs';
import { assertNoErrors } from '@ehtb/agent-ui/testing/helpers.mjs';
import { definePage } from '../src/pages.js';
import { renderPage, destroyApps } from '../server/render-page.js';

const { section, ul, li, each, item, state, button, act } = await import('../src/spec.js');

// A window with a history: the URL sync needs one, and the test watches what it writes.
const createQueryWindow = (path, search = '') => {
  const win = createWindow(path, search);
  const written = [];
  win.history = {
    state: { existing: 'entry' },
    replaceState(state, title, url) {
      win.history.state = state;
      win.location.search = new URL(url ?? '', 'http://x').search;
      written.push(url);
    },
    pushState(state, title, url) {
      win.history.state = state;
      written.push(url);
    },
  };
  return { win, written };
};

const list = {
  state: { items: [{ id: 1, kind: 'a' }, { id: 2, kind: 'b' }, { id: 3, kind: 'a' }] },
  derive: {
    visible: (get) => {
      const kind = get('route.query').kind;
      return get('items').filter((item) => !kind || item.kind === kind);
    },
  },
};

const view = section(
  null,
  ul(null, each('list.visible', 'id', li({ classes: { picked: { equals: [item('kind'), state('route.query.kind')] } } }, item('kind')))),
  button({ id: 'show-a', on: { click: act('route.setQuery', { key: 'kind', value: 'a' }) } }, 'a'),
  button({ id: 'clear', on: { click: act('route.clearQuery', { key: 'kind' }) } }, 'all'),
);

const mount = (search) => {
  const { win, written } = createQueryWindow('/', search);
  const root = createRoot();
  const ui = definePage({ head: { title: 'T' }, namespaces: { list } }, { path: '/', view }).create({ root, dev: true, win });
  return { ui, root, written, win };
};
const rows = (root) => findElements(root, (element) => element.localName === 'li').map((element) => element.textContent);

test('route.query starts from the URL, and the actions write it and the address', async () => {
  const { ui, root, written, win } = mount('?kind=b');
  await ui.settle();
  assert.deepEqual(ui.state().route.query, { kind: 'b' });
  assert.deepEqual(rows(root), ['b'], 'the page shows what the URL asked for');

  ui.dispatch('route.setQuery', { key: 'kind', value: 'a' });
  await ui.settle();
  assert.deepEqual(ui.state().route.query, { kind: 'a' });
  assert.deepEqual(rows(root), ['a', 'a']);
  assert.deepEqual(written, ['/?kind=a'], 'the address follows the state');
  assert.equal(win.history.state.existing, 'entry', 'the history state the shell keeps is not wiped');

  ui.dispatch('route.clearQuery', { key: 'kind' });
  await ui.settle();
  assert.deepEqual(ui.state().route.query, {});
  assert.deepEqual(rows(root), ['a', 'b', 'a']);
  assert.deepEqual(written, ['/?kind=a', '/'], 'a cleared key leaves the URL');
  assertNoErrors(ui);
});

test('a key the URL repeats keeps all its entries until the page writes that key; the state reads the last one', async () => {
  const { ui, written } = mount('?tag=a&tag=b&kind=b');
  await ui.settle();
  assert.deepEqual(ui.state().route.query, { tag: 'b', kind: 'b' }, 'a repeated key reads as its last value');
  ui.dispatch('route.setQuery', { key: 'kind', value: 'a' });
  await ui.settle();
  assert.deepEqual(written, ['/?tag=a&tag=b&kind=a'], 'an unrelated change does not collapse the repeated key');
  ui.dispatch('route.clearQuery', { key: 'kind' });
  await ui.settle();
  assert.deepEqual(written.at(-1), '/?tag=a&tag=b');
  ui.dispatch('route.setQuery', { key: 'tag', value: 'c' });
  await ui.settle();
  assert.deepEqual(written.at(-1), '/?tag=c', 'writing the key sets it to the one value');
  ui.dispatch('route.clearQuery', { key: 'tag' });
  await ui.settle();
  assert.deepEqual(written.at(-1), '/');
  assertNoErrors(ui);
});

test('the query in a spec binding: a row is picked when its kind is the one the URL names', async () => {
  const { ui, root } = mount('?kind=a');
  await ui.settle();
  const picked = findElements(root, (element) => element.classNames.includes('picked')).map((element) => element.textContent);
  assert.deepEqual(picked, ['a', 'a']);
  assertNoErrors(ui);
});

test('replaying the log writes no address: the URL is not part of the log', async () => {
  const { ui, written } = mount('?kind=b');
  await ui.settle();
  ui.dispatch('route.setQuery', { key: 'kind', value: 'a' });
  await ui.settle();
  const afterDispatch = written.length;
  const log = ui.log.slice();
  await ui.replay(log);
  assert.equal(written.length, afterDispatch, 'replay leaves the address alone');
  assert.deepEqual(ui.state().route.query, { kind: 'a' });
});

test('a server render puts the query of the URL in the state and in the document', async () => {
  const { ui, root } = mount('?kind=b');
  const result = await renderPage(definePage({ head: { title: 'T' }, namespaces: { list } }, { path: '/', view }).create, {
    url: '/?kind=b',
    dev: true,
  });
  assert.deepEqual(result.state.route.query, { kind: 'b' });
  assert.ok(result.stateScript.includes('&quot;kind&quot;:&quot;b&quot;') || result.stateScript.includes('"kind":"b"'), 'the state script carries the query, so the browser starts from it');
  destroyApps(result.ui, result.shellApp);
});
