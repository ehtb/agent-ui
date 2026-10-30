// Regressions found in review: each test failed before its fix.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findByTag, fireEvent } from './support/dom-shim.mjs';
import { mountSpec, sleep } from './support/helpers.mjs';
import { select, option, ul, input, div, button, state, each, act } from '../src/spec.js';
import { definePage } from '../src/pages.js';
import { withHead } from '../src/head.js';
import { serialize } from '../src/server-dom.js';
import { defineElement, expandComponents } from '../src/components.js';
import { windowEvents } from '../src/window-events.js';
import { validate } from '../src/validate.js';
import { stripJavaScript, maskNonCode } from '../build/strip.mjs';


const filter = {
  state: { kind: '' },
  actions: { set: { args: { kind: 'string' }, run: (store, { kind }) => store.set('kind', kind) } },
};

test('an option with an empty value keeps value="" in the page and in server markup, and is the selected one', async () => {
  const { ui, root } = mountSpec({
    namespaces: { filter },
    spec: select({ 'aria-label': 'Kind', value: state('filter.kind') }, option({ value: '' }, 'All'), option({ value: 'a' }, 'A')),
  });
  await ui.settle();
  assert.equal(findByTag(root, 'option')[0].getAttribute('value'), '');
  assert.match(serialize(root), /<option data-id="0\.0" value selected>All<\/option>/);
});

test('a row that leaves with a transition does not make the rows around it jump', async () => {
  const { ui, root } = mountSpec({
    namespaces: {
      box: {
        state: { items: [{ id: 1 }, { id: 2 }, { id: 3 }] },
        actions: { drop: { args: { id: 'number' }, run: (store, { id }) => store.set('items', store.get('items').filter((entry) => entry.id !== id)) } },
      },
    },
    spec: ul({ id: 'list' }, each('box.items', 'id', { tag: 'li', transition: 30, children: [{ item: 'id' }] })),
  });
  await ui.settle();
  ui.dispatch('box.drop', { id: 2 });
  await ui.settle();
  assert.deepEqual(findByTag(root, 'li').map((element) => element.textContent), ['1', '2', '3'], 'the leaving row stays where it was');
  await sleep(60);
  assert.deepEqual(findByTag(root, 'li').map((element) => element.textContent), ['1', '3']);
});

test('watch is not called again for a write that an action rolled back, also when its callback dispatches an action', async () => {
  const { ui } = mountSpec({
    namespaces: {
      q: {
        state: { query: 'a', other: 0, seen: 0 },
        actions: {
          fail: { args: {}, run: (store) => { store.set('query', 'x'); throw new Error('boom'); } },
          bump: { args: {}, run: (store) => store.set('other', store.get('other') + 1) },
          look: { args: {}, run: (store) => store.set('seen', store.get('other')) }, // reads q.other with a tracked read
        },
      },
    },
    spec: div(null, 'x'),
  });
  const calls = [];
  ui.watch(['q.query'], (values) => { calls.push(values['q.query']); ui.dispatch('q.look'); });
  assert.deepEqual(calls, ['a']);
  ui.dispatch('q.fail');
  await ui.settle();
  assert.deepEqual(calls, ['a'], 'the rolled back write called nothing');
  ui.dispatch('q.bump');
  await ui.settle();
  assert.deepEqual(calls, ['a'], 'a key read by an action that the callback dispatches does not call it again');
});

test('windowEvents ignores events while a replay runs', async () => {
  const listeners = {};
  const target = { addEventListener: (type, listener) => (listeners[type] = listener), removeEventListener() {} };
  const { ui } = mountSpec({ namespaces: { filter }, spec: div(null, 'x'), plugins: [windowEvents(target, { resize: ['filter.set', { kind: 'r' }] })] });
  listeners.resize({});
  assert.equal(ui.state().filter.kind, 'r');
  ui.dispatch('filter.set', { kind: '' });
  Object.defineProperty(ui, 'replaying', { value: true });
  listeners.resize({});
  assert.equal(ui.state().filter.kind, '');
});

test('tree() and outline() report the checked state of radio buttons as they do for checkboxes', async () => {
  const { ui } = mountSpec({
    namespaces: { filter },
    spec: div(null, input({ id: 'pick', type: 'radio', 'aria-label': 'Pick', checked: true, on: { change: act('filter.set', { kind: 'r' }) } })),
  });
  await ui.settle();
  assert.equal(ui.tree().find((entry) => entry.id === 'pick').checked, true);
  assert.match(JSON.stringify(ui.outline()), /"checked":true/);
});

test('stripJavaScript and maskNonCode read a / after ++ or -- as division', () => {
  const code = 'let a = 4; let result = a++ / 2 / 1; let b = a-- / 5 / 1;';
  assert.equal(new Function(`${stripJavaScript(code)}\nreturn result;`)(), 2);
  assert.equal(stripJavaScript('let a = 1; let r = a+++ /["]/.source; // x\n'), 'let a = 1; let r = a+++ /["]/.source;\n', 'three signs end in a binary one: the slash starts a regex');
  assert.equal(maskNonCode(code), code, 'nothing of this code is a comment, string or regular expression');
});

test('components: an undefined param and a child passed as params say what to write', () => {
  const Card = defineElement('Card', { params: { title: { type: 'string' } }, spec: div(null, { param: 'title' }) });
  assert.throws(() => Card(div(null, 'x')), /Card\(\{ title: \.\.\. \}, child\)/);
  const Plain = defineElement('Plain', { params: [], spec: div(null, { slot: 'children' }) });
  assert.throws(() => Plain(div(null, 'x')), /Plain\(null, child\)/);
  const problems = (build) => { try { build(); } catch (error) { return error.message; } return ''; };
  const message = problems(() => expandComponents(div(null, Card({ title: undefined })), { Card }));
  assert.match(message, /param title is undefined/);
  assert.doesNotMatch(message, /must be a string/, 'one problem, said once');
});

test('components: a param named like a node key is a param, not a child element', () => {
  const Slotted = defineElement('Slotted', { params: ['slot'], spec: div(null, { param: 'slot' }) });
  assert.doesNotThrow(() => Slotted({ slot: 'x' }));
});

test('data-* and aria-* attribute names are checked, because the server writes them as markup', () => {
  assert.throws(() => div({ 'data-x" onclick="y': 'v' }, 'x'), /needs something after the prefix and no space, quote/);
  assert.throws(() => div({ 'aria-': 'v' }, 'x'), /needs something after the prefix/);
  assert.doesNotThrow(() => div({ 'data-row-id': '1', 'aria-hidden': 'true', 'data-é': 'ok' }, 'x'));
});

test('data-agent-ui-* names are the framework\'s: the builders and the validator refuse them', () => {
  assert.throws(() => div({ 'data-agent-ui-body': '0' }, 'x'), /"data-agent-ui-body" is reserved for the framework.*Use another data-\* name/);
  const problems = validate({ tag: 'div', props: { 'data-agent-ui-head': '0' }, children: 'x' });
  assert.match(problems.join('\n'), /props\.data-agent-ui-head: "data-agent-ui-head" is reserved for the framework/);
  assert.doesNotThrow(() => div({ 'data-agent-ui': 'ok', 'data-agent': 'ok' }, 'x'));
});

test('a row that is removed right after it was added keeps data-transition="leave" and ignores clicks', async () => {
  const { ui, root } = mountSpec({
    namespaces: {
      box: {
        state: { items: [{ id: 1 }], clicks: 0 },
        actions: {
          add: { args: {}, run: (store) => store.set('items', [...store.get('items'), { id: 2 }]) },
          drop: { args: { id: 'number' }, run: (store, { id }) => store.set('items', store.get('items').filter((entry) => entry.id !== id)) },
          click: { args: {}, run: (store) => store.set('clicks', store.get('clicks') + 1) },
        },
      },
    },
    spec: ul({ id: 'list' }, each('box.items', 'id', { tag: 'li', transition: 200, props: { 'aria-label': 'row' }, on: { click: ['box.click', {}] }, children: [{ item: 'id' }] })),
  });
  await ui.settle();
  ui.dispatch('box.add');
  await ui.settle();
  ui.dispatch('box.drop', { id: 2 });
  await ui.settle();
  const leaving = findByTag(root, 'li')[1];
  assert.equal(leaving.getAttribute('data-transition'), 'leave');
  await sleep(80); // longer than the two frames of the enter marker
  assert.equal(leaving.getAttribute('data-transition'), 'leave', 'the enter marker is not removed from a row that is leaving');
  fireEvent(leaving, 'click');
  assert.equal(ui.state().box.clicks, 0, 'a leaving row ignores clicks');
  await sleep(200);
  assert.equal(findByTag(root, 'li').length, 1);
});

test('plugins that is not a list says so instead of throwing a TypeError', () => {
  const head = { title: 'x', description: () => 'd' };
  assert.throws(() => definePage({ head, plugins: withHead }, { path: '/', view: { tag: 'p', id: 'x', children: 'x' } }), (error) => !(error instanceof TypeError) && /plugins/.test(error.message));
});

test('components: a mix of a param and a node key is an unknown param, not a child element', () => {
  const Card = defineElement('Card', { params: { title: { type: 'string' } }, spec: div(null, { param: 'title' }) });
  assert.throws(() => Card({ title: 'x', tag: 'div' }), /has no param tag/);
});

const counter = {
  state: { count: 1, flag: false },
  derive: { double: (get) => get('count') * 2, quad: (get) => get('double') * 2 },
  actions: {
    set: { args: { count: 'number' }, run: (store, { count }) => store.set('count', count) },
    flip: { args: {}, run: (store) => store.set('flag', !store.get('flag')) },
  },
};

test('a watcher of a state key and a derived value of it sees both updated, once per write, however often the derived value was recomputed', async () => {
  const seen = [];
  const { ui } = mountSpec({
    namespaces: { counter },
    spec: div(null, 'x'),
    plugins: [(api) => api.watch(['counter.count', 'counter.quad'], (values) => seen.push({ ...values }))],
  });
  await ui.settle();
  for (const count of [2, 3, 4]) {
    seen.length = 0;
    ui.dispatch('counter.set', { count });
    await ui.settle();
    assert.deepEqual(seen, [{ 'counter.count': count, 'counter.quad': count * 4 }], `after count = ${count}`);
  }
});

test('a derived value that is read while it waits to be recomputed is recomputed first', async () => {
  const log = [];
  const { ui } = mountSpec({
    namespaces: {
      counter: {
        ...counter,
        derive: { ...counter.derive, readBoth: (get) => (log.push([get('count'), get('double')]), get('count') + get('double')) },
      },
    },
    spec: div(null, 'x'),
  });
  await ui.settle();
  log.length = 0;
  ui.dispatch('counter.set', { count: 5 });
  await ui.settle();
  assert.deepEqual(log.every(([count, double]) => double === count * 2), true, JSON.stringify(log));
  assert.equal(ui.derived().counter.readBoth, 15);
});

test('derived values that start to depend on each other after a state change are reported as a loop, and settle() ends', async () => {
  const { ui } = mountSpec({
    namespaces: {
      loop: {
        state: { flag: false },
        derive: { first: (get) => (get('flag') ? get('second') : 0), second: (get) => (get('flag') ? get('first') : 0) },
        actions: { flip: { args: {}, run: (store) => store.set('flag', true) } },
      },
    },
    spec: div(null, 'x'),
  });
  await ui.settle();
  const original = console.error;
  console.error = () => {};
  try {
    ui.dispatch('loop.flip', {});
    await ui.settle();
  } finally {
    console.error = original;
  }
  assert.match(ui.errors.map((error) => error.message ?? String(error)).join('\n'), /cannot depend on itself: loop\.(first -> loop\.second -> loop\.first|second -> loop\.first -> loop\.second)/);
});

const dropBox = {
  state: { items: [{ id: 1 }, { id: 2 }, { id: 3 }] },
  actions: { drop: { args: { id: 'number' }, run: (store, { id }) => store.set('items', store.get('items').filter((entry) => entry.id !== id)) } },
};
const mountDropList = () => mountSpec({ namespaces: { box: dropBox }, spec: ul({ id: 'list' }, each('box.items', 'id', { tag: 'li', transition: 40, children: [{ item: 'id' }] })) });

test('a row that leaves while the log is replayed is gone at once, and a row on its way out is not in tree() or outline()', async () => {
  const { ui, root } = mountDropList();
  await ui.settle();
  ui.dispatch('box.drop', { id: 2 });
  await ui.settle();
  assert.equal(findByTag(root, 'li').length, 3, 'the row is still there while it leaves');
  assert.deepEqual(ui.outline()[0].children.map((row) => row.key), ['1', '3'], 'but the outline shows what the app shows');
  await sleep(80);
  await ui.replay([['box.drop', { id: 1 }]]);
  assert.deepEqual(findByTag(root, 'li').map((element) => element.textContent), ['2', '3'], 'no leave marker is left behind by a replay');
});

test('an event during a replay is ignored', async () => {
  const { ui, root } = mountSpec({
    namespaces: { counter: { state: { count: 0 }, actions: { bump: { args: {}, run: (store) => store.set('count', store.get('count') + 1) } } } },
    spec: button({ id: 'b', on: { click: act('counter.bump', {}) } }, 'bump'),
  });
  await ui.settle();
  const replaying = ui.replay([['counter.bump', {}], ['counter.bump', {}]]);
  fireEvent(findByTag(root, 'button')[0], 'click');
  await replaying;
  assert.equal(ui.state().counter.count, 2, 'only the two logged bumps');
});

test('derived values that flip each other forever are stopped by the round guard, with the closed chain named', async () => {
  const { ui } = mountSpec({
    namespaces: {
      spin: {
        state: { on: false },
        derive: { a: (get) => (get('on') ? !get('b') : false), b: (get) => get('a') },
        actions: { start: { args: {}, run: (store) => store.set('on', true) } },
      },
    },
    spec: div(null, 'x'),
  });
  await ui.settle();
  const original = console.error;
  console.error = () => {};
  try {
    ui.dispatch('spin.start', {});
    await ui.settle(); // ends: without the guard this never returns
  } finally {
    console.error = original;
  }
  assert.match(ui.errors.map((error) => error.message ?? String(error)).join('\n'), /cannot depend on itself: spin\.(a -> spin\.b -> spin\.a|b -> spin\.a -> spin\.b)/);
});
