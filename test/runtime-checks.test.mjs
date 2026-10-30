// The development checks of the runtime (src/runtime-checks.js) are replaced by a stub in production builds, but the real module can also be
// in a production build (`--validator=include`), and an app can be made with `dev: false` while it is. These tests run the same scenarios both
// ways, and keep the stub and the module in step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findElements } from './support/dom-shim.mjs';
import { mountSpec } from './support/helpers.mjs';
import * as checks from '../src/runtime-checks.js';
import * as stub from '../build/stubs/runtime-checks-omitted.js';

const { div, ul, li, state, each, when } = await import('../src/spec.js');

const quietly = async (run) => {
  const original = console.error;
  console.error = () => {};
  try {
    return await run();
  } finally {
    console.error = original;
  }
};
const rowCount = (root) => findElements(root, (element) => element.localName === 'li').length;
const sections = (ids) => ids.map((id) => ({ id }));
const page = (ids) => ({
  page: {
    state: { open: false, sections: sections(ids) },
    actions: {
      show: { args: {}, run: (store) => store.set('open', true) },
      setSections: { args: { ids: 'json' }, run: (store, { ids: next }) => store.set('sections', sections(next)) },
    },
  },
});
const shown = ul(null, each('page.sections', 'id', li(null, 'row')));

for (const dev of [true, false]) {
  test(`dev: ${dev}: a list with unique keys renders, in view and in a branch that opens later`, async () => {
    await quietly(async () => {
      const { ui, root } = mountSpec({ namespaces: page(['a', 'b']), spec: div(null, shown, when(state('page.open'), ul(null, each('page.sections', 'id', li(null, 'again'))))), dev });
      await ui.settle();
      assert.equal(rowCount(root), 2);
      ui.dispatch('page.show');
      await ui.settle();
      assert.equal(rowCount(root), 4);
      assert.deepEqual(ui.errors, []);
    });
  });

  test(`dev: ${dev}: a duplicate key keeps the first item, skips the later one and is reported once the list renders`, async () => {
    await quietly(async () => {
      const { ui, root } = mountSpec({ namespaces: page(['a', 'a', 'b']), spec: div(null, shown), dev });
      await ui.settle();
      assert.equal(rowCount(root), 2);
      assert.equal(ui.errors.length, 1);
      assert.match(ui.errors[0], /^duplicate key a in 0\.0\.0 /);
    });
  });

  test(`dev: ${dev}: a duplicate in a branch is reported when the branch opens${dev ? ', and already found at mount' : ''}, never twice`, async () => {
    await quietly(async () => {
      const { ui } = mountSpec({ namespaces: page(['a', 'a']), spec: div(null, when(state('page.open'), shown)), dev });
      await ui.settle();
      assert.equal(ui.errors.length, dev ? 1 : 0);
      ui.dispatch('page.show');
      await ui.settle();
      assert.equal(ui.errors.length, 1);
      ui.dispatch('page.setSections', { ids: ['a', 'b'] });
      ui.dispatch('page.setSections', { ids: ['c', 'c'] });
      await ui.settle();
      assert.equal(ui.errors.length, 2);
    });
  });
}

test('the stub that production builds use exports exactly what the module does, and does nothing', () => {
  assert.deepEqual(Object.keys(stub).sort(), Object.keys(checks).sort());
  assert.equal(stub.consumeCheckedListProblem(new Map([['0|AUI0303|a|0|1', 1]]), 'AUI0303', { path: '0', value: 'a', first: 0, second: 1 }), false);
  assert.equal(stub.checkEachKeys(), undefined);
});

test('the module can be given nothing for the record of a list that dev: false does not keep', () => {
  assert.equal(checks.consumeCheckedListProblem(null, 'AUI0303', { path: '0', value: 'a', first: 0, second: 1 }), false);
  assert.equal(checks.forgetCheckedListProblems(null, '0'), undefined);
  assert.equal(checks.checkEachKeys({}, () => [], new Set(), null, () => assert.fail('nothing is reported')), undefined);
});

// Rule 13: every stub of build/stubs/ exports the names of the module it replaces, or an import that works in development breaks in a production build.
const STUBS = {
  'error-messages': 'error-messages-omitted',
  hot: 'hot-omitted',
  'pages-checks': 'pages-checks-omitted',
  'pages-server': 'pages-server-omitted',
  'runtime-checks': 'runtime-checks-omitted',
  'shell-checks': 'shell-checks-omitted',
  'spec-checks': 'spec-checks-omitted',
  'sync-apps-checks': 'sync-apps-checks-omitted',
  validate: 'validate-omitted',
  'window-events-checks': 'window-events-checks-omitted',
};
for (const [source, replacement] of Object.entries(STUBS)) {
  test(`build/stubs/${replacement}.js exports exactly the names of src/${source}.js`, async () => {
    const real = await import(`../src/${source}.js`);
    const stubbed = await import(`../build/stubs/${replacement}.js`);
    assert.deepEqual(Object.keys(stubbed).sort(), Object.keys(real).sort());
  });
}

test('every file in build/stubs/ is listed above, so a new stub is held to the same rule', async () => {
  const { readdirSync } = await import('node:fs');
  const files = readdirSync(new URL('../build/stubs/', import.meta.url)).map((file) => file.replace(/\.js$/, ''));
  assert.deepEqual(files.sort(), Object.values(STUBS).sort());
});

test('decodeError refuses an error that is not one of ours, and reads the code and details of a production error; the production stub decodes nothing', async () => {
  const real = await import('../src/error-messages.js');
  const stubbed = await import('../build/stubs/error-messages-omitted.js');
  const notOurs = Object.assign(new Error('no such file'), { code: 'ENOENT' });
  assert.equal(real.decodeError(notOurs), null);
  const decoded = real.decodeError('AUI0103 {"operation":"get","key":"a.b"}');
  assert.equal(decoded.code, 'AUI0103');
  assert.deepEqual(decoded.details, { operation: 'get', key: 'a.b' });
  assert.equal(stubbed.decodeError('AUI0103 {"key":"a"}'), null, 'a production build carries no prose: decode with the real module');
});
