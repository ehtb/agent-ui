// The errors the runtime reports have a code and small details (src/error-messages.js, src/errors.js): a monitoring tool groups by the
// code and reads the details, the development build says what is wrong, and decodeError turns a production message back into the sentence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mountSpec, flushAsync } from './support/helpers.mjs';
import { createRoot } from './support/dom-shim.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { MESSAGES, decodeError, describeError } = await import('../src/error-messages.js');
const { codedError } = await import('../src/errors.js');
const { app } = await import('../src/ui.js');
const { div, ul, li, each, state } = await import('../src/spec.js');
const { mountElement } = await import('../src/mount-element.js');

const quiet = async (callback) => {
  const original = console.error;
  console.error = () => {};
  try {
    return await callback();
  } finally {
    console.error = original;
  }
};

const namespaces = {
  todos: {
    state: { draft: '', items: [{ id: 1 }, { id: 1 }] },
    actions: {
      add: { args: { text: 'string' }, run: (store, { text }) => store.set('draft', text) },
      boom: { args: {}, run: () => { throw new Error('it broke'); } },
      typo: { args: {}, run: (store) => store.get('drat') },
    },
  },
};

test('every code in the catalogue is documented, and every code the source uses is in the catalogue', () => {
  const documented = readFileSync(join(root, 'docs/API.md'), 'utf8');
  for (const [code, entry] of Object.entries(MESSAGES)) {
    assert.match(code, /^AUI\d{4}$/);
    assert.ok(entry.title && typeof entry.text === 'function', `${code} has a title and a text`);
    assert.ok(documented.includes(`| \`${code}\``), `${code} is in the error-code table of docs/API.md`);
  }
  const used = new Set();
  for (const file of readdirSync(join(root, 'src')).filter((name) => name.endsWith('.js') && name !== 'error-messages.js')) {
    for (const match of readFileSync(join(root, 'src', file), 'utf8').matchAll(/'(AUI\d{4})'/g)) used.add(match[1]);
  }
  assert.deepEqual([...used].filter((code) => !(code in MESSAGES)), [], 'a code that nothing describes');
  assert.deepEqual(Object.keys(MESSAGES).filter((code) => !used.has(code)), [], 'a code that nothing throws');
});

test('a reported error has a code and details; the development message is the sentence', async () => {
  const { ui } = mountSpec({ namespaces, spec: div(null, 'x') });
  const reports = [];
  ui.onError((report) => reports.push(report));
  await quiet(async () => {
    assert.equal(ui.dispatch('todos.nope', {}), 'unknown action todos.nope. Did you mean "todos.boom"? Actions are written namespace.verb: todos.add, todos.boom, todos.typo');
    assert.equal(ui.dispatch('todos.add', { text: 3 }), 'todos.add.text: want string, got number');
    assert.equal(ui.dispatch('todos.boom', {}), 'todos.boom: it broke');
    assert.match(ui.dispatch('todos.typo', {}), /^todos\.typo: store\.get\("drat"\): namespace "todos" has no state key or derived value "drat"\. Did you mean "draft"\?/);
  });
  assert.deepEqual(reports.map((report) => report.code), ['AUI0202', 'AUI0203', 'AUI0201', 'AUI0201']);
  assert.deepEqual(reports[0].details, { action: 'todos.nope' });
  assert.deepEqual(reports[1].details, { action: 'todos.add', argument: 'text', expected: 'string', got: 'number' });
  assert.deepEqual(reports[2].details, { action: 'todos.boom', cause: 'it broke' });
  assert.equal(reports[2].message, 'todos.boom: it broke');
  assert.ok(reports[2].app === ui && reports[2].error instanceof Error);
  assert.deepEqual(ui.errors, reports.map((report) => report.message));
});

test('the handlers of onError see the action that was running, can be removed, and cannot break the app', async () => {
  const { ui } = mountSpec({ namespaces, spec: div(null, 'x') });
  const seen = [];
  const stop = ui.onError((report) => seen.push(report.action));
  ui.onError(() => { throw new Error('the monitoring tool is down'); });
  const logged = [];
  const original = console.error;
  console.error = (message) => logged.push(message);
  try {
    ui.dispatch('todos.boom', {});
    stop();
    ui.dispatch('todos.boom', {});
  } finally {
    console.error = original;
  }
  assert.deepEqual(seen, ['todos.boom'], 'a removed handler hears nothing more');
  assert.ok(logged.some((message) => /onError handler threw: the monitoring tool is down/.test(message)));
  assert.equal(ui.errors.length, 2, 'the app kept working and kept reporting');
});

test('an update that throws and a plugin that reports an error reach the handlers too', async () => {
  const spec = ul(null, each('todos.items', 'id', li(null, state('todos.draft'))));
  const { ui } = await quiet(async () => mountSpec({ namespaces, spec }));
  const reports = [];
  ui.onError((report) => reports.push(report.code));
  // A derived value that throws during an update is the effect's error: it carries its own code.
  const withDerived = mountSpec({
    namespaces: { box: { state: { rows: [{ name: 'ab' }] }, derive: { first: (get) => get('rows')[0].name.length }, actions: { clear: { args: {}, run: (store) => store.set('rows', []) } } } },
    spec: div(null, state('box.first')),
  }).ui;
  const derivedReports = [];
  withDerived.onError((report) => derivedReports.push(report));
  await quiet(async () => {
    withDerived.dispatch('box.clear', {});
    await flushAsync(withDerived);
  });
  assert.ok(derivedReports.length >= 1);
  assert.equal(derivedReports[0].code, 'AUI0108');
  assert.match(derivedReports[0].message, /^derived "box\.first": /);
  // A plugin hands over what it caught.
  await quiet(async () => ui.report(Object.assign(new Error('chart failed'), { code: 'AUI0401', details: { where: 'chart', id: 'c', phase: 'mount', cause: 'chart failed' } })));
  ui.report(new Error('no code of its own'));
  assert.deepEqual(reports, ['AUI0401', 'AUI0304']);
});

test('mountElement reports a mount that throws as AUI0401 with the element and the phase', async () => {
  const reports = [];
  const { ui } = mountSpec({
    namespaces: {},
    spec: div(null, div({ id: 'chart' })),
    plugins: [(api) => { mountElement(api, 'chart', () => { throw new Error('no canvas'); }); api.onError((report) => reports.push(report)); }],
  });
  await quiet(async () => flushAsync(ui));
  assert.equal(reports[0]?.code, 'AUI0401');
  assert.deepEqual(reports[0].details, { where: reports[0].details.where, id: 'chart', phase: 'mount', cause: 'no canvas' });
  assert.match(reports[0].message, /mount of "chart" threw: no canvas$/);
});

test('decodeError turns the production form back into the sentence, and says what it cannot know', () => {
  const error = codedError('AUI0104', { operation: 'store.set', key: 'search.query', namespace: 'search', action: 'todos.add', actionNamespace: 'todos' }, { callable: ['search.clear'] });
  assert.match(error.message, /state key "search\.query" belongs to namespace "search".*\(search\.clear\)/, 'the development message has the context');
  const decoded = decodeError(`${error.code} ${JSON.stringify(error.details)}`);
  assert.equal(decoded.code, 'AUI0104');
  assert.equal(decoded.title, 'an action wrote the state of another namespace');
  assert.match(decoded.text, /belongs to namespace "search"/);
  assert.doesNotMatch(decoded.text, /search\.clear/, 'what only the development build knew (the actions to call) is not invented');
  assert.equal(decodeError(error).text, decoded.text, 'an Error object decodes through its code and details');
  // the names that exist are left out, not made up
  assert.equal(decodeError('AUI0103 {"operation":"get","key":"todos.drat","fromNamespace":null}').text, 'get("todos.drat"): namespace "todos" has no state key or derived value "drat"');
  assert.deepEqual(decodeError('AUI9999 {"a":1}'), { code: 'AUI9999', details: { a: 1 }, title: null, text: null });
  assert.equal(decodeError('AUI0202').text, null, 'details are missing');
  assert.equal(decodeError('something else'), null);
  assert.equal(decodeError(undefined), null);
  assert.equal(describeError('AUI0301', { prop: 'href' }), 'blocked unsafe URL in href');
});

test('app() reports its errors from the list of codes: a blocked URL, a key without a value, a duplicate key', async () => {
  const reports = [];
  const root = createRoot();
  const ui = app({ dev: true,
    namespaces: { t: { state: { rows: [{ id: 1 }, { id: 1 }, {}], url: 'javascript:alert(1)' } } },
    spec: div(null, { tag: 'a', props: { href: { state: 't.url' }, 'aria-label': 'x' } }, ul(null, each('t.rows', 'id', li(null, 'r')))),
    root,
    plugins: [(api) => api.onError((report) => reports.push([report.code, report.details]))],
  });
  await quiet(async () => ui.settle());
  assert.deepEqual(reports.map(([code]) => code).sort(), ['AUI0301', 'AUI0302', 'AUI0303']);
  assert.deepEqual(reports.find(([code]) => code === 'AUI0303')[1], { value: 1, path: reports.find(([code]) => code === 'AUI0303')[1].path, key: 'id', source: 't.rows', first: 0, second: 1 });
});

test('decodeError decodes the error a wrapper carries, and report keeps only codes of agent-ui', async () => {
  const inner = codedError('AUI0103', { operation: 'store.get', key: 'todos.drat', fromNamespace: 'todos' });
  const wrapped = `AUI0201 ${JSON.stringify({ action: 'todos.typo', cause: `${inner.code} ${JSON.stringify(inner.details)}` })}`;
  assert.equal(decodeError(wrapped).text, 'todos.typo: store.get("drat"): namespace "todos" has no state key or derived value "drat"');
  assert.equal(decodeError('AUI0201 {"action":"a.b","cause":"it broke"}').text, 'a.b: it broke', 'a cause that is plain text stays as it is');

  const { ui } = mountSpec({ namespaces, spec: div(null, 'x') });
  const reports = [];
  ui.onError((report) => reports.push([report.code, report.details]));
  await quiet(async () => {
    ui.report(Object.assign(new Error('file missing'), { code: 'ENOENT' }));
    ui.report(Object.assign(new Error('x'), { code: 'AUI9999', details: { a: 1 } }));
  });
  assert.deepEqual(reports, [['AUI0304', { message: 'file missing' }], ['AUI9999', { a: 1 }]], 'a foreign code becomes AUI0304; a code of the AUI form is kept');
});
