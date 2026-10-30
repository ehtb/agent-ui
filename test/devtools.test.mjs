// The debug console (src/devtools.js): the browser console shows the state at the start and one collapsed group per action.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountSpec } from './support/helpers.mjs';

const { mountDevtools } = await import('../src/devtools.js');
const { div } = await import('../src/spec.js');

const namespaces = {
  todos: {
    state: { draft: '', items: [] },
    derive: { count: (get) => get('items').length },
    actions: {
      setDraft: { args: { text: 'string' }, run: (store, { text }) => store.set('draft', text) },
      add: { args: {}, run: (store) => { store.set('items', [...store.get('items'), { id: store.get('items').length + 1, title: store.get('draft') }]); store.set('draft', ''); } },
      nothing: { args: {}, run() {} },
    },
  },
};

const captureConsole = async (callback) => {
  const calls = [];
  const original = {};
  for (const method of ['groupCollapsed', 'groupEnd', 'log', 'table']) {
    original[method] = console[method];
    console[method] = (...parts) => calls.push([method, ...parts]);
  }
  try {
    await callback();
  } finally {
    Object.assign(console, original);
  }
  return calls;
};

test('mountDevtools writes the state as a table at the start and a collapsed group for every action, with what it changed', async () => {
  const { ui } = mountSpec({ namespaces, spec: div(null, 'x') });
  let stop;
  const start = await captureConsole(async () => { stop = mountDevtools(ui); });
  assert.equal(start.find(([method]) => method === 'groupCollapsed')[1].includes('debug console on'), true);
  assert.deepEqual(start.find(([method]) => method === 'table')[1], { 'todos.draft': { value: '' }, 'todos.items': { value: [] } });

  const calls = await captureConsole(async () => {
    ui.dispatch('todos.setDraft', { text: 'milk' });
    ui.dispatch('todos.add', {});
    ui.dispatch('todos.nothing', {});
  });
  const groups = calls.filter(([method]) => method === 'groupCollapsed').map(([, format, ...styles]) => format);
  assert.equal(groups.length, 3);
  assert.match(groups[0], /todos\.setDraft/);
  assert.match(groups[0], /1 changed/);
  assert.match(groups[2], /no change/);
  assert.equal(calls.filter(([method]) => method === 'groupEnd').length, 3, 'every group is closed');

  const lines = calls.filter(([method]) => method === 'log').map(([, ...parts]) => parts);
  assert.ok(lines.some(([format, , , before, arrow, after]) => /todos\.draft/.test(format) && before === '' && arrow === '→' && after === 'milk'), 'a primitive shows before → after');
  const itemsLine = lines.find(([format]) => /todos\.items/.test(format));
  assert.deepEqual(itemsLine[3], { before: [], after: [{ id: 1, title: 'milk' }] }, 'a list is an object to expand in the console');
  assert.ok(lines.some(([format, , , before, , after]) => /todos\.count/.test(format) && before === 0 && after === 1), 'derived values that changed are shown too');

  stop();
  const afterStop = await captureConsole(async () => { ui.dispatch('todos.nothing', {}); });
  assert.deepEqual(afterStop, [], 'a stopped console writes nothing');
});

test('a replay is not written action by action', async () => {
  const { ui } = mountSpec({ namespaces, spec: div(null, 'x') });
  await captureConsole(async () => mountDevtools(ui));
  ui.dispatch('todos.setDraft', { text: 'a' });
  const calls = await captureConsole(async () => { await ui.replay([['todos.setDraft', { text: 'b' }]]); });
  assert.deepEqual(calls, []);
});

test('onAction hears each logged action once, and a handler that throws does not stop the others', async () => {
  const { ui } = mountSpec({ namespaces, spec: div(null, 'x') });
  const heard = [];
  ui.onAction(() => { throw new Error('broken handler'); });
  const stop = ui.onAction(({ name, args, replaying }) => heard.push([name, args, replaying]));
  const original = console.error;
  console.error = () => {};
  try {
    ui.dispatch('todos.setDraft', { text: 'a' });
    ui.dispatch('todos.nope', {});
    stop();
    ui.dispatch('todos.setDraft', { text: 'b' });
  } finally {
    console.error = original;
  }
  assert.deepEqual(heard, [['todos.setDraft', { text: 'a' }, false]], 'a failed dispatch is not an action; a removed handler hears nothing');
});

test('debug: true makes the app mount the console by itself; anything else is refused', async () => {
  const { app } = await import('../src/ui.js');
  const { createRoot } = await import('./support/dom-shim.mjs');
  const calls = await captureConsole(async () => {
    const ui = app({ dev: true, namespaces, spec: div(null, 'x'), root: createRoot(), debug: true });
    await new Promise((resolve) => setTimeout(resolve, 20)); // the console's code is fetched on demand
    ui.dispatch('todos.setDraft', { text: 'hello' });
  });
  assert.ok(calls.some(([method, format]) => method === 'groupCollapsed' && /debug console on/.test(format)));
  assert.ok(calls.some(([method, format]) => method === 'groupCollapsed' && /todos\.setDraft/.test(format)));
  const silent = await captureConsole(async () => {
    const ui = app({ dev: true, namespaces, spec: div(null, 'x'), root: createRoot() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    ui.dispatch('todos.setDraft', { text: 'hello' });
  });
  assert.deepEqual(silent, [], 'without the flag the console stays quiet');
  assert.throws(() => app({ dev: true, namespaces, spec: div(null, 'x'), root: createRoot(), debug: 'yes' }), /app: debug is "yes"\. Write debug: true/);
  const destroyed = await captureConsole(async () => {
    const ui = app({ dev: true, namespaces, spec: div(null, 'x'), root: createRoot(), debug: true });
    ui.destroy();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  assert.deepEqual(destroyed, [], 'an app destroyed before the console loaded does not get one');
});

test('a page and a shell take the flag too, and refuse a value that is not a boolean', async () => {
  const { definePage } = await import('../src/pages.js');
  const { defineShell } = await import('../src/shell.js');
  const { createRoot, createWindow } = await import('./support/dom-shim.mjs');
  const definition = definePage({ head: { title: 't' }, debug: true }, { path: '/', view: div({ id: 'p' }, 'x') });
  const calls = await captureConsole(async () => {
    definition.create({ root: createRoot(), win: createWindow('/'), fetchFunction: null, dev: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  assert.ok(calls.some(([method, format]) => method === 'groupCollapsed' && /debug console on/.test(format)));
  assert.throws(() => definePage({ head: { title: 't' }, debug: 'yes' }, { path: '/', view: div({ id: 'p' }, 'x') }).create({ root: createRoot(), win: createWindow('/'), fetchFunction: null, dev: true }), /debug is "yes"/);
  assert.doesNotThrow(() => defineShell({ name: 'main', debug: true }));
});

test('only debug: true turns the console on: a cookie, however it is spelt, decides nothing', async () => {
  const { app } = await import('../src/ui.js');
  const { createRoot } = await import('./support/dom-shim.mjs');
  const written = async (options) => {
    const calls = await captureConsole(async () => {
      const ui = app({ dev: true, namespaces, spec: div(null, 'x'), root: createRoot(), ...options });
      await new Promise((resolve) => setTimeout(resolve, 20));
      ui.dispatch('todos.setDraft', { text: 'hi' });
    });
    return calls.some(([method, format]) => method === 'groupCollapsed' && /todos\.setDraft/.test(format));
  };
  const hadDocument = 'document' in globalThis;
  const previous = globalThis.document;
  try {
    for (const cookie of ['debugAgentUI=1', 'theme=dark; debugAgentUI=true; lang=nl', '']) {
      globalThis.document = Object.assign(Object.create(previous), { cookie });
      assert.equal(await written({}), false, `cookie "${cookie}" without debug`);
    }
    globalThis.document = Object.assign(Object.create(previous), { cookie: 'debugAgentUI=1' });
    assert.equal(await written({ debug: false }), false);
    assert.equal(await written({ debug: true }), true, 'debug: true needs nothing else');
    assert.throws(() => app({ dev: true, namespaces, spec: div(null, 'x'), root: createRoot(), debug: null }), /debug is null/);
  } finally {
    if (hadDocument) globalThis.document = previous;
    else delete globalThis.document;
  }
});

test('the server never writes the debug console, whatever the page says', async () => {
  const { definePage } = await import('../src/pages.js');
  const { renderPage } = await import('../server/render-page.js');
  const definition = definePage({ head: { title: 't' }, debug: true, namespaces }, { path: '/', view: div({ id: 'p' }, 'x') });
  const calls = await captureConsole(async () => {
    await renderPage(definition.create, { dev: false, url: '/' });
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  assert.deepEqual(calls, []);
  const inBrowser = await captureConsole(async () => {
    const { createRoot, createWindow } = await import('./support/dom-shim.mjs');
    definition.create({ root: createRoot(), win: createWindow('/'), fetchFunction: null, dev: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  assert.ok(inBrowser.length > 0, 'a browser environment leaves the decision to the page');
});
