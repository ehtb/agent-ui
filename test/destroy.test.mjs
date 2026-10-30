// app().destroy(): what a page that is replaced (soft navigation, src/navigation.js) must leave behind: nothing. Effects stop, listeners go,
// requests in flight are aborted, plugins let go of what they hold, and later dispatches do nothing. And two apps nested in one document
// (a page inside a shell) keep their events, outlines and trees apart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoot, createWindow, fireEvent, findByTag } from './support/dom-shim.mjs';
import { mountSpec, flushAsync, createFakeFetch, deferred } from './support/helpers.mjs';

const { app } = await import('../src/ui.js');
const { resources } = await import('../src/resources.js');
const { windowEvents } = await import('../src/window-events.js');
const { syncApps } = await import('../src/sync-apps.js');

const counter = {
  counter: {
    state: { count: 0 },
    derive: { label: (get) => `n=${get('count')}` },
    actions: { add: { args: {}, run: (store) => store.set('count', store.get('count') + 1) } },
  },
};
const counterSpec = { tag: 'div', children: [{ tag: 'p', id: 'label', children: { state: 'counter.label' } }, { tag: 'button', id: 'add', on: { click: ['counter.add', {}] }, children: 'Add' }] };

test('destroy stops the app: the root is empty, clicks and dispatches do nothing, and the log stops growing', async () => {
  const { ui, root } = mountSpec({ namespaces: counter, spec: counterSpec });
  const button = findByTag(root, 'button')[0];
  fireEvent(button, 'click');
  assert.equal(ui.state().counter.count, 1);
  assert.equal(ui.destroyed, false);
  ui.destroy();
  assert.equal(ui.destroyed, true);
  assert.equal(root.childNodes.length, 0);
  fireEvent(button, 'click'); // the listener was removed from the root, so an event that still bubbles to it changes nothing
  assert.equal(ui.dispatch('counter.add', {}), undefined);
  assert.equal(ui.state().counter.count, 1);
  assert.equal(ui.log.length, 1);
  ui.destroy(); // idempotent
});

test('destroy disposes the effects: the state changes nothing in the DOM that was emptied, and derived values stop being computed', async () => {
  let computed = 0;
  const { ui, root } = mountSpec({
    namespaces: { counter: { ...counter.counter, derive: { label: (get) => (computed++, `n=${get('count')}`) } } },
    spec: counterSpec,
  });
  const before = computed;
  ui.destroy();
  ui.get('counter.count');
  await ui.settle();
  assert.equal(computed, before, 'no recomputation after destroy');
  assert.equal(root.childNodes.length, 0);
});

test('onDestroy runs the cleanups of plugins, last registered first, and at once when the app is already destroyed', () => {
  const order = [];
  const { ui } = mountSpec({ namespaces: counter, spec: counterSpec, plugins: [(api) => { api.onDestroy(() => order.push('first')); api.onDestroy(() => order.push('second')); }] });
  ui.destroy();
  assert.deepEqual(order, ['second', 'first']);
  ui.onDestroy(() => order.push('late'));
  assert.deepEqual(order, ['second', 'first', 'late']);
});

test('resources abort the request in flight and drop a late answer when the app is destroyed', async () => {
  const answer = deferred();
  const fetchFunction = createFakeFetch(() => answer);
  let signal;
  const watching = async (url, init) => { signal = init.signal; return fetchFunction(url, init); };
  const { ui } = mountSpec({
    namespaces: {
      box: {
        state: { status: 'idle', data: null },
        actions: { loading: { args: {}, run: (store) => store.set('status', 'loading') }, loaded: { args: { data: 'json' }, run: (store, { data }) => { store.set('status', 'ready'); store.set('data', data); } }, failed: { args: { message: 'string' }, run: (store) => store.set('status', 'failed') } },
        resources: [{ watch: [], request: () => ({ url: '/slow' }), onStart: 'loading', onSuccess: 'loaded', onError: 'failed' }],
      },
    },
    spec: { tag: 'p', children: { state: 'box.status' } },
    plugins: [resources(watching)],
  });
  assert.equal(ui.state().box.status, 'loading');
  ui.destroy();
  assert.equal(signal.aborted, true, 'the request was aborted');
  answer.resolve({ late: true });
  await flushAsync(ui);
  assert.equal(ui.state().box.status, 'loading', 'the late answer changed nothing');
  assert.deepEqual(ui.log.map(([name]) => name), ['box.loading']);
});

test('resources drop a debounce timer that has not fired when the app is destroyed', async () => {
  const fetchFunction = createFakeFetch(() => ({}));
  const { ui } = mountSpec({
    namespaces: {
      box: {
        state: { status: 'idle' },
        actions: { loading: { args: {}, run: (store) => store.set('status', 'loading') }, loaded: { args: { data: 'json' }, run: (store) => store.set('status', 'ready') }, failed: { args: { message: 'string' }, run: (store) => store.set('status', 'failed') } },
        resources: [{ watch: [], request: () => ({ url: '/later' }), onStart: 'loading', onSuccess: 'loaded', onError: 'failed', delayMs: 20 }],
      },
    },
    spec: { tag: 'p', children: { state: 'box.status' } },
    plugins: [resources(fetchFunction)],
  });
  ui.destroy();
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(fetchFunction.calls.length, 0, 'the request that was waiting for its delay was never sent');
});

test('windowEvents removes its listeners from the window when the app is destroyed', () => {
  const removed = [];
  const target = { addEventListener() {}, removeEventListener: (type) => removed.push(type) };
  const { ui } = mountSpec({ namespaces: counter, spec: counterSpec, plugins: [windowEvents(target, { resize: ['counter.add', {}], online: ['counter.add', {}] })] });
  ui.destroy();
  assert.deepEqual(removed.sort(), ['online', 'resize']);
});

test('syncApps stops sending when the receiving app is destroyed', async () => {
  const receiver = mountSpec({ namespaces: { badge: { state: { count: 0 }, actions: { set: { args: { count: 'number' }, run: (store, { count }) => store.set('count', count) } } } }, spec: { tag: 'p', children: 'badge' } });
  const sender = mountSpec({ namespaces: counter, spec: counterSpec });
  const stop = syncApps({ from: sender.ui, to: receiver.ui, watch: ['counter.count'], action: 'badge.set', args: { count: 'counter.count' } });
  sender.ui.dispatch('counter.add', {});
  await sender.ui.settle();
  assert.equal(receiver.ui.state().badge.count, 1);
  receiver.ui.destroy();
  stop();
  sender.ui.dispatch('counter.add', {});
  await sender.ui.settle();
  assert.equal(receiver.ui.state().badge.count, 1);
});

// ---------------------------------------------------------------------------- a page nested in a shell

const nested = () => {
  const outerRoot = createRoot();
  const outer = app({ dev: true,
    namespaces: { frame: { state: { clicks: 0 }, actions: { click: { args: {}, run: (store) => store.set('clicks', store.get('clicks') + 1) } } } },
    spec: { tag: 'main', children: [{ tag: 'button', id: 'frame-button', on: { click: ['frame.click', {}] }, children: 'Frame' }, { tag: 'div', id: 'slot', props: { id: 'app' } }] },
    root: outerRoot,
  });
  const slot = findByTag(outerRoot, 'div')[0];
  const inner = app({ dev: true, namespaces: counter, spec: counterSpec, root: slot });
  return { outer, outerRoot, inner, slot };
};

test('an event inside the page reaches the page app only; the shell app around it does not see it', async () => {
  const { outer, inner, slot } = nested();
  fireEvent(findByTag(slot, 'button')[0], 'click'); // bubbles through the page's root and the shell's root
  assert.equal(inner.state().counter.count, 1);
  assert.equal(outer.state().frame.clicks, 0);
  assert.deepEqual(outer.errors, [], 'the shell reported no unknown action');
  assert.deepEqual(inner.errors, []);
});

test('an event in the shell reaches the shell app', () => {
  const { outer, outerRoot } = nested();
  fireEvent(findByTag(outerRoot, 'button')[0], 'click');
  assert.equal(outer.state().frame.clicks, 1);
});

test('the shell\'s tree and outline leave out what belongs to the page inside it', () => {
  const { outer, inner } = nested();
  assert.deepEqual(outer.tree().map((entry) => entry.id), ['frame-button']);
  assert.deepEqual(inner.tree().map((entry) => entry.id), ['add']);
  const slotOutline = outer.outline()[0].children.find((child) => child.id === 'slot');
  assert.equal(slotOutline.children, undefined, 'the page is described by its own app');
});

test('destroying the page leaves the shell and its slot in place, and a new page can start in the same slot', async () => {
  const { outer, outerRoot, inner, slot } = nested();
  inner.destroy();
  assert.equal(slot.childNodes.length, 0);
  assert.equal(findByTag(outerRoot, 'button').length, 1, 'the shell\'s button is still there');
  const next = app({ dev: true, namespaces: counter, spec: counterSpec, root: slot });
  fireEvent(findByTag(slot, 'button')[0], 'click');
  assert.equal(next.state().counter.count, 1);
  assert.equal(outer.state().frame.clicks, 0);
});
