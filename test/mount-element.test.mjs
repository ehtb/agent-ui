// mountElement(api, id, mount) (@ehtb/agent-ui/mount-element): a plugin claims an element by its explicit id and draws into it; the runtime says when it arrives and leaves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountSpec } from './support/helpers.mjs';
import { mountElement } from '../src/mount-element.js';
import { div, ul, li, each, when, state } from '../src/spec.js';

const notes = {
  state: { items: [{ id: 'a' }, { id: 'b' }], shown: true },
  actions: {
    drop: { args: { id: 'string' }, run: (store, { id }) => store.set('items', store.get('items').filter((entry) => entry.id !== id)) },
    add: { args: { id: 'string' }, run: (store, { id }) => store.set('items', [...store.get('items'), { id }]) },
    show: { args: { on: 'boolean' }, run: (store, { on }) => store.set('shown', on) },
  },
};
const spec = div({ id: 'page' }, div({ id: 'toolbar' }), when(state('notes.shown'), div({ id: 'single' })), ul(null, each('notes.items', 'id', li(null, div({ id: 'editor' })))));

const record = () => {
  const events = [];
  const label = (info) => `${info.id}${info.key ? `:${info.key}` : ''}`;
  const plugin = (id) => (api) => mountElement(api, id, (element, info) => {
    events.push(`mount ${label(info)}`);
    return () => events.push(`unmount ${label(info)}`);
  });
  return { events, plugin };
};

test('mountElement: every element with the id is handed over with its row key, and given back when its row goes', async () => {
  const { events, plugin } = record();
  const { ui } = mountSpec({ namespaces: { notes }, spec, plugins: [plugin('editor')] });
  await ui.settle();
  assert.deepEqual(events, ['mount editor:a', 'mount editor:b']);
  ui.dispatch('notes.add', { id: 'c' });
  await ui.settle();
  ui.dispatch('notes.drop', { id: 'a' });
  await ui.settle();
  assert.deepEqual(events, ['mount editor:a', 'mount editor:b', 'mount editor:c', 'unmount editor:a']);
  ui.destroy();
  assert.deepEqual(events.slice(4).sort(), ['unmount editor:b', 'unmount editor:c']);
});

test('mountElement: a branch that comes and goes mounts a new element each time', async () => {
  const { events, plugin } = record();
  const { ui } = mountSpec({ namespaces: { notes }, spec, plugins: [plugin('single')] });
  await ui.settle();
  ui.dispatch('notes.show', { on: false });
  await ui.settle();
  ui.dispatch('notes.show', { on: true });
  await ui.settle();
  assert.deepEqual(events, ['mount single', 'unmount single', 'mount single']);
});

test('mountElement: the plugin owns the element: what it writes stays through updates, and release gives it back', async () => {
  let release;
  let seen;
  const { ui } = mountSpec({ namespaces: { notes }, spec, plugins: [(api) => (release = mountElement(api, 'toolbar', (element) => { seen = element; element.append(document.createTextNode('drawn')); return () => element.replaceChildren(); }))] });
  await ui.settle();
  ui.dispatch('notes.add', { id: 'c' });
  await ui.settle();
  assert.equal(seen.textContent, 'drawn');
  release();
  assert.equal(seen.textContent, '');
});

test('mountElement: a throwing mount or cleanup is reported and does not stop the page', async () => {
  const { ui } = mountSpec({ namespaces: { notes }, spec, plugins: [(api) => mountElement(api, 'editor', () => { throw new Error('boom'); })] });
  await ui.settle();
  assert.equal(ui.errors.length, 2);
  assert.match(ui.errors[0], /mountElement: mount of "editor" threw: boom/);
  ui.dispatch('notes.add', { id: 'c' });
  await ui.settle();
  assert.equal(ui.errors.length, 3);
});

test('mountElement: mistakes are refused when the plugin starts, with the fix', () => {
  const mountWith = (plugin, withSpec = spec) => mountSpec({ namespaces: { notes }, spec: withSpec, plugins: [plugin] });
  assert.throws(() => mountWith((api) => mountElement(api, 'edtor', () => {})), /mountElement: the spec has no element with the id "edtor"\. Did you mean "editor"\? Give the element an explicit id \(div\(\{ id: 'edtor' \}\)\)/);
  assert.throws(() => mountWith((api) => mountElement(api, 'page', () => {})), /the element "page" has children in the spec, and the plugin would write into what the spec renders\. Claim an element without children/);
  assert.throws(() => mountWith((api) => { mountElement(api, 'editor', () => {}); mountElement(api, 'editor', () => {}); }), /the element "editor" is already claimed\. An element has one owner/);
  assert.throws(() => mountWith((api) => mountElement(api, 'editor')), /it takes the api, the id of an element and a function mount\(element, \{ id, key \}\)/);
});
