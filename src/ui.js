// agent-ui runtime. Full reference: docs/API.md; rules for whoever writes an app with it: docs/AGENT-RULES.md. Both ship in
// this package (node_modules/@ehtb/agent-ui/docs/API.md and node_modules/@ehtb/agent-ui/docs/AGENT-RULES.md when it is installed).
//
// The UI is a JSON spec. State lives in signals. All behavior goes through named, typed actions.
// There is no virtual DOM: every dynamic binding is one effect that writes one DOM property.
//
// Spec grammar (the machine-readable summary is exported as `grammar`):
//   node     := "text" | binding | element | each | when
//   binding  := exactly one of
//                 {state: "namespace.key.path"}  {item: "field"}  {row: "name.field"}  {rowState: "namespace.field"}  {not: x}  {length: x}
//                 {equals: [x, y]}  {greaterThan: [x, y]}  {lessThan: [x, y]}  {and: [x, y, ...]}  {or: [x, y, ...]}
//                 {join: [x, ...]}                         (x is a binding or a literal)
//   element  := {tag, id?, props?, classes?, on?, transition?, children?}
//   props    := {attribute: literal | binding}
//   classes  := {className: binding}
//   transition := milliseconds. After the first render, an element of an `each` row or `when` branch gets
//                 data-transition="enter" for two frames when added and data-transition="leave" for that many ms before
//                 it is removed; CSS does the animating (the runtime only delays removal). A row that changes
//                 position in its list slides to its new place over the same number of ms (Element.animate).
//   on       := {"event" | "keydown.Enter" | "keydown.Control+Shift+k": handler | [handler, ...]}
//                 handler := [actionName, args?, options?]   (actionName is "namespace.verb"; a list runs its handlers in order)
//                 args    := {argument: literal | {state} | {item} | {event: "target.value"}}
//                 options := {preventDefault?: boolean, stopPropagation?: boolean}
//   each     := {each: "namespace.key" | binding, key: "field" | ".", as?: "name", template: element}   (one row per item; {item}
//                 reads the innermost row, {row: "name.field"} the row of an enclosing each that says `as: "name"`; {rowState: "namespace.field" | "rowname.namespace.field"}
//                 reads the per-row state of the innermost row, or of the enclosing row that says `as: "rowname"`; key "." and {item: "."} use the item itself, for lists of strings or numbers)
//   when     := {when: binding, children?: node | node[], otherwise?: node | node[]}
//
// Namespaces (src/namespaces.js): {name: {state, derive, actions}}. An action is
//   {args: {argument: "string" | "number" | "boolean" | "json"}, calls?: ["other.verb"], run: (store, args, call) => void}.
// It reads and writes its own namespace's keys unqualified, reads other namespaces with "namespace.key", and changes
// another namespace only through call("namespace.verb", args) for an action it lists in `calls`.
// State is replaced, never mutated (in dev mode it is deep-frozen, so mutations fail loudly). A throwing action leaves no writes behind.

// ---------------------------------------------------------------------------
// Reactivity: signals, effects, batched flush
// ---------------------------------------------------------------------------

import { APP_ELEMENT_ID, DELEGATED_EVENTS, KEY_EVENTS, PAGE_PLUGIN, SVG_NAMESPACE, SVG_TAGS, URL_PROPS, isBinding, isPlainObject, toArray, matchesArgumentType, isUnsafeUrl, isSameValue, nextFrame, readEventPath, eventKeyName, splitRowPath } from './spec-core.js';
import { validate, grammar, findJsonProblems, findShapeProblems } from './validate.js';
import { didYouMean, fail, failOwnedTwice } from './messages.js';
import { checkAdopt, checkBasePath, checkPluginProperties, checkPropertyHandler, noteRowsJumped, checkRowChanges, checkRowKey, checkRowState, checkRowStateWrite, checkEachKeys, consumeCheckedListProblem, forgetCheckedListProblems } from './runtime-checks.js';
import { codedError } from './errors.js';
import { ROW_STATE_KEY, flattenNamespaces, mergeInitialState, mergeStateValues, nestByNamespace, splitStatePath } from './namespaces.js';
import { BASE_PATH_ATTRIBUTES, withBaseInAttribute } from './base-path.js';
import { createAdopter } from './adopt.js';

// One entry point for everything public: the validator and grammar live in validate.js, shared helpers in spec-core.js.
export { validate, grammar, isPlainObject, toArray, isSameValue, readEventPath, eventKeyName, mergeInitialState };

let activeEffect = null; // the effect currently running (collects the signals it reads)
let activeScope = null; // the list collecting disposers of effects created right now
let activeReport = null; // how errors are reported for the app whose code is running: effects made now remember it
let effectRuns = 0; // every run of every effect (a binding, a derived value, a watch), for the cost a test measures (measureAction)

// How many times effects have run in this process: a binding that runs again for a row that did not change is the cost of a list whose
// items lost their reference, which the DOM writes alone do not show (they skip a value that is the same).
export const countEffectRuns = () => effectRuns;
const pendingEffects = new Set();
let flushScheduled = false;

const scheduleFlush = () => {
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(flushEffects);
};

// Runs the scheduled recomputations of THIS app's derived values now, leaving DOM updates for the microtask. An action that
// reads a derived value after writing state it depends on gets the new value, not the one from before the write.
// A derived value that throws is not the business of whoever triggered the refresh: it goes back to the queue, where the
// normal flush retries it and reports it as it always did. Only when the value that was asked for is the one that
// failed does the error reach the caller, because then it is that caller's value.
// Derived values that keep queueing each other, round after round, are a loop that only shows itself once the values change (a cycle
// through a branch that was not taken at mount). The rounds are counted, and the loop is reported with the names that keep running.
const MAX_DERIVED_ROUNDS = 1000;
const loopError = (names) => {
  const chain = [...new Set(names)];
  return codedError('AUI0107', { chain: [...chain, chain[0]] }); // closed, like the chain of a cycle found while computing
};

const refreshDerived = (owner, wanted = null) => {
  const failed = [];
  // Only this app's own queue is read (owner.pending), not every pending effect of every app. Running one can queue more of them.
  let rounds = 0;
  while (owner.pending.size) {
    if (++rounds > MAX_DERIVED_ROUNDS) throw loopError([...owner.pending].map((pendingEffect) => pendingEffect.derivedName));
    for (const next of [...owner.pending]) {
      owner.pending.delete(next);
      if (!pendingEffects.delete(next) || next.disposed) continue;
      try {
        next();
      } catch (error) {
        failed.push({ failedEffect: next, error });
      }
    }
  }
  for (const { failedEffect } of failed) {
    pendingEffects.add(failedEffect);
    owner.pending.add(failedEffect);
  }
  if (failed.length) scheduleFlush();
  const asked = failed.find(({ failedEffect }) => failedEffect.derivedName === wanted);
  if (asked) throw asked.error;
};

const flushEffects = () => {
  flushScheduled = false;
  const run = (runEffect) => {
    runEffect.owner?.pending.delete(runEffect);
    if (runEffect.disposed) return;
    // One effect that throws (a derived value reading a field of an item that is gone) must not stop the others from
    // running: they were already taken off the queue. The error is reported and the rest of the page keeps updating.
    try {
      runEffect();
    } catch (error) {
      (runEffect.report ?? ((reported) => console.error(reported.message)))(error);
    }
  };
  // Derived values first, and again while they queue each other, so a binding or a watcher that reads state and a derived value of it
  // sees both after the same write and runs once.
  const trail = []; // the last derived values that ran, to name the loop if there is one
  for (let rounds = 0; ; rounds++) {
    const derived = [...pendingEffects].filter((runEffect) => runEffect.derivedName !== null);
    if (!derived.length) break;
    if (rounds >= MAX_DERIVED_ROUNDS) {
      for (const runEffect of derived) (pendingEffects.delete(runEffect), runEffect.owner?.pending.delete(runEffect));
      (derived[0].report ?? ((reported) => console.error(reported.message)))(loopError(trail));
      break;
    }
    for (const runEffect of derived) pendingEffects.delete(runEffect);
    derived.forEach((runEffect) => (trail.push(runEffect.derivedName), trail.length > 8 && trail.shift(), run(runEffect)));
  }
  const effects = [...pendingEffects];
  pendingEffects.clear();
  effects.forEach(run);
};

export const signal = (initialValue) => {
  let value = initialValue;
  const subscribers = new Set();
  return {
    get() {
      if (activeEffect) {
        subscribers.add(activeEffect);
        activeEffect.dependencies.add(subscribers);
      }
      return value;
    },
    peek: () => value,
    set(nextValue) {
      if (nextValue === value) return;
      value = nextValue;
      for (const subscriber of subscribers) {
        pendingEffects.add(subscriber);
        subscriber.owner?.pending.add(subscriber);
      }
      scheduleFlush();
    },
  };
};

// Runs `callback` now and again whenever a signal it read changes. Returns a disposer.
export const effect = (callback, { owner = null, derivedName = null } = {}) => {
  const runEffect = () => {
    effectRuns++;
    for (const subscribers of runEffect.dependencies) subscribers.delete(runEffect);
    runEffect.dependencies.clear();
    const previousEffect = activeEffect;
    const previousReport = activeReport;
    activeEffect = runEffect;
    activeReport = runEffect.report;
    try {
      callback();
    } finally {
      activeEffect = previousEffect;
      activeReport = previousReport;
    }
  };
  runEffect.report = activeReport;
  runEffect.dependencies = new Set();
  runEffect.owner = owner; // { pending: Set } of the app a derived value's effect belongs to (null for any other effect)
  runEffect.derivedName = derivedName;
  runEffect();

  const dispose = () => {
    runEffect.disposed = true;
    for (const subscribers of runEffect.dependencies) subscribers.delete(runEffect);
  };
  if (activeScope) activeScope.push(dispose);
  return dispose;
};

// Runs `callback` and returns one function that disposes every effect created inside it.
const runInScope = (callback) => {
  const previousScope = activeScope;
  const disposers = [];
  activeScope = disposers;
  try {
    callback();
  } finally {
    activeScope = previousScope;
  }
  return () => disposers.forEach((dispose) => dispose());
};

// Resolves after all scheduled updates have been applied. Await this before asserting on the DOM or derived values.
export const settle = async () => {
  do {
    await null;
  } while (flushScheduled || pendingEffects.size);
};

const freezeDeep = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key in value) freezeDeep(value[key]);
  }
  return value;
};

// ---------------------------------------------------------------------------
// Application: state, rendering, events, agent API
// ---------------------------------------------------------------------------

const APP_OPTIONS = ['namespaces', 'initialState', 'spec', 'root', 'plugins', 'dev', 'debug', 'basePath', 'specChecked', 'adopt'];

// Everything an app creates while it is being made (derived values, bindings, the effects of plugins) is collected, so that
// `destroy()` can stop all of it. A page that replaces another one (src/navigation.js) needs the old app gone, not just hidden.
export const app = (options) => {
  const previousScope = activeScope;
  const previousReport = activeReport;
  const disposers = [];
  activeScope = disposers;
  try {
    return createApp(options, disposers);
  } finally {
    activeScope = previousScope;
    activeReport = previousReport;
  }
};

const createApp = (options, disposers) => {
  // A typo must not silently become an app with no state.
  for (const key of Object.keys(options ?? {})) {
    if (!APP_OPTIONS.includes(key)) fail('app', `unknown option "${key}"`, `${didYouMean(key, APP_OPTIONS)}Allowed options: ${APP_OPTIONS.join(', ')}`);
  }
  const { namespaces = {}, initialState = {}, spec, root, plugins = [], dev, debug = false, basePath = '', specChecked = false, adopt = false } = options;
  if (typeof dev !== 'boolean') fail('app', `dev is ${JSON.stringify(dev) ?? 'missing'}`, 'Pass dev: true while developing (state is frozen and mistakes are reported) and dev: false in production. There is no default, so the mode is always written down');
  if (debug !== undefined && typeof debug !== 'boolean') fail('app', `debug is ${JSON.stringify(debug)}`, 'Write debug: true to make the browser console show what the app does, or leave it out');
  checkAdopt(adopt);
  checkBasePath(basePath);
  // Server rendering passes a root from a server document; browsers and the test shim use the global one.
  const document = root.ownerDocument ?? globalThis.document;
  // `specChecked`: the caller made an app from this same spec, namespaces and kind of initial state before. A server makes one app per
  // request, and walking an unchanged spec again is a fifth of a large page's render.
  const problems = specChecked ? [] : validate(spec, { namespaces, initialState });
  if (problems.length) {
    // One line per problem, so the text reads in a terminal; the list itself is on the error for callers that want to parse it.
    throw Object.assign(new Error(`app: the spec has ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n${problems.join('\n')}`), { problems });
  }

  const namespaceNames = Object.keys(namespaces);
  const flat = flattenNamespaces(namespaces);
  const derive = flat.derive; // qualified name -> { namespace, compute }
  const actions = flat.actions; // qualified name -> { name, namespace, args, run, calls }
  const initialStateJson = JSON.stringify(mergeStateValues(flat.state, initialState));
  const initialValues = JSON.parse(initialStateJson);
  const stateKeys = Object.keys(flat.state);
  const stateKeySet = new Set(stateKeys);
  const signals = Object.create(null); // qualified state keys and derived names -> signal
  const log = [];
  const errors = [];
  const stateOwners = Object.create(null); // qualified state key -> { where, allowedActions, message }
  const undoLog = []; // [key, previous value] of every write of the running action, to undo them if it throws
  let runningAction = null;
  let replaying = false;
  let destroyed = false;
  const cleanups = []; // what plugins registered with onDestroy
  const replayHandlers = []; // what plugins registered with onReplay

  // Every error the runtime catches and does not throw again ends here: it is kept in `errors`, written to the console and handed to
  // the handlers plugins registered with api.onError (a monitoring tool). A handler that throws is reported to the console and
  // never reaches the app. An error that has no code of its own (one a plugin or an effect threw) gets AUI0304.
  const errorHandlers = new Set();
  let appApi = null;
  const reportCaught = (error) => {
    const message = String(error?.message ?? error);
    errors.push(message);
    console.error(message);
    // Only a code of ours is kept: an error that carries another one (ENOENT, a library's) is an uncoded error to a monitoring tool.
    const coded = /^AUI\d{4}$/.test(error?.code);
    const report = { code: coded ? error.code : 'AUI0304', details: coded ? error.details ?? { message } : { message }, message, error, action: error?.details?.action ?? runningAction, app: appApi };
    if (startupReports) startupReports.push(report);
    else deliver(report);
    return message;
  };
  const deliver = (report) => {
    for (const handler of errorHandlers) {
      try {
        handler(report);
      } catch (handlerError) {
        console.error(`onError handler threw: ${handlerError?.message ?? handlerError}`);
      }
    }
  };
  // What went wrong while the app was starting (the first render, a plugin) is kept until every plugin is installed, then handed to
  // the handlers the plugins registered, so the first error of a page reaches the monitoring tool too.
  let startupReports = [];
  const reportError = (code, details, context) => reportCaught(codedError(code, details, context));
  activeReport = reportCaught;

  const writeState = (key, value) => signals[key].set(dev ? freezeDeep(value) : value);

  for (const key of stateKeys) {
    signals[key] = signal(dev ? freezeDeep(initialValues[key]) : initialValues[key]);
  }

  // Keys are qualified ("todos.draft") everywhere except inside the code of one namespace (its actions and derived values),
  // which writes its own keys without the prefix and every other namespace's with it. One form for each, so a key never
  // means two things. Returns the qualified key.
  const resolveKey = (namespace, key, operation) => {
    if (typeof key !== 'string') throw codedError('AUI0101', { operation, key });
    const dot = key.indexOf('.');
    if (dot === -1) return `${namespace}.${key}`;
    if (key.slice(0, dot) === namespace) throw codedError('AUI0102', { operation, key, namespace });
    return key;
  };
  const unknownKeyError = (operation, key, fromNamespace = null) => codedError('AUI0103', { operation, key, fromNamespace }, { namespaceNames, knownKeys: [...Object.keys(flat.state), ...Object.keys(derive)] });

  // Derived values: pure functions of state, recomputed when a dependency changes. A recomputed value that is
  // structurally equal to the previous one keeps the previous reference, so unrelated rows and bindings stay untouched.
  // A derived value may read state keys and any other derived value, whatever the order they are declared in: reading one
  // that is not computed yet computes it first. Reading something that does not exist, or a cycle, fails at mount with
  // the derived value's name.
  const computing = [];
  const derivedOwner = { pending: new Set() }; // identifies this app's derived effects, and queues the ones that are pending
  const initializeDerived = (name) => {
    signals[name] = signal();
    const { namespace, compute } = derive[name];
    const get = (key) => trackedGet(resolveKey(namespace, key, 'get'), namespace);
    effect(() => {
      // Also on a recomputation, not only at mount: a cycle through a branch that was not taken before is found when it is taken.
      computing.push(name);
      try {
        let next;
        try {
          next = compute(get);
        } catch (error) {
          throw codedError('AUI0108', { name, cause: error.message });
        }
        const previous = signals[name].peek();
        signals[name].set(isSameValue(previous, next, 2) ? previous : next);
      } finally {
        computing.pop();
      }
    }, { owner: derivedOwner, derivedName: name });
  };
  // A derived value that is waiting to be recomputed is recomputed before it is read, so a value computed from it never sees the old one.
  const refreshPending = (name) => {
    for (const pendingEffect of derivedOwner.pending) {
      if (pendingEffect.derivedName !== name) continue;
      derivedOwner.pending.delete(pendingEffect);
      pendingEffects.delete(pendingEffect);
      if (!pendingEffect.disposed) pendingEffect();
      return;
    }
  };
  const trackedGet = (key, fromNamespace = null) => {
    if (typeof key !== 'string') throw unknownKeyError('get', String(key), fromNamespace);
    if (computing.includes(key)) throw codedError('AUI0107', { chain: [...computing.slice(computing.indexOf(key)), key] });
    if (!(key in signals)) {
      if (!(key in derive)) throw unknownKeyError('get', key, fromNamespace);
      initializeDerived(key);
    } else if (key in derive) {
      refreshPending(key);
    }
    return signals[key].get();
  };
  for (const name in derive) if (!(name in signals)) initializeDerived(name);

  // What an action sees: its own namespace unqualified, the others by "namespace.key" for reading. Writing is the
  // namespace's alone; the message names the way out. Writes are recorded so a throwing action can be undone.
  const createStore = (action) => {
    const checkWritable = (key, qualified, operation) => {
      const [namespace] = qualified.split('.');
      if (namespace !== action.namespace) {
        const callable = Object.keys(actions).filter((name) => name.startsWith(`${namespace}.`));
        throw codedError('AUI0104', { operation, key, namespace, action: action.name, actionNamespace: action.namespace }, { callable });
      }
      if (!stateKeySet.has(qualified)) {
        throw qualified in derive ? codedError('AUI0105', { operation, key }) : unknownKeyError(operation, qualified, action.namespace);
      }
    };
    // Development: an owned key can only be written by its owner's actions, and a value that would not survive JSON
    // (a Map, a Date, a function, undefined) is refused where it is written.
    const writeKey = (key, qualified, value, operation) => {
      if (dev) {
        if (qualified in stateOwners && !stateOwners[qualified].allowedActions.includes(runningAction)) {
          throw new Error(stateOwners[qualified].message(key));
        }
        const [problem] = findJsonProblems(value, `${operation}("${key}")`);
        if (problem) throw new Error(problem);
        if (qualified in flat.shapes) {
          const [shapeProblem] = findShapeProblems(value, flat.shapes[qualified], `${operation}("${key}")`);
          if (shapeProblem) throw new Error(shapeProblem);
        }
      }
      undoLog.push([qualified, signals[qualified].peek()]);
      writeState(qualified, value);
    };

    // The per-row state of this action's namespace (rowState): rows are addressed by the key of the list's rows.
    const rowDefaults = flat.rowStates[action.namespace];
    const rowsKey = `${action.namespace}.${ROW_STATE_KEY}`;
    const rowKeyOf = (id, operation) => (checkRowKey(operation, id), String(id));
    const storedRows = () => signals[rowsKey].peek();

    return {
      get: (key) => {
        const qualified = resolveKey(action.namespace, key, 'store.get');
        if (!(qualified in signals)) throw unknownKeyError('store.get', qualified, action.namespace);
        if (qualified in derive) refreshDerived(derivedOwner, qualified);
        return signals[qualified].peek();
      },
      set: (key, value) => {
        const qualified = resolveKey(action.namespace, key, 'store.set');
        checkWritable(key, qualified, 'store.set');
        checkRowStateWrite(key, rowDefaults && qualified === rowsKey);
        writeKey(key, qualified, value, 'store.set');
      },
      // All fields of one row: the defaults, with what the row changed laid over them.
      getRow: (id) => {
        checkRowState('getRow', action.namespace, rowDefaults);
        return { ...rowDefaults, ...storedRows()[rowKeyOf(id, 'getRow')] };
      },
      // Changes some fields of one row. A row whose fields all equal the defaults is dropped, so the state stays the shortest it can be.
      setRow: (id, changes) => {
        checkRowState('setRow', action.namespace, rowDefaults);
        const rowKey = rowKeyOf(id, 'setRow');
        checkRowChanges(id, changes, action.namespace, rowDefaults);
        const rows = storedRows();
        const merged = { ...rowDefaults, ...rows[rowKey], ...changes };
        const differing = Object.fromEntries(Object.entries(merged).filter(([field, value]) => !isSameValue(rowDefaults[field], value, 4)));
        const { [rowKey]: previous, ...others } = rows;
        const next = Object.keys(differing).length ? { ...rows, [rowKey]: isSameValue(previous, differing, 4) ? previous : differing } : others;
        if (isSameValue(rows, next, 2)) return;
        writeKey(ROW_STATE_KEY, rowsKey, next, 'store.setRow');
      },
      // Forgets one row (back to the defaults), for example when the item leaves the list.
      clearRow: (id) => {
        checkRowState('clearRow', action.namespace, rowDefaults);
        const rowKey = rowKeyOf(id, 'clearRow');
        const rows = storedRows();
        if (!(rowKey in rows)) return;
        const { [rowKey]: removed, ...others } = rows;
        writeKey(ROW_STATE_KEY, rowsKey, others, 'store.clearRow');
      },
    };
  };

  // ---- reading values ------------------------------------------------------

  // {state: "todos.items.0.title"}: the signal of "todos.items", then the path inside its value.
  const createStateReader = (path) => {
    const { key, fields } = splitStatePath(path);
    const source = signals[key];
    if (!fields.length) return source.get;
    return () => fields.reduce((value, part) => value?.[part], source.get());
  };

  // Bindings are compiled in two steps so an `each` does the spec-walking once, not once per row: planBinding(binding)
  // does everything row-independent (walking keys, state readers, operand plans) and returns bindRow(row), which
  // ties the plan to one row and returns the reader. The reader returns the current value, tracked by the running effect.
  // `row` is the scope of the innermost `each` row: { signal, key, names }, where `signal` holds the item, `key` is its key
  // and `names` maps the `as` name of every enclosing row to its signal and `keys` to its key. It is null outside any `each`.
  const planOperand = (operand) => {
    if (isBinding(operand)) return planBinding(operand);
    const read = () => operand;
    return () => read;
  };

  const planBinding = (binding) => {
    if ('state' in binding) {
      const read = createStateReader(binding.state);
      return () => read;
    }
    if ('item' in binding) {
      const field = binding.item;
      return field === '.' ? (row) => () => row.signal.get() : (row) => () => row.signal.get()[field];
    }
    if ('row' in binding) {
      const [name, field] = splitRowPath(binding.row);
      return field === undefined ? (row) => () => row.names[name].get() : (row) => () => row.names[name].get()[field];
    }
    if ('rowState' in binding) {
      // namespace.field reads the innermost row, rowname.namespace.field the row an enclosing each names with `as`.
      const parts = binding.rowState.split('.');
      const [rowName, namespace, field] = parts.length === 3 ? parts : [null, ...parts];
      const rowsSignal = signals[`${namespace}.${ROW_STATE_KEY}`];
      const fallback = flat.rowStates[namespace][field];
      // The value of one field for the row this binding sits in. The sparse map has one signal for all rows, so each
      // binding keeps its own value in a signal of its own: a write to another row re-runs this check, not the DOM write.
      return (row) => {
        const value = signal();
        effect(() => {
          const rows = rowsSignal.get();
          const rowKey = String(rowName === null ? row.key : row.keys[rowName]);
          const stored = Object.hasOwn(rows, rowKey) ? rows[rowKey] : undefined; // a row named "constructor" has no state until it is given some
          value.set(stored && field in stored ? stored[field] : fallback);
        });
        return value.get;
      };
    }
    if ('not' in binding) {
      const plan = planOperand(binding.not);
      return (row) => {
        const operand = plan(row);
        return () => !operand();
      };
    }
    if ('length' in binding) {
      const plan = planOperand(binding.length);
      return (row) => {
        const operand = plan(row);
        return () => operand()?.length ?? 0;
      };
    }
    const operator = Object.keys(binding)[0];
    const plans = binding[operator].map(planOperand);
    const bindOperands = (combine) => (row) => combine(plans.map((plan) => plan(row)));
    switch (operator) {
      case 'equals':
        return bindOperands((operands) => () => operands[0]() === operands[1]());
      case 'greaterThan':
        return bindOperands((operands) => () => operands[0]() > operands[1]());
      case 'lessThan':
        return bindOperands((operands) => () => operands[0]() < operands[1]());
      case 'and':
        return bindOperands((operands) => () => operands.every((operand) => operand()));
      case 'or':
        return bindOperands((operands) => () => operands.some((operand) => operand()));
      default: // join
        return bindOperands((operands) => () => operands.map((operand) => operand() ?? '').join(''));
    }
  };

  // Resolves one action argument at event time.
  const resolveArgument = (argument, event, row) => {
    if (!isPlainObject(argument)) return argument;
    if ('event' in argument) return readEventPath(event, argument.event);
    if ('item' in argument) return argument.item === '.' ? row.signal.peek() : row.signal.peek()[argument.item];
    if ('row' in argument) {
      const [name, field] = splitRowPath(argument.row);
      return field === undefined ? row.names[name].peek() : row.names[name].peek()[field];
    }
    if ('state' in argument) return createStateReader(argument.state)();
    return argument; // a literal JSON object
  };

  // ---- actions -------------------------------------------------------------

  // The details of the first argument that is not of its declared type (the AUI0203 error), or undefined.
  const checkArguments = (name, args) => {
    for (const argName in actions[name].args) {
      const expected = actions[name].args[argName];
      if (!matchesArgumentType(args[argName], expected)) return { action: name, argument: argName, expected, got: typeof args[argName] };
    }
    return undefined;
  };

  // Runs one action with its own scoped store. If it throws, every write it made (and those of the actions it called) is
  // undone, so a failed action never leaves half a change behind. Nothing renders in between: effects run after the action.
  const runAction = (name, args) => {
    const action = actions[name];
    const savepoint = undoLog.length;
    const previousAction = runningAction;
    runningAction = name;
    try {
      action.run(createStore(action), args, createCall(action));
    } catch (error) {
      for (let index = undoLog.length - 1; index >= savepoint; index--) signals[undoLog[index][0]].set(undoLog[index][1]);
      undoLog.length = savepoint;
      throw error;
    } finally {
      runningAction = previousAction;
    }
    if (previousAction === null) undoLog.length = 0;
  };

  // call(name, args): how an action changes another namespace. It runs the other namespace's action, which writes its own
  // keys, inside the caller's undo scope. Only actions listed in the caller's `calls` can be called.
  const createCall = (caller) => (name, args = {}) => {
    if (!caller.calls.includes(name)) {
      throw codedError('AUI0106', { name, caller: caller.name, calls: caller.calls });
    }
    const mismatch = checkArguments(name, args);
    if (mismatch) throw codedError('AUI0109', { name, cause: codedError('AUI0203', mismatch).message });
    try {
      runAction(name, args);
    } catch (error) {
      throw codedError('AUI0201', { action: name, cause: error.message });
    }
  };

  const actionHandlers = new Set();
  // Returns undefined on success, or the error message.
  const dispatch = (name, args = {}) => {
    if (destroyed) return undefined; // a response that arrives after the app was destroyed changes nothing
    if (!(name in actions)) return reportError('AUI0202', { action: name }, { actionNames: Object.keys(actions) });
    const mismatch = checkArguments(name, args);
    if (mismatch) return reportError('AUI0203', mismatch);
    try {
      runAction(name, args);
      log.push([name, args]);
    } catch (error) {
      return reportError('AUI0201', { action: name, cause: error.message });
    }
    for (const handler of actionHandlers) {
      try {
        handler({ name, args, replaying });
      } catch (handlerError) {
        console.error(`onAction handler threw: ${handlerError?.message ?? handlerError}`);
      }
    }
  };

  // ---- rendering -----------------------------------------------------------

  // Transitions (opt-in per element with `transition: ms`). Only after the first render, so the initial page and
  // server markup never animate. Removal is delayed, never skipped, so state and DOM stay consistent.
  let firstRenderDone = false;
  let adopter = null; // set while the first render takes over server markup (src/adopt.js), null for every render after it
  const mountedEachPaths = dev ? new Set() : null; // development: the lists that rendered, so the check of the others skips them
  const checkedListProblems = dev ? new Map() : null; // development: list problem -> how many the check at mount reported; the first render of that list does not repeat those
  const reportListProblem = (code, details) => consumeCheckedListProblem(checkedListProblems, code, details) || reportError(code, details);
  const markEntering = (node) => {
    if (!node.__transitionMs || !firstRenderDone || replaying) return; // a replay rebuilds the state, it does not play it
    node.setAttribute('data-transition', 'enter');
    // Only the marker this call wrote is removed: a row that already left carries `leave`, which the removal itself ends.
    nextFrame(() => nextFrame(() => node.getAttribute('data-transition') === 'enter' && node.removeAttribute('data-transition')));
  };
  // Plugins that move rows (src/moves.js slides a row to its new place, src/follow.js keeps a picked-up row under the pointer) hear of
  // every reorder of a list: before it with the row elements that stay, and after it through the function they return.
  const reorderHandlers = new Set();
  // Props the grammar knows but a plugin writes (`follow`, src/follow.js): their writes go to the plugin that handles them, and the ones
  // made before it was installed (the first render) are kept and handed over then. The spec's use of them is noted when it is compiled.
  const propertyHandlers = Object.create(null);
  const pendingPropertyWrites = [];
  const pluginPropertiesUsed = new Set();
  const movesWarned = dev ? new Set() : null; // development: the lists whose rows jumped without the moves plugin, said once each
  const removeNode = (node) => {
    if (node.getAttribute?.('data-transition') === 'leave') return; // already on its way out: a second removal would schedule a second detach
    const detach = () => {
      node.remove(); // first: an observer that throws must not leave the node in the page
      elementObservers.forEach((observer) => observer.removed(node));
    };
    if (!node.__transitionMs || !firstRenderDone || replaying) return detach();
    node.setAttribute('data-transition', 'leave');
    setTimeout(detach, node.__transitionMs);
  };

  // ---- element observers (@ehtb/agent-ui/mount-element) --------------------------------------------------------------
  // A plugin that draws into an element learns when elements arrive in the page and leave it. `added` is called once an
  // element is in the page (after a row or a branch is inserted), `removed` when a node is taken out.
  const elementObservers = new Set();
  const isInsideRoot = (element) => {
    for (let ancestor = element; ancestor; ancestor = ancestor.parentNode) if (ancestor === root) return true;
    return false;
  };

  const setProperty = (element, name, value) => {
    if (name === 'follow') {
      if (propertyHandlers.follow) propertyHandlers.follow(element, value);
      else pendingPropertyWrites.push([element, name, value]);
      return;
    }
    if (name === 'soft') {
      // A soft link carries data-soft, which the navigation plugin of the page's shell reads on click; without a shell it is a normal link.
      if (value) element.setAttribute('data-soft', '');
      else element.removeAttribute('data-soft');
      return;
    }
    if (name === 'focus') {
      if (value) Promise.resolve().then(() => element.focus());
      return;
    }
    if (name === 'value' || name === 'checked' || name === 'disabled') {
      const next = name === 'value' ? (value ?? '') : Boolean(value);
      // An option's value lives in its attribute: the property of an empty option reads "" before its text arrives, and would be skipped.
      const current = name === 'value' && element.localName === 'option' ? element.getAttribute('value') : element[name];
      if (current !== next) element[name] = next;
      return;
    }
    if (URL_PROPS.includes(name) && isUnsafeUrl(name, value)) {
      reportError('AUI0301', { prop: name });
      element.removeAttribute(name);
      return;
    }
    // A root-absolute URL of the site is written below the base on the wire (src/base-path.js).
    if (basePath && BASE_PATH_ATTRIBUTES.includes(name)) value = withBaseInAttribute(basePath, name, value);
    const isAria = name.startsWith('aria-');
    if (value == null || (value === false && !isAria)) element.removeAttribute(name);
    else {
      const written = value === true && !isAria ? '' : String(value);
      // The same value is not written again: setting the src of an iframe or a video that already has it loads it again.
      if (element.getAttribute(name) !== written) element.setAttribute(name, written);
    }
  };

  // Like the bindings, nodes are compiled in two steps: compileNode(node, path) does the spec-walking once and returns
  // stamp(row), which creates one DOM instance and its effects. An `each` compiles its template once and stamps
  // it per row, so adding the 1,000th row never re-walks the template JSON.
  const compileNode = (node, path) => {
    if (typeof node === 'string') return () => (adopter ? adopter.text(node, false) : document.createTextNode(node));
    if (isBinding(node)) {
      const bindRow = planBinding(node);
      return (row) => {
        const readValue = bindRow(row);
        let textNode = null;
        effect(() => {
          const value = readValue() ?? '';
          // The first render of an adopted page takes the server's text node, which already holds the value (or makes one that does).
          if (textNode === null && adopter) textNode = adopter.text(String(value), true);
          else (textNode ??= document.createTextNode('')).data = value;
        });
        return textNode;
      };
    }
    if (node.each !== undefined) return compileEach(node, path);
    if (node.when !== undefined) return compileWhen(node, path);
    return compileElement(node, path);
  };

  // Observers hear of the elements a render added once the render is done and only for the ones that are in the page: one microtask
  // for all of them, in the order they were made.
  const addedElements = [];
  const announceAdded = (element) => {
    addedElements.push(element);
    if (addedElements.length > 1) return; // the microtask of the first one takes this one too
    queueMicrotask(() => {
      for (const added of addedElements.splice(0)) if (isInsideRoot(added)) elementObservers.forEach((observer) => observer.added(added));
    });
  };

  const compileElement = (node, path) => {
    const dataId = node.id || path;
    const props = node.props || {};
    const planProp = (name) => (isBinding(props[name]) ? { name, bindRow: planBinding(props[name]) } : { name, literal: props[name] });
    // Order matters: `type` must be set before `value`/`checked`, and a select's `value` can only be applied once
    // its options exist, so it is applied after the children.
    const propNames = Object.keys(props);
    if ('follow' in props) pluginPropertiesUsed.add('follow');
    const deferredNames = node.tag === 'select' ? propNames.filter((name) => name === 'value') : [];
    const hasClasses = Boolean(node.classes);
    // With `classes`, the one effect below writes the whole class attribute, so `class` is read there and not set twice.
    const immediatePlans = [
      ...propNames.filter((name) => name === 'type'),
      ...propNames.filter((name) => name !== 'type' && !deferredNames.includes(name) && !(hasClasses && name === 'class')),
    ].map(planProp);
    const deferredPlans = deferredNames.map(planProp);
    const classNames = node.classes ? Object.keys(node.classes) : null;
    const classPlans = classNames && classNames.map((className) => planBinding(node.classes[className]));
    const planBaseClass = classPlans && 'class' in props ? planProp('class') : null;
    const childStamps = toArray(node.children).map((child, index) => compileNode(child, `${path}.${index}`));
    const isSvg = SVG_TAGS.includes(node.tag); // drawn in the SVG namespace, or the browser makes an HTML element it does not draw

    // What the server wrote inside these elements is not the spec's to take: the slot of a shell holds the page's markup (the page's own
    // app takes it next), and a textarea's content is its value. The HTML id `app` is the mount point of a page (src/hydrate.js) and so reserved:
    // a childless element with that id is the shell's slot, whatever view it is in (`pageSlot()` writes it).
    const keepsServerChildren = node.tag === 'textarea' || (node.props?.id === APP_ELEMENT_ID && childStamps.length === 0);

    return (row) => {
      const claiming = adopter; // null once the first render is done: every element after that is made new
      const element = claiming ? claiming.element(node.tag, dataId, isSvg ? SVG_NAMESPACE : null) : isSvg ? document.createElementNS(SVG_NAMESPACE, node.tag) : document.createElement(node.tag);
      if (!claiming) element.setAttribute('data-id', dataId);
      const applyPlan = ({ name, bindRow, literal }) => {
        if (bindRow) {
          const readValue = bindRow(row);
          effect(() => setProperty(element, name, readValue()));
        } else {
          setProperty(element, name, literal);
        }
      };
      immediatePlans.forEach(applyPlan);

      if (classPlans) {
        const conditions = classPlans.map((bindRow) => bindRow(row));
        const readBaseClass = planBaseClass ? (planBaseClass.bindRow ? planBaseClass.bindRow(row) : () => planBaseClass.literal) : () => null;
        effect(() => {
          const active = classNames.filter((className, index) => conditions[index]());
          setProperty(element, 'class', [readBaseClass(), ...active].filter(Boolean).join(' ') || null);
        });
      }

      if (node.transition) element.__transitionMs = node.transition;
      if (node.on) {
        element.__handlers = node.on;
        element.__row = row;
      }
      // Adopted children are in their place already; appending one would move it (and an iframe or a video that moves starts again).
      for (const stamp of childStamps) {
        const child = stamp(row);
        if (!claiming) element.append(child);
      }
      claiming?.leave(keepsServerChildren);
      deferredPlans.forEach(applyPlan);
      if (elementObservers.size) announceAdded(element);
      return element;
    };
  };

  // Shows `children` while the binding is truthy and `otherwise` while it is falsy. Only the active branch exists;
  // it is rebuilt when truthiness flips, not on every change.
  const compileWhen = (node, path) => {
    const bindCondition = planBinding(node.when);
    const branchStamps = {
      children: toArray(node.children).map((child, index) => compileNode(child, `${path}.when.${index}`)),
      otherwise: toArray(node.otherwise).map((child, index) => compileNode(child, `${path}.otherwise.${index}`)),
    };

    return (row) => {
      // An adopted branch has no fragment: its markers and its nodes are in the page already, in the order they are claimed.
      const adopting = adopter;
      const fragment = adopting ? null : document.createDocumentFragment();
      // The branch lives between two markers. Removing "everything between the markers" also removes content that a
      // nested `when` or `each` (a direct child of this branch) added after the branch was mounted.
      const startMarker = adopting ? adopting.comment() : document.createComment('');
      let endMarker = adopting ? null : document.createComment(''); // adopted: claimed after the branch, which stands between the two
      const readCondition = bindCondition(row);
      let mountedBranch = null; // 'children' | 'otherwise' | null
      let disposeBranch = null;
      fragment?.append(startMarker, endMarker);
      // When an enclosing branch is disposed, this branch's current effects must go with it.
      if (activeScope) activeScope.push(() => disposeBranch?.());

      // One effect: it runs when the condition's inputs change and does nothing unless the truthiness flipped.
      effect(() => {
        const wantedBranch = readCondition() ? 'children' : 'otherwise';
        if (wantedBranch === mountedBranch) return;
        if (disposeBranch) {
          disposeBranch();
          for (let current = startMarker.nextSibling; current && current !== endMarker; ) {
            const following = current.nextSibling;
            removeNode(current);
            current = following;
          }
        }
        mountedBranch = wantedBranch;
        let branchNodes = [];
        disposeBranch = runInScope(() => {
          branchNodes = branchStamps[wantedBranch].map((stamp) => stamp(row));
        });
        if (adopter) return; // the first render of an adopted page: the branch is in the page already
        const parent = endMarker.parentNode;
        for (const branchNode of branchNodes) parent.insertBefore(branchNode, endMarker);
        branchNodes.forEach(markEntering);
      });
      if (adopting) endMarker = adopting.comment();
      return fragment;
    };
  };

  // One row per item, matched by key. Rows are reused, reordered in place, and disposed when removed.
  const compileEach = (node, path) => {
    const bindItems = typeof node.each === 'string' ? planBinding({ state: node.each }) : planBinding(node.each);
    const stampRow = compileNode(node.template, `${path}.each`);
    // key "." means the item itself is the key (a list of strings or numbers); {item: "."} reads it.
    const keyOf = node.key === '.' ? (item) => item : (item) => item?.[node.key];
    // The state or derived key the list reads, for the message of a duplicate (undefined for a list of an outer row).
    const source = typeof node.each === 'string' ? node.each : node.each.state;

    return (outerRow) => {
      mountedEachPaths?.add(path);
      const adopting = adopter; // an adopted list claims its end marker after its rows, which stand before it
      const fragment = adopting ? null : document.createDocumentFragment();
      let endMarker = adopting ? null : document.createComment('');
      const readItems = bindItems(outerRow);
      let rowsByKey = new Map();
      fragment?.append(endMarker);
      // When an enclosing branch is disposed, the rows' effects must go with it.
      if (activeScope) activeScope.push(() => rowsByKey.forEach((row) => row.dispose()));

      effect(() => {
        const items = [];
        const itemKeys = []; // the key of each item, read once
        const seenKeys = new Map(); // key -> position of the item that has it
        let position = -1;
        for (const item of readItems() || []) {
          position++;
          const key = keyOf(item);
          if (key === undefined || key === null || typeof key === 'object') reportListProblem('AUI0302', { key: node.key, path });
          // A second item with a key already seen would own a row that the first one has; it is left out, so no row is orphaned.
          else if (seenKeys.has(key)) reportListProblem('AUI0303', { value: key, path, key: node.key, source, first: seenKeys.get(key), second: position });
          else {
            seenKeys.set(key, position);
            items.push(item);
            itemKeys.push(key);
          }
        }
        forgetCheckedListProblems(checkedListProblems, path);
        const nextRowsByKey = new Map();
        const enteringRows = [];
        const parent = endMarker?.parentNode; // not claimed yet in the first render of an adopted page, which places nothing

        for (const [index, item] of items.entries()) {
          const key = itemKeys[index];
          let row = rowsByKey.get(key);
          if (row) {
            row.itemSignal.set(item);
          } else {
            adopter?.alignRow(key);
            row = { itemSignal: signal(item) };
            // The scope of this row: the enclosing rows' names stay readable, and `as` adds this row's own.
            const scope = { signal: row.itemSignal, key, names: node.as ? { ...outerRow?.names, [node.as]: row.itemSignal } : outerRow?.names ?? {}, keys: node.as ? { ...outerRow?.keys, [node.as]: key } : outerRow?.keys ?? {} };
            row.dispose = runInScope(() => {
              row.element = stampRow(scope);
            });
            row.element.setAttribute('data-key', key);
            enteringRows.push(row.element);
          }
          nextRowsByKey.set(key, row);
        }

        for (const [key, row] of rowsByKey) {
          if (nextRowsByKey.has(key)) continue;
          row.dispose();
          removeNode(row.element);
        }

        if (adopter) {
          // The first render of an adopted page: the rows are in the page, in order. Nothing is placed.
          rowsByKey = nextRowsByKey;
          return;
        }

        const afterReorder = reorderHandlers.size && rowsByKey.size ? [...reorderHandlers].map((handler) => handler([...rowsByKey].filter(([key]) => nextRowsByKey.has(key)).map(([, row]) => row.element))) : null;
        // Place rows in order, moving only the ones that are out of place (walking backwards).
        let followingNode = endMarker;
        let movedWithTransition = false;
        for (let index = items.length - 1; index >= 0; index--) {
          const rowElement = nextRowsByKey.get(itemKeys[index]).element;
          // A row that is leaving (transition) stays in the page for a while; it does not count as a neighbour.
          let neighbour = rowElement.nextSibling;
          while (neighbour && neighbour !== followingNode && neighbour.getAttribute?.('data-transition') === 'leave') neighbour = neighbour.nextSibling;
          if (neighbour !== followingNode) {
            if (rowElement.__transitionMs && rowsByKey.has(itemKeys[index])) movedWithTransition = true;
            parent.insertBefore(rowElement, followingNode);
          }
          followingNode = rowElement;
        }
        afterReorder?.forEach((after) => after?.());
        if (movesWarned && movedWithTransition && !reorderHandlers.size) noteRowsJumped(path, movesWarned);
        enteringRows.forEach(markEntering);
        rowsByKey = nextRowsByKey;
      });
      if (adopting) endMarker = adopting.comment();
      return fragment;
    };
  };

  // ---- events (one delegated listener per event type) ----------------------

  const handleEvent = (event) => {
    if (replaying) return; // the log is being played: an event now would write on top of it
    // The element the event started on can leave the page while the event is on its way here: a page inside this app removes
    // the button that closed its dialog, and the event keeps bubbling to the shell. The button may still carry the page's
    // handler, so it belongs to the app that already ran it, not to this one.
    const chain = [];
    let element = event.target;
    for (; element && element !== root; element = element.parentElement) chain.push(element);
    if (element !== root) return; // the path from the target no longer reaches this app
    // A row that is animating out is already gone: it ignores events.
    // An event from inside another app that mounted in this one (the page inside a shell) belongs to that app, which has handled it.
    if (chain.some((element) => element.__app || element.getAttribute('data-transition') === 'leave')) return;
    const chord = KEY_EVENTS.includes(event.type) ? eventKeyName(event) : null;
    for (const element of chain) {
      const handlers = element.__handlers;
      const handler = handlers && ((chord && handlers[`${event.type}.${chord}`]) || handlers[event.type]);
      if (!handler) continue;
      // A list of handlers runs in order, each as its own logged action; their arguments are all read first, from the
      // state as it was when the event happened. The first action that fails stops the list.
      const handlerList = typeof handler[0] === 'string' ? [handler] : handler;
      let invocations;
      try {
        invocations = handlerList.map(([actionName, argTemplates = {}, options = {}]) => {
          const args = {};
          for (const argName in argTemplates) {
            try {
              args[argName] = resolveArgument(argTemplates[argName], event, element.__row);
            } catch (error) {
              throw codedError('AUI0204', { action: actionName, argument: argName, cause: error?.message ?? String(error) });
            }
          }
          return { actionName, args, options };
        });
      } catch (error) {
        // Nothing can run with an argument unread, but a form still must not submit to the server.
        if (event.type === 'submit') event.preventDefault?.();
        return reportCaught(error);
      }
      // Forms submit to an action, not to the server: the default is prevented unless a handler opts out. With several
      // handlers, the ones that say preventDefault decide (any true prevents); only when none says, a submit is prevented.
      const stated = invocations.map(({ options }) => options.preventDefault).filter((value) => value !== undefined);
      if (stated.length ? stated.some(Boolean) : event.type === 'submit') event.preventDefault?.();
      if (invocations.some(({ options }) => options.stopPropagation)) event.stopPropagation?.();
      for (const { actionName, args } of invocations) {
        const error = dispatch(actionName, args);
        if (error) return error;
      }
      return;
    }
  };

  for (const eventType of DELEGATED_EVENTS) root.addEventListener(eventType, handleEvent);
  root.__app = true; // marks the root of an app, so an app that contains this one leaves its events and its outline alone
  // Server-rendered markup in the root is replaced, not adopted (see server/render-page.js). Focus and anything the
  // user typed before this script ran are carried over by data-id; a carried value lasts until an action writes the
  // state its binding reads, like any other unsubmitted input.
  // Spread: a browser's querySelectorAll returns a NodeList, which has no filter; the server DOM and the test shim return arrays.
  const formFieldsIn = (parent) => [...parent.querySelectorAll('[data-id]')].filter((element) => ['input', 'select', 'textarea'].includes(element.localName));
  const isCheckedField = (element) => ['checkbox', 'radio'].includes(element.getAttribute('type'));
  // An element is found again by its data-id and the keys of the rows it is in: the same field in every row has one data-id.
  // getAttribute, not dataset: dataset builds an object from every attribute for every ancestor, and this runs for each
  // field a server-rendered document carries.
  const addressOf = (element) => {
    const keys = [];
    for (let ancestor = element; ancestor && ancestor !== root; ancestor = ancestor.parentElement) {
      const key = ancestor.getAttribute?.('data-key');
      if (key !== null && key !== undefined) keys.push(key);
    }
    return `${element.getAttribute('data-id')}\u0000${keys.join('\u0000')}`;
  };
  const typedByAddress = new Map(formFieldsIn(root).map((field) => [addressOf(field), isCheckedField(field) ? field.checked : field.value]));
  const active = root.ownerDocument?.activeElement;
  const focusedAddress = active?.getAttribute?.('data-id') != null && isInsideRoot(active) ? addressOf(active) : null; // only what the app itself had focused
  // An app that is told to adopt takes the nodes the server wrote (src/adopt.js). Not expected, but if taking them over throws, what it
  // made is stopped, the root is emptied and the page is rendered from nothing, as an app that does not adopt does.
  let adoptionSummary = null;
  if (adopt && root.firstChild) {
    adopter = createAdopter(root, document);
    const adoptedEffects = [];
    const outerScope = activeScope;
    activeScope = adoptedEffects;
    try {
      compileNode(spec, '0')(null);
      adoptionSummary = adopter.finish();
      disposers.push(() => adoptedEffects.forEach((dispose) => dispose()));
    } catch (error) {
      adoptedEffects.forEach((dispose) => dispose());
      adoptionSummary = { created: 0, removed: 0, first: String(error?.message ?? error), restarted: true };
      adopter = null;
      activeScope = outerScope; // what the new render makes belongs to the app, not to the list of the one that failed
      root.replaceChildren(compileNode(spec, '0')(null));
    } finally {
      activeScope = outerScope;
      adopter = null;
    }
  } else {
    root.replaceChildren(compileNode(spec, '0')(null));
  }
  firstRenderDone = true;
  if (adoptionSummary && adopt === true) reportError('AUI0305', adoptionSummary);
  // Nothing to carry: no field held a value before this script ran, so walking the finished page would only be work. A
  // browser page with an input has one entry per field here and gets its typed values back; a server render has none.
  if (typedByAddress.size) {
    for (const field of formFieldsIn(root)) {
      const address = addressOf(field);
      if (!typedByAddress.has(address)) continue;
      const typed = typedByAddress.get(address);
      if (isCheckedField(field)) {
        if (field.checked !== Boolean(typed)) field.checked = Boolean(typed);
      } else if (field.value !== typed) field.value = typed;
    }
  }
  if (focusedAddress) [...root.querySelectorAll('[data-id]')].find((element) => addressOf(element) === focusedAddress)?.focus();

  // ---- agent API -----------------------------------------------------------

  const snapshotState = () => nestByNamespace(namespaceNames, stateKeys, (key) => signals[key].peek());

  // Inputs report `checked` for checkboxes and radios and `value` for everything else.
  const readInputState = (element) => {
    const hasValue = ['input', 'select', 'textarea'].includes(element.localName);
    const isChecked = element.localName === 'input' && isCheckedField(element);
    return { hasValue, isChecked, current: isChecked ? element.checked : element.value };
  };

  const isInsideAnotherApp = (element) => {
    for (let ancestor = element; ancestor && ancestor !== root; ancestor = ancestor.parentElement) if (ancestor.__app) return true;
    return false;
  };

  const describeInteractiveElement = (element) => {
    const { hasValue, isChecked, current } = readInputState(element);
    const handlers = element.__handlers || {};
    return {
      id: element.dataset.id,
      key: element.closest('[data-key]')?.dataset.key,
      tag: element.localName,
      label: element.getAttribute('aria-label') || element.textContent.trim().slice(0, 40),
      ...(hasValue && { [isChecked ? 'checked' : 'value']: current }),
      ...(element.localName === 'a' && { href: element.getAttribute('href') }),
      on: Object.fromEntries(Object.entries(handlers).map(([eventName, handler]) => [eventName, typeof handler[0] === 'string' ? handler[0] : handler.map(([actionName]) => actionName)])),
    };
  };

  // The rendered UI as nested JSON: tag, id, row key, own text, classes, and input values. Use it to check
  // non-interactive output (messages, classes, visibility) without a browser or screenshots.
  const isLeaving = (element) => {
    for (let ancestor = element; ancestor && ancestor !== root; ancestor = ancestor.parentElement) if (ancestor.getAttribute('data-transition') === 'leave') return true;
    return false;
  };
  const describeRenderedElement = (element) => {
    const childNodes = (element.__app && element !== root) || element.localName === 'textarea' ? [] : [...element.childNodes]; // the page inside a shell is described by its own app; a textarea's text is its value, described as `value`
    const text = childNodes.filter((child) => child.nodeType === 3).map((child) => child.data).join('').trim();
    const children = childNodes.filter((child) => child.nodeType === 1 && child.getAttribute('data-transition') !== 'leave').map(describeRenderedElement); // a row on its way out is gone
    const classes = (element.getAttribute('class') || '').split(' ').filter(Boolean);
    const { hasValue, isChecked, current } = readInputState(element);
    return {
      id: element.dataset.id,
      ...(element.dataset.key !== undefined && { key: element.dataset.key }),
      tag: element.localName,
      ...(text && { text }),
      ...(classes.length && { classes }),
      ...(hasValue && { [isChecked ? 'checked' : 'value']: current }),
      ...(children.length && { children }),
    };
  };

  const claimedFeatures = new Set();
  const api = {
    dispatch,
    settle,
    log,
    errors,
    // { namespace: { key: value } } for state; derived() has the same shape for derived values.
    state: snapshotState,
    derived: () => (refreshDerived(derivedOwner), nestByNamespace(namespaceNames, Object.keys(derive), (name) => signals[name].peek())),
    // Qualified name -> declared arguments.
    actions: () => Object.fromEntries(Object.entries(actions).map(([name, action]) => [name, action.args])),
    // What was declared: { namespace: { state, derive, actions, resources } }. Plugins read their own declarations here.
    namespaces: () => namespaces,
    // Every qualified state key and derived name ("todos.items"), and the current value of one of them.
    keys: () => [...stateKeys, ...Object.keys(derive)],
    get: (key) => {
      if (typeof key !== 'string' || !(key in signals)) throw unknownKeyError('get', String(key));
      if (key in derive) refreshDerived(derivedOwner, key);
      return signals[key].peek();
    },
    // The spec the app renders. Plugins that need to know what it holds (@ehtb/agent-ui/mount-element) read it here.
    spec: () => spec,
    // observer = { added(element), removed(node) }: added is called for every element in the page now and for each one that arrives
    // later (once it is in the page), removed when a node leaves it. Returns a function that stops observing.
    observeElements: (observer) => {
      elementObservers.add(observer);
      for (const element of root.querySelectorAll('[data-id]')) if (!isInsideAnotherApp(element)) observer.added(element);
      return () => elementObservers.delete(observer);
    },
    // A plugin that reads a part of the declarations (the `resources` of every namespace) says so, so a declaration nobody reads is reported.
    claim: (feature) => claimedFeatures.add(feature),
    // The plugin that writes a prop the grammar leaves to a plugin (`follow`, src/follow.js) takes its writes: handler(element, value), now
    // for the writes the first render made and then for every later one.
    handleProperty: (name, handler) => {
      checkPropertyHandler(name, handler, propertyHandlers);
      propertyHandlers[name] = handler;
      claimedFeatures.add(name);
      for (const [element, propertyName, value] of pendingPropertyWrites.splice(0)) if (propertyName === name) handler(element, value);
    },
    // handler(rowElements) before every reorder of a list, with the row elements that stay; it may return a function, called after the
    // rows are in their new places (src/moves.js, src/follow.js). Returns a function that removes the handler.
    onReorder: (handler) => {
      reorderHandlers.add(handler);
      return () => reorderHandlers.delete(handler);
    },
    // Calls callback({"namespace.key": value, ...}) now and after every change to any listed key (state or derived).
    // `owns` claims qualified state keys so dev mode refuses writes from any other action.
    watch: (keys, callback, { owns } = {}) => {
      if (owns) {
        for (const key of owns.keys) {
          if (key in stateOwners) failOwnedTwice(owns.where, key, stateOwners[key].where);
          stateOwners[key] = owns;
        }
      }
      let previousValues = null;
      const stop = effect(() => {
        const values = keys.map((key) => trackedGet(key));
        // A write that an action rolled back leaves the values as they were: nothing changed, so nothing is called again.
        if (previousValues && values.every((value, index) => value === previousValues[index])) return;
        previousValues = values;
        // The callback is not part of what the watch depends on (an action it dispatches reads keys of its own): only the listed keys are.
        const trackingEffect = activeEffect;
        activeEffect = null;
        try {
          callback(Object.fromEntries(keys.map((key, index) => [key, values[index]])));
        } finally {
          activeEffect = trackingEffect;
        }
      });
      if (!activeScope) disposers.push(stop); // a watch made after mount, outside the scope of app(), is still stopped by destroy()
      return stop;
    },
    // The interactive surface as JSON: what an agent can find, read, and trigger.
    tree: () =>
      [...root.querySelectorAll('[data-id]')]
        .filter((element) => element.__handlers || element.localName === 'a')
        .filter((element) => !isInsideAnotherApp(element) && !isLeaving(element))
        .map(describeInteractiveElement),
    outline: () => [...root.childNodes].filter((child) => child.nodeType === 1 && child.getAttribute('data-transition') !== 'leave').map(describeRenderedElement),
    // Stops the app: its effects, its event listeners and the plugins' cleanups (onDestroy), then empties its root. Later
    // dispatches do nothing. Idempotent. A page that is replaced by another (soft navigation) is destroyed first.
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      for (const cleanup of cleanups.splice(0).reverse()) cleanup();
      disposers.forEach((dispose) => dispose());
      for (const eventType of DELEGATED_EVENTS) root.removeEventListener(eventType, handleEvent);
      delete root.__app;
      root.replaceChildren();
      if (typeof window !== 'undefined' && window.__ui === api) delete window.__ui;
    },
    get destroyed() {
      return destroyed;
    },
    // Called with { code, details, message, error, action, app } for every error the runtime catches and does not throw again (a failed
    // dispatch, an update that threw, a blocked URL). This is where a monitoring tool plugs in (docs/GUIDE.md, "Reporting errors"). Returns a function that removes the handler.
    onError: (handler) => {
      errorHandlers.add(handler);
      return () => errorHandlers.delete(handler);
    },
    // Calls handler({ name, args, replaying }) after every action that succeeded and was logged (the debug console uses it, src/devtools.js). Returns a function that removes it.
    onAction: (handler) => {
      actionHandlers.add(handler);
      return () => actionHandlers.delete(handler);
    },
    // A plugin hands over an error it caught and will not throw again, so it is kept in `errors`, written to the console and shown to the onError handlers like the runtime's own.
    report: reportCaught,
    // A plugin that holds something outside the app (a timer, a request in flight, a window listener) hands over how to let go of it.
    onDestroy: (cleanup) => {
      if (destroyed) cleanup();
      else cleanups.push(cleanup);
    },
    // A plugin that has something in flight (a request, a timer) hears that a replay starts, whether or not a key it watches changes.
    onReplay: (handler) => void replayHandlers.push(handler),
    // True while replay() runs. Plugins that talk to the outside world (network, timers) must stay quiet then.
    get replaying() {
      return replaying;
    },
    replay: async (actionLog = log.slice()) => {
      const resetValues = JSON.parse(initialStateJson);
      replaying = true;
      try {
        for (const handler of replayHandlers) handler();
        log.length = 0;
        for (const key of stateKeys) writeState(key, resetValues[key]);
        await settle();
        for (const [name, args] of actionLog) {
          dispatch(name, args);
          await settle();
        }
      } finally {
        replaying = false;
      }
      return snapshotState();
    },
  };

  appApi = api;
  if (typeof window !== 'undefined') window.__ui = api;
  // An app that cannot finish starting leaves nothing running: its effects, listeners and the plugins that did start are stopped.
  try {
    plugins.forEach((plugin, index) => {
      if (typeof plugin !== 'function') fail('app', `plugins[${index}] is ${typeof plugin}, not a function`, 'A plugin is (api) => void; a page lists a factory such as withResources in page.js plugins');
      // A page factory in app() would return its plugin and install nothing (the prop or the resources it handles stay unhandled),
      // so the package's factories say so. A plugin's own return value is not inspected: `(api) => api.watch(...)` ends with an
      // unsubscribe function and is a correct plugin.
      if (plugin[PAGE_PLUGIN]) {
        fail('app', `plugins[${index}]${plugin.name ? ` ("${plugin.name}")` : ''} is a page plugin factory`, 'A factory (environment) => plugin belongs in page.js plugins; app() takes the plugin itself: follow, moves, resources(fetchFunction), navigation({ ... })');
      }
      plugin(api);
    });
    for (const [namespace, definition] of Object.entries(namespaces)) {
      if (definition.resources?.length && !claimedFeatures.has('resources')) {
        fail(`namespace "${namespace}"`, 'declares resources, but no plugin loads them', 'Add the resources plugin to plugins (resources(fetchFunction), imported from @ehtb/agent-ui/resources); in a page write `plugins: [withResources]`');
      }
    }
    checkPluginProperties(pluginPropertiesUsed, claimedFeatures);
    // Development: a list in a branch that is not shown yet is checked now too, so a duplicate key in its data is found before the branch opens.
    if (dev) checkEachKeys(spec, (key) => (key in derive && refreshDerived(derivedOwner, key), signals[key]?.peek()), mountedEachPaths, checkedListProblems, reportError);
    const started = startupReports;
    startupReports = null;
    started.forEach(deliver);
    // debug: the console shows what the app does (src/devtools.js). Its code is a chunk of its own, fetched only for an app that asks.
    if (debug) {
      import('./devtools.js').then((module) => !api.destroyed && module.mountDevtools(api), (error) => console.warn(`debug: the debug console could not be loaded: ${error.message}`));
    }
  } catch (error) {
    api.destroy();
    throw error;
  }
  return api;
};
