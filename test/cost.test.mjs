// What an action, a page and a build cost, as numbers an agent can read and assert: measureAction and assertCost (test/support/helpers.mjs),
// the measurements and budgets of `agent-ui check` (cli/check.mjs) and the page budget of the build (build/build.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertCost, measureAction, mountSpec } from './support/helpers.mjs';
import { checkConfig } from '../build/config-check.mjs';
import { measureOutline } from '../cli/check.mjs';

const { li, ul, each, item, span, classes, state } = await import('../src/spec.js');

const items = Array.from({ length: 50 }, (_, index) => ({ id: index + 1, title: `Item ${index + 1}`, done: false }));
const todos = (deriveRows) => ({
  todos: {
    state: { items },
    derive: { rows: deriveRows },
    actions: { toggle: { args: { id: 'number' }, run: (store, { id }) => store.set('items', store.get('items').map((entry) => (entry.id === id ? { ...entry, done: !entry.done } : entry))) } },
  },
});
const list = ul({ id: 'list' }, each('todos.rows', 'id', li({ classes: { done: item('done') } }, span(null, item('title')))));

test('measureAction counts what one action wrote: a toggle that keeps the other rows writes one class', async () => {
  // A derived list that returns the items it was given keeps their references, so only the changed row is written again.
  const { ui } = mountSpec({ namespaces: todos((get) => get('items')), spec: list });
  const measured = await measureAction(ui, 'todos.toggle', { id: 3 });
  assert.deepEqual({ ...measured, effectRuns: undefined }, { domWrites: 1, effectRuns: undefined, stateChanged: ['todos.items'], derivedChanged: ['todos.rows'], elements: 101, elementsBefore: 101 });
  assert.ok(measured.effectRuns < 10, `the list, the derived value and the one row's bindings run: ${measured.effectRuns}`);
  await assertCost(ui, 'todos.toggle', { id: 3 }, { domWrites: 1, effectRuns: 10, stateChanged: 1 });
});

test('assertCost fails a list whose every row runs again, says what it measured and where that cost comes from', async () => {
  // A derived list that builds a new object for every item on every change: every row gets a new item and its bindings run again,
  // though they write nothing (the values are the same). The DOM writes alone do not show it; the effect runs do.
  const { ui } = mountSpec({ namespaces: todos((get) => get('items').map((entry) => ({ ...entry, title: entry.title.toUpperCase() }))), spec: list });
  const measured = await measureAction(ui, 'todos.toggle', { id: 3 });
  assert.equal(measured.domWrites, 1, 'only the changed class is written');
  assert.ok(measured.effectRuns > 100, `every row's bindings ran: ${measured.effectRuns}`);
  await assert.rejects(assertCost(ui, 'todos.toggle', { id: 3 }, { effectRuns: 10 }), /^Error: assertCost\("todos\.toggle"\): effectRuns is \d+, over the limit of 10\. Bindings ran for rows that did not change: their items got new references/);
  await assert.rejects(assertCost(ui, 'todos.toggle', { id: 3 }, { derivedChanged: 0 }), /derivedChanged is 1 \(todos\.rows\), over the limit of 0\. A derived value that is recomputed with a new object every time/);
  await assert.rejects(assertCost(ui, 'todos.toggle', { id: 3 }, { domWrite: 2 }), /unknown limit "domWrite"\. Did you mean "domWrites"\? Allowed limits: domWrites, effectRuns, stateChanged, derivedChanged, elements/);
  await assert.rejects(assertCost(ui, 'todos.toggle', { id: 3 }), /pass the limits as the fourth argument/);
  await assert.rejects(measureAction(ui, 'todos.toggel', { id: 3 }), /measureAction\("todos\.toggel"\): unknown action todos\.toggel\. Did you mean "todos\.toggle"\?/);
});

test('measureOutline counts the elements of a rendered page and finds its largest list', () => {
  const outline = [{ id: 'main', tag: 'main', children: [{ id: 'list', tag: 'ul', children: [{ id: 'row', key: '1', tag: 'li' }, { id: 'row', key: '2', tag: 'li' }, { id: 'row', key: '3', tag: 'li' }] }, { id: 'other', tag: 'ul', children: [{ id: 'x', key: 'a', tag: 'li' }] }] }];
  assert.deepEqual(measureOutline(outline), { elements: 7, largestList: { rows: 3, inside: 'list' } });
  assert.deepEqual(measureOutline([]), { elements: 0, largestList: { rows: 0, inside: null } });
});

test('budgets in the build config: known limits, whole numbers, with the fix', () => {
  assert.deepEqual(checkConfig({ budgets: { pageGzipBytes: 30000, stateBytes: 50000, elements: 2000, listRows: 200 } }), []);
  assert.deepEqual(checkConfig({ budgets: { listRow: 5 } }), ['build config budgets key "listRow": unknown limit. Did you mean "listRows"? Allowed limits: pageGzipBytes, stateBytes, elements, listRows']);
  assert.deepEqual(checkConfig({ budgets: { elements: 0 } }), ['build config "budgets.elements": must be a whole number, 1 or more. Write budgets: { elements: 2000 }']);
  assert.match(checkConfig({ budgets: 5 })[0], /"budgets": must be an object of limits/);
});

test('a build over budgets.pageGzipBytes fails, naming the page and its startup chunks; check measures every page and holds it to its budgets', async () => {
  const { copyFixture } = await import('./copy-fixture.mjs');
  const { build } = await import('../build/build.mjs');
  const { loadConfig } = await import('../build/config.mjs');
  const { checkProject } = await import('../cli/check.mjs');
  const project = copyFixture('pages-site');
  try {
    const config = await loadConfig({ root: project.root });
    const manifest = build({ ...config, projectRoot: project.root, outDir: 'dist' });
    assert.ok(manifest.pages.index.startupSize.gzipBytes > 1000, 'the manifest says what a first visit downloads');
    assert.throws(() => build({ ...config, projectRoot: project.root, outDir: 'dist', budgets: { pageGzipBytes: 1000 } }), /^Error: budgets\.pageGzipBytes: page "counted" loads \d+\.\d KB gzip at startup \(agent-ui, .*\);.* page "index" loads .*over the budget of 1\.0 KB\. Read the chunk report/);
    const checked = await checkProject({ root: project.root, config: { ...config, budgets: { elements: 2, stateBytes: 10 } } });
    const home = checked.measurements.find((measured) => measured.url === '/');
    assert.deepEqual({ ...home, stateBytes: undefined }, { page: '/', url: '/', elements: 3, listRows: 0, listInside: null, stateBytes: undefined });
    assert.ok(checked.problems.includes('/ /: renders 3 elements, over budgets.elements 2. Show less at once (a summary, a page of the data, a branch that opens on request), or raise the budget'), JSON.stringify(checked.problems));
    assert.ok(checked.problems.some((problem) => /^\/ \/: the document carries \d+ bytes of state, over budgets\.stateBytes 10\. Load less on the server/.test(problem)));
  } finally {
    project.cleanup();
  }
});
