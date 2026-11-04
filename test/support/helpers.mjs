// Shared test helpers. Imported by the *.test.mjs files; documented in docs/API.md ("Testing").
import { createRoot, mutations } from './dom-shim.mjs';

const { app, countEffectRuns } = await import('../../src/ui.js');
const { didYouMean } = await import('../../src/messages.js');

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

// What one action costs, counted rather than timed, so the numbers are the same on every machine and a test can assert them:
//   domWrites       DOM writes a browser would perform (insert, move, remove, attribute, text, value), counted by the test DOM;
//                   the app must be mounted on it (mountSpec, or a root from createRoot)
//   effectRuns      bindings, derived values and watches that ran again: a binding runs for each row whose item got a new
//                   reference, even when it then writes nothing
//   stateChanged    the state keys ("namespace.key") whose value was replaced
//   derivedChanged  the derived values that got a new value (one that is structurally equal keeps its reference and is not counted)
//   elements        the elements the app shows after the action (ui.outline()), and `elementsBefore`
// It dispatches the action, settles, and throws when the action fails.
export const measureAction = async (ui, actionName, args = {}) => {
  await flushAsync(ui);
  const changedKeys = (before, after) => Object.keys(after).flatMap((namespace) => Object.keys(after[namespace]).filter((key) => before[namespace]?.[key] !== after[namespace][key]).map((key) => `${namespace}.${key}`));
  const countElements = (nodes) => nodes.reduce((total, node) => total + 1 + countElements(node.children ?? []), 0);
  const stateBefore = ui.state();
  const derivedBefore = ui.derived();
  const elementsBefore = countElements(ui.outline());
  const writesBefore = mutations.count;
  const runsBefore = countEffectRuns();
  const error = ui.dispatch(actionName, args);
  if (error) throw new Error(`measureAction("${actionName}"): ${error}`);
  await flushAsync(ui);
  return {
    domWrites: mutations.count - writesBefore,
    effectRuns: countEffectRuns() - runsBefore,
    stateChanged: changedKeys(stateBefore, ui.state()),
    derivedChanged: changedKeys(derivedBefore, ui.derived()),
    elements: countElements(ui.outline()),
    elementsBefore,
  };
};

// Fails when an action costs more than its budget: assertCost(ui, 'todos.toggle', { id: 3 }, { domWrites: 2 }). Limits are upper bounds
// on domWrites, effectRuns, stateChanged and derivedChanged (counts) and elements; the message says what was measured and where the cost usually
// comes from. Returns the measurement.
const COST_LIMITS = ['domWrites', 'effectRuns', 'stateChanged', 'derivedChanged', 'elements'];
export const assertCost = async (ui, actionName, args, limits) => {
  if (!limits || typeof limits !== 'object' || !Object.keys(limits).length) throw new Error(`assertCost("${actionName}"): pass the limits as the fourth argument, for example { domWrites: 2 }. Allowed limits: ${COST_LIMITS.join(', ')}`);
  for (const [name, value] of Object.entries(limits)) {
    if (!COST_LIMITS.includes(name)) throw new Error(`assertCost("${actionName}"): unknown limit "${name}". ${didYouMean(name, COST_LIMITS)}Allowed limits: ${COST_LIMITS.join(', ')}`);
    if (!Number.isInteger(value) || value < 0) throw new Error(`assertCost("${actionName}"): the limit ${name} is ${JSON.stringify(value)}. Write a whole number, 0 or more`);
  }
  const measured = await measureAction(ui, actionName, args);
  const advice = {
    domWrites: 'Rows that are created or written again usually have a key that changes, or items that lost their reference (replace only the changed item, keep the others)',
    effectRuns: 'Bindings ran for rows that did not change: their items got new references, from an action that copies every item or a derived list that builds new objects on every change. Keep unchanged items as they are (memoizeItem in derive)',
    stateChanged: 'An action that replaces keys it did not change writes a new reference: write only the keys that change',
    derivedChanged: 'A derived value that is recomputed with a new object every time makes everything that reads it run again: return the previous items unchanged (memoizeItem)',
    elements: 'The page shows more than the budget: show less at once (a page of the data, a branch that opens on request)',
  };
  for (const [name, limit] of Object.entries(limits)) {
    const value = Array.isArray(measured[name]) ? measured[name].length : measured[name];
    if (value > limit) {
      const detail = Array.isArray(measured[name]) ? ` (${measured[name].join(', ')})` : '';
      throw new Error(`assertCost("${actionName}"): ${name} is ${value}${detail}, over the limit of ${limit}. ${advice[name]}`);
    }
  }
  return measured;
};

