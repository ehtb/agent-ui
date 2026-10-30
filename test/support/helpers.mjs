// Shared test helpers. Imported by the *.test.mjs files; documented in docs/API.md ("Testing").
import { createRoot } from './dom-shim.mjs';

const { app } = await import('../../src/ui.js');

// Mounts a throwaway app: mountSpec({ namespaces, spec }) -> { ui, root }.
export const mountSpec = ({ namespaces = {}, initialState = {}, spec, plugins = [], dev = true }) => {
  const root = createRoot();
  const ui = app({ namespaces, initialState, spec, root, plugins, dev });
  return { ui, root };
};

// Waits real time; for tests of timers (debounce, transitions).
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Waits until condition() is true, polling, and fails with the condition's text when it does not become true in time. Use it instead of
// a fixed sleep to wait for something a timer does (a transition ending): a sleep is a guess that a busy machine makes wrong.
export const waitFor = async (condition, { timeout = 3000, interval = 5 } = {}) => {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeout) throw new Error(`waitFor: still not true after ${timeout} ms: ${condition}`);
    await sleep(interval);
  }
};

// Lets pending promises (fetch chains, timers at 0 ms) and the scheduled UI updates all finish.
export const flushAsync = async (ui) => {
  for (let round = 0; round < 3; round++) {
    await ui.settle();
    await sleep(0);
  }
  await ui.settle();
};

// A fetch whose responses you control. `respond(url)` may return data (resolved as 200 JSON), a Response-like
// object, an Error (rejected), or a promise/deferred. `calls` records every request.
export const createFakeFetch = (respond) => {
  const calls = [];
  const fetchFunction = async (url, options) => {
    calls.push({ url, options });
    const result = await respond(url, options);
    if (result instanceof Error) throw result;
    if (result && typeof result === 'object' && 'ok' in result) return result;
    return { ok: true, status: 200, json: async () => result };
  };
  fetchFunction.calls = calls;
  return fetchFunction;
};

export const deferred = () => {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return Object.assign(promise, { resolve });
};

// Finds a node of the outline by data-id, anywhere in the tree.
export const outlineById = (outline, id) => {
  for (const node of outline) {
    if (node.id === id) return node;
    const inChildren = node.children && outlineById(node.children, id);
    if (inChildren) return inChildren;
  }
  return undefined;
};

// Fails when the app reported an error (ui.errors): a duplicate or missing list key, an action that threw, a blocked URL. Call it after
// `await ui.settle()`, also after the steps that open a branch, because a branch can hold a list that the first render did not show.
export const assertNoErrors = (ui) => {
  if (ui.errors.length) throw new Error(`assertNoErrors: the app reported ${ui.errors.length} error${ui.errors.length === 1 ? '' : 's'}:\n${ui.errors.join('\n')}`);
};

// Checks that an action is idempotent once settled: dispatches it, settles, then dispatches it again with the same args
// and checks that no state key changed. Fails with the action name, the first key ("namespace.key") that differed and how to fix it.
export const assertRepeatable = async (ui, actionName, args = {}) => {
  const firstError = ui.dispatch(actionName, args);
  if (firstError) throw new Error(`assertRepeatable("${actionName}"): ${firstError}`);
  await flushAsync(ui);
  const before = ui.state();
  const secondError = ui.dispatch(actionName, args);
  if (secondError) throw new Error(`assertRepeatable("${actionName}"): ${secondError}`);
  await flushAsync(ui);
  const after = ui.state();
  for (const namespace of Object.keys(before)) {
    for (const name of Object.keys(before[namespace])) {
      if (JSON.stringify(before[namespace][name]) !== JSON.stringify(after[namespace][name])) {
        throw new Error(
          `assertRepeatable("${actionName}"): repeating the action changed state key "${namespace}.${name}" from ${JSON.stringify(before[namespace][name])} to ${JSON.stringify(after[namespace][name])}. Make "${actionName}" idempotent, or if it resets a resource's state, declare owns on the resource and change a watched key instead`,
        );
      }
    }
  }
};
