const module_spec_core = (() => {
const BINDING_KEYS = ['state', 'item', 'row', 'rowState', 'not', 'length', 'equals', 'greaterThan', 'lessThan', 'and', 'or', 'join'];
const DELEGATED_EVENTS = ['click', 'dblclick', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerover', 'pointerout', 'input', 'change', 'keydown', 'keyup', 'focusin', 'focusout', 'submit'];
const KEY_EVENTS = ['keydown', 'keyup'];
const APP_ELEMENT_ID = 'app';
const TEXT_SEPARATOR = '|';
const URL_PROPS = ['href', 'src', 'action', 'formaction'];
const SVG_TAGS = ['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'use'];
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const ELEMENT_FIELDS = ['id', 'classes', 'on', 'transition'];
const PAGE_PLUGIN = Symbol.for('agent-ui.pagePlugin');
const markPagePlugin = (factory) => Object.assign(factory, { [PAGE_PLUGIN]: true });
const valueForState = (value, state) => (typeof value === 'function' ? value(state) : value);
const isPlainObject = (value) => {
if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
const prototype = Object.getPrototypeOf(value);
return prototype === Object.prototype || prototype === null;
};
const isBinding = (value) => isPlainObject(value) && BINDING_KEYS.some((key) => key in value);
const toArray = (children) => (children == null ? [] : Array.isArray(children) ? children : [children]);
const describeValue = (value) => (value === null ? 'null' : Array.isArray(value) ? 'a list' : typeof value);
const matchesArgumentType = (value, type) =>
type === 'json' ? value !== undefined && typeof value !== 'function' : typeof value === type;
const isUnsafeUrl = (name, value) => {
if (typeof value !== 'string') return false;
const scheme = value.replace(/[\u0000- ]/g, '').toLowerCase();
if (/^(javascript|vbscript):/.test(scheme)) return true;
return name !== 'src' && scheme.startsWith('data:');
};
const isSameValue = (previous, next, depth) => {
if (previous === next) return true;
if (depth === 0) return false;
if (Array.isArray(previous) && Array.isArray(next)) {
return previous.length === next.length && previous.every((value, index) => isSameValue(value, next[index], depth - 1));
}
if (isPlainObject(previous) && isPlainObject(next)) {
const keys = Object.keys(previous);
return keys.length === Object.keys(next).length && keys.every((key) => key in next && isSameValue(previous[key], next[key], depth - 1));
}
return false;
};
const readEventPath = (event, path) => path.split('.').reduce((value, part) => value?.[part], event);
const nextFrame = (callback) => (globalThis.requestAnimationFrame ? globalThis.requestAnimationFrame(callback) : setTimeout(callback, 16));
const eventKeyName = (event) =>
[event.ctrlKey && 'Control', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Meta', event.key]
.filter(Boolean)
.join('+');
const splitRowPath = (path) => {
const dot = path.indexOf('.');
return dot === -1 ? [path, undefined] : [path.slice(0, dot), path.slice(dot + 1)];
};
return { BINDING_KEYS, DELEGATED_EVENTS, KEY_EVENTS, APP_ELEMENT_ID, TEXT_SEPARATOR, URL_PROPS, SVG_TAGS, SVG_NAMESPACE, ELEMENT_FIELDS, PAGE_PLUGIN, markPagePlugin, valueForState, isPlainObject, isBinding, toArray, describeValue, matchesArgumentType, isUnsafeUrl, isSameValue, readEventPath, nextFrame, eventKeyName, splitRowPath };
})();
const module_validate = (() => {
const validate = () => [];
const grammar = Object.freeze({});
const findJsonProblems = () => [];
const findShapeProblems = () => [];
return { validate, grammar, findJsonProblems, findShapeProblems };
})();
const module_messages = (() => {
const editDistance = (first, second) => {
const table = Array.from({ length: first.length + 1 }, (_, i) => Array.from({ length: second.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
for (let i = 1; i <= first.length; i++) {
for (let j = 1; j <= second.length; j++) {
const same = first[i - 1] === second[j - 1] ? 0 : 1;
table[i][j] = Math.min(table[i - 1][j] + 1, table[i][j - 1] + 1, table[i - 1][j - 1] + same);
if (i > 1 && j > 1 && first[i - 1] === second[j - 2] && first[i - 2] === second[j - 1]) table[i][j] = Math.min(table[i][j], table[i - 2][j - 2] + 1);
}
}
return table[first.length][second.length];
};
const closest = (word, candidates) => {
const ranked = candidates.map((candidate) => [candidate, editDistance(String(word), String(candidate))]).sort((first, second) => first[1] - second[1]);
return ranked[0] ?? null;
};
const didYouMean = (word, candidates, maximumDistance = 3) => {
const best = closest(word, candidates);
return best && best[1] <= maximumDistance ? `Did you mean "${best[0]}"? ` : '';
};
const problem = (where, what, fix) => `${where}: ${what}. ${fix}`;
const fail = (where, what, fix) => {
throw new Error(problem(where, what, fix));
};
const failOwnedTwice = (where, key, otherWhere) =>
fail(where, `state key "${key}" is already owned by ${otherWhere}`, 'Give each resource its own state keys, or remove the duplicate from "owns"');
return { closest, didYouMean, problem, fail, failOwnedTwice };
})();
const module_runtime_checks = (() => {
const checkAdopt = () => {};
const checkBasePath = () => {};
const checkPropertyHandler = () => {};
const checkPluginProperties = () => {};
const noteRowsJumped = () => {};
const checkRowState = () => {};
const checkRowKey = () => {};
const checkRowChanges = () => {};
const checkRowStateWrite = () => {};
const consumeCheckedListProblem = () => false;
const forgetCheckedListProblems = () => {};
const checkEachKeys = () => {};
const describeAdoptionDifference = () => null;
return { checkAdopt, checkBasePath, checkPropertyHandler, checkPluginProperties, noteRowsJumped, checkRowState, checkRowKey, checkRowChanges, checkRowStateWrite, consumeCheckedListProblem, forgetCheckedListProblems, checkEachKeys, describeAdoptionDifference };
})();
const module_error_messages = (() => {
const describeError = () => null;
const describeUnknownKey = () => '';
const MESSAGES = {};
const decodeError = () => null;
return { describeError, describeUnknownKey, MESSAGES, decodeError };
})();
const module_errors = (() => {
const { describeError } = module_error_messages;
const errorText = (code, details, context) => describeError(code, details, context) ?? `${code} ${JSON.stringify(details)}`;
const codedError = (code, details, context) => Object.assign(new Error(errorText(code, details, context)), { code, details });
return { errorText, codedError };
})();
const module_namespaces = (() => {
const IDENTIFIER = /^[a-z][A-Za-z0-9]*$/;
const RESERVED_NAMESPACE = 'route';
const NAMESPACE_KEYS = ['state', 'derive', 'actions', 'resources', 'shapes', 'rowState'];
const ROW_STATE_KEY = 'rowState';
const SHAPE_KEYS = ['fields', 'validate'];
const ACTION_KEYS = ['args', 'run', 'calls'];
const splitStatePath = (path) => {
const [namespace, name, ...fields] = path.split('.');
return { namespace, name, key: name === undefined ? null : `${namespace}.${name}`, fields };
};
const flattenNamespaces = (namespaces) => {
const state = Object.create(null);
const derive = Object.create(null);
const actions = Object.create(null);
const shapes = Object.create(null);
const rowStates = Object.create(null);
for (const [namespace, definition] of Object.entries(namespaces)) {
for (const [name, value] of Object.entries(definition.state ?? {})) state[`${namespace}.${name}`] = value;
if (definition.rowState) {
state[`${namespace}.${ROW_STATE_KEY}`] = {};
rowStates[namespace] = definition.rowState;
}
for (const [name, compute] of Object.entries(definition.derive ?? {})) derive[`${namespace}.${name}`] = { namespace, compute };
for (const [name, shape] of Object.entries(definition.shapes ?? {})) shapes[`${namespace}.${name}`] = shape;
for (const [verb, action] of Object.entries(definition.actions ?? {})) {
actions[`${namespace}.${verb}`] = { name: `${namespace}.${verb}`, namespace, args: action.args, run: action.run, calls: action.calls ?? [] };
}
}
return { state, derive, actions, shapes, rowStates };
};
const mergeStateValues = (flatState, initialState = {}) => {
const merged = { ...flatState };
for (const [namespace, values] of Object.entries(initialState)) {
for (const [name, value] of Object.entries(values ?? {})) {
if (`${namespace}.${name}` in merged) merged[`${namespace}.${name}`] = value;
}
}
return merged;
};
const mergeInitialState = (...partialStates) => {
const merged = {};
for (const partial of partialStates) {
for (const [namespace, values] of Object.entries(partial ?? {})) merged[namespace] = { ...merged[namespace], ...values };
}
return merged;
};
const nestByNamespace = (namespaceNames, qualifiedKeys, read) => {
const nested = Object.fromEntries(namespaceNames.map((namespace) => [namespace, {}]));
for (const key of qualifiedKeys) {
const dot = key.indexOf('.');
nested[key.slice(0, dot)][key.slice(dot + 1)] = read(key);
}
return nested;
};
const declaredStateKeys = (definition) => [...Object.keys(definition?.state ?? {}), ...(definition?.rowState ? [ROW_STATE_KEY] : [])];
return { IDENTIFIER, RESERVED_NAMESPACE, NAMESPACE_KEYS, ROW_STATE_KEY, SHAPE_KEYS, ACTION_KEYS, splitStatePath, flattenNamespaces, mergeStateValues, mergeInitialState, nestByNamespace, declaredStateKeys };
})();
const module_base_path = (() => {
const withBase = (basePath, url) => (basePath && typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? `${basePath}${url}` : url);
const LIST_ATTRIBUTES = { ping: ' ', srcset: ',' };
const BASE_PATH_ATTRIBUTES = ['href', 'src', 'action', 'formaction', 'cite', 'ping', 'srcset'];
const withBaseInAttribute = (basePath, name, value) => {
if (!basePath || typeof value !== 'string') return value;
const separator = LIST_ATTRIBUTES[name];
if (!separator) return withBase(basePath, value);
return value
.split(separator)
.map((part) => part.replace(/^(\s*)(\S+)/, (match, space, url) => space + withBase(basePath, url)))
.join(separator);
};
const withoutBase = (basePath, pathname) => {
if (!basePath) return pathname;
if (pathname === basePath) return '/';
return pathname.startsWith(`${basePath}/`) ? pathname.slice(basePath.length) : null;
};
return { withBase, BASE_PATH_ATTRIBUTES, withBaseInAttribute, withoutBase };
})();
const module_adopt = (() => {
const { TEXT_SEPARATOR } = module_spec_core;
const { describeAdoptionDifference } = module_runtime_checks;
const isDocumentMarker = (node) => node.nodeType === 8 && (node.data === 'ssr:start' || node.data === 'ssr:end');
const LOOKAHEAD = 100;
const createAdopter = (root, document) => {
let parent = root;
let next = root.firstChild;
if (next && isDocumentMarker(next)) next = next.nextSibling;
const frames = [];
let created = 0;
let removed = 0;
let first = null;
let freshElement = false;
let afterText = false;
const note = (kind, subject, found) => {
first ??= describeAdoptionDifference(kind, subject, parent === root ? null : parent, found);
};
const dropUntil = (until) => {
while (next && next !== until) {
const following = next.nextSibling;
if (!isDocumentMarker(next)) {
note('extra', null, next);
next.remove();
removed++;
}
next = following;
}
};
const insertFresh = (node) => {
parent.insertBefore(node, next);
created++;
return node;
};
return {
element: (tag, dataId, namespace) => {
const wanted = tag.toLowerCase();
let found = null;
if (!freshElement) {
let node = next;
for (let looked = 0; node && looked <= LOOKAHEAD; node = node.nextSibling, looked++) {
if (node.nodeType === 1 && node.localName.toLowerCase() === wanted && node.getAttribute('data-id') === dataId) {
found = node;
break;
}
}
}
freshElement = false;
let element = found;
if (found) dropUntil(found);
else {
note('element', { tag: wanted, dataId }, next);
element = insertFresh(namespace ? document.createElementNS(namespace, tag) : document.createElement(tag));
element.setAttribute('data-id', dataId);
}
frames.push({ parent, resume: element.nextSibling });
parent = element;
next = element.firstChild;
afterText = false;
return element;
},
leave: (keepChildren) => {
if (!keepChildren) dropUntil(null);
({ parent, resume: next } = frames.pop());
afterText = false;
},
text: (value, dynamic) => {
if (afterText && next?.nodeType === 8 && next.data === TEXT_SEPARATOR) next = next.nextSibling;
afterText = true;
if (next && next.nodeType === 3) {
const node = next;
next = node.nextSibling;
if (node.data !== value) {
if (!dynamic) {
note('text', value, node);
created++;
}
node.data = value;
}
return node;
}
if (value === '') return parent.insertBefore(document.createTextNode(''), next);
if (!dynamic) note('text', value, next);
const node = document.createTextNode(value);
parent.insertBefore(node, next);
if (!dynamic) created++;
return node;
},
comment: () => {
let node = next;
for (let looked = 0; node && looked <= LOOKAHEAD; node = node.nextSibling, looked++) {
if (node.nodeType === 8 && node.data === '') {
dropUntil(node);
next = node.nextSibling;
afterText = false;
return node;
}
if (node.nodeType === 1 && node.getAttribute('data-key') === null) break;
}
note('marker', null, next);
afterText = false;
return insertFresh(document.createComment(''));
},
alignRow: (key) => {
const wanted = String(key);
let node = next;
for (let looked = 0; node && looked <= LOOKAHEAD; node = node.nextSibling, looked++) {
if (node.nodeType === 1 && node.getAttribute('data-key') === wanted) {
dropUntil(node);
return;
}
}
freshElement = true;
},
finish: () => {
dropUntil(null);
return created || removed ? { created, removed, first } : null;
},
};
};
return { createAdopter };
})();
const module_ui = (() => {
const { APP_ELEMENT_ID, DELEGATED_EVENTS, KEY_EVENTS, PAGE_PLUGIN, SVG_NAMESPACE, SVG_TAGS, URL_PROPS, isBinding, isPlainObject, toArray, matchesArgumentType, isUnsafeUrl, isSameValue, nextFrame, readEventPath, eventKeyName, splitRowPath } = module_spec_core;
const { validate, grammar, findJsonProblems, findShapeProblems } = module_validate;
const { didYouMean, fail, failOwnedTwice } = module_messages;
const { checkAdopt, checkBasePath, checkPluginProperties, checkPropertyHandler, noteRowsJumped, checkRowChanges, checkRowKey, checkRowState, checkRowStateWrite, checkEachKeys, consumeCheckedListProblem, forgetCheckedListProblems } = module_runtime_checks;
const { codedError } = module_errors;
const { ROW_STATE_KEY, flattenNamespaces, mergeInitialState, mergeStateValues, nestByNamespace, splitStatePath } = module_namespaces;
const { BASE_PATH_ATTRIBUTES, withBaseInAttribute } = module_base_path;
const { createAdopter } = module_adopt;
let activeEffect = null;
let activeScope = null;
let activeReport = null;
let effectRuns = 0;
const countEffectRuns = () => effectRuns;
const pendingEffects = new Set();
let flushScheduled = false;
const scheduleFlush = () => {
if (flushScheduled) return;
flushScheduled = true;
queueMicrotask(flushEffects);
};
const MAX_DERIVED_ROUNDS = 1000;
const loopError = (names) => {
const chain = [...new Set(names)];
return codedError('AUI0107', { chain: [...chain, chain[0]] });
};
const refreshDerived = (owner, wanted = null) => {
const failed = [];
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
try {
runEffect();
} catch (error) {
(runEffect.report ?? ((reported) => console.error(reported.message)))(error);
}
};
const trail = [];
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
const signal = (initialValue) => {
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
const effect = (callback, { owner = null, derivedName = null } = {}) => {
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
runEffect.owner = owner;
runEffect.derivedName = derivedName;
runEffect();
const dispose = () => {
runEffect.disposed = true;
for (const subscribers of runEffect.dependencies) subscribers.delete(runEffect);
};
if (activeScope) activeScope.push(dispose);
return dispose;
};
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
const settle = async () => {
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
const APP_OPTIONS = ['namespaces', 'initialState', 'spec', 'root', 'plugins', 'dev', 'debug', 'basePath', 'specChecked', 'adopt'];
const app = (options) => {
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
for (const key of Object.keys(options ?? {})) {
if (!APP_OPTIONS.includes(key)) fail('app', `unknown option "${key}"`, `${didYouMean(key, APP_OPTIONS)}Allowed options: ${APP_OPTIONS.join(', ')}`);
}
const { namespaces = {}, initialState = {}, spec, root, plugins = [], dev, debug = false, basePath = '', specChecked = false, adopt = false } = options;
if (typeof dev !== 'boolean') fail('app', `dev is ${JSON.stringify(dev) ?? 'missing'}`, 'Pass dev: true while developing (state is frozen and mistakes are reported) and dev: false in production. There is no default, so the mode is always written down');
if (debug !== undefined && typeof debug !== 'boolean') fail('app', `debug is ${JSON.stringify(debug)}`, 'Write debug: true to make the browser console show what the app does, or leave it out');
checkAdopt(adopt);
checkBasePath(basePath);
const document = root.ownerDocument ?? globalThis.document;
const problems = specChecked ? [] : validate(spec, { namespaces, initialState });
if (problems.length) {
throw Object.assign(new Error(`app: the spec has ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n${problems.join('\n')}`), { problems });
}
const namespaceNames = Object.keys(namespaces);
const flat = flattenNamespaces(namespaces);
const derive = flat.derive;
const actions = flat.actions;
const initialStateJson = JSON.stringify(mergeStateValues(flat.state, initialState));
const initialValues = JSON.parse(initialStateJson);
const stateKeys = Object.keys(flat.state);
const stateKeySet = new Set(stateKeys);
const signals = Object.create(null);
const log = [];
const errors = [];
const stateOwners = Object.create(null);
const undoLog = [];
let runningAction = null;
let replaying = false;
let destroyed = false;
const cleanups = [];
const replayHandlers = [];
const errorHandlers = new Set();
let appApi = null;
const reportCaught = (error) => {
const message = String(error?.message ?? error);
errors.push(message);
console.error(message);
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
let startupReports = [];
const reportError = (code, details, context) => reportCaught(codedError(code, details, context));
activeReport = reportCaught;
const writeState = (key, value) => signals[key].set(dev ? freezeDeep(value) : value);
for (const key of stateKeys) {
signals[key] = signal(dev ? freezeDeep(initialValues[key]) : initialValues[key]);
}
const resolveKey = (namespace, key, operation) => {
if (typeof key !== 'string') throw codedError('AUI0101', { operation, key });
const dot = key.indexOf('.');
if (dot === -1) return `${namespace}.${key}`;
if (key.slice(0, dot) === namespace) throw codedError('AUI0102', { operation, key, namespace });
return key;
};
const unknownKeyError = (operation, key, fromNamespace = null) => codedError('AUI0103', { operation, key, fromNamespace }, { namespaceNames, knownKeys: [...Object.keys(flat.state), ...Object.keys(derive)] });
const computing = [];
const derivedOwner = { pending: new Set() };
const initializeDerived = (name) => {
signals[name] = signal();
const { namespace, compute } = derive[name];
const get = (key) => trackedGet(resolveKey(namespace, key, 'get'), namespace);
effect(() => {
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
getRow: (id) => {
checkRowState('getRow', action.namespace, rowDefaults);
return { ...rowDefaults, ...storedRows()[rowKeyOf(id, 'getRow')] };
},
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
const createStateReader = (path) => {
const { key, fields } = splitStatePath(path);
const source = signals[key];
if (!fields.length) return source.get;
return () => fields.reduce((value, part) => value?.[part], source.get());
};
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
const parts = binding.rowState.split('.');
const [rowName, namespace, field] = parts.length === 3 ? parts : [null, ...parts];
const rowsSignal = signals[`${namespace}.${ROW_STATE_KEY}`];
const fallback = flat.rowStates[namespace][field];
return (row) => {
const value = signal();
effect(() => {
const rows = rowsSignal.get();
const rowKey = String(rowName === null ? row.key : row.keys[rowName]);
const stored = Object.hasOwn(rows, rowKey) ? rows[rowKey] : undefined;
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
default:
return bindOperands((operands) => () => operands.map((operand) => operand() ?? '').join(''));
}
};
const resolveArgument = (argument, event, row) => {
if (!isPlainObject(argument)) return argument;
if ('event' in argument) return readEventPath(event, argument.event);
if ('item' in argument) return argument.item === '.' ? row.signal.peek() : row.signal.peek()[argument.item];
if ('row' in argument) {
const [name, field] = splitRowPath(argument.row);
return field === undefined ? row.names[name].peek() : row.names[name].peek()[field];
}
if ('state' in argument) return createStateReader(argument.state)();
return argument;
};
const checkArguments = (name, args) => {
for (const argName in actions[name].args) {
const expected = actions[name].args[argName];
if (!matchesArgumentType(args[argName], expected)) return { action: name, argument: argName, expected, got: typeof args[argName] };
}
return undefined;
};
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
const dispatch = (name, args = {}) => {
if (destroyed) return undefined;
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
let firstRenderDone = false;
let adopter = null;
const mountedEachPaths = dev ? new Set() : null;
const checkedListProblems = dev ? new Map() : null;
const reportListProblem = (code, details) => consumeCheckedListProblem(checkedListProblems, code, details) || reportError(code, details);
const markEntering = (node) => {
if (!node.__transitionMs || !firstRenderDone || replaying) return;
node.setAttribute('data-transition', 'enter');
nextFrame(() => nextFrame(() => node.getAttribute('data-transition') === 'enter' && node.removeAttribute('data-transition')));
};
const reorderHandlers = new Set();
const propertyHandlers = Object.create(null);
const pendingPropertyWrites = [];
const pluginPropertiesUsed = new Set();
const movesWarned = dev ? new Set() : null;
const removeNode = (node) => {
if (node.getAttribute?.('data-transition') === 'leave') return;
const detach = () => {
node.remove();
elementObservers.forEach((observer) => observer.removed(node));
};
if (!node.__transitionMs || !firstRenderDone || replaying) return detach();
node.setAttribute('data-transition', 'leave');
setTimeout(detach, node.__transitionMs);
};
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
const current = name === 'value' && element.localName === 'option' ? element.getAttribute('value') : element[name];
if (current !== next) element[name] = next;
return;
}
if (URL_PROPS.includes(name) && isUnsafeUrl(name, value)) {
reportError('AUI0301', { prop: name });
element.removeAttribute(name);
return;
}
if (basePath && BASE_PATH_ATTRIBUTES.includes(name)) value = withBaseInAttribute(basePath, name, value);
const isAria = name.startsWith('aria-');
if (value == null || (value === false && !isAria)) element.removeAttribute(name);
else {
const written = value === true && !isAria ? '' : String(value);
if (element.getAttribute(name) !== written) element.setAttribute(name, written);
}
};
const compileNode = (node, path) => {
if (typeof node === 'string') return () => (adopter ? adopter.text(node, false) : document.createTextNode(node));
if (isBinding(node)) {
const bindRow = planBinding(node);
return (row) => {
const readValue = bindRow(row);
let textNode = null;
effect(() => {
const value = readValue() ?? '';
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
const addedElements = [];
const announceAdded = (element) => {
addedElements.push(element);
if (addedElements.length > 1) return;
queueMicrotask(() => {
for (const added of addedElements.splice(0)) if (isInsideRoot(added)) elementObservers.forEach((observer) => observer.added(added));
});
};
const compileElement = (node, path) => {
const dataId = node.id || path;
const props = node.props || {};
const planProp = (name) => (isBinding(props[name]) ? { name, bindRow: planBinding(props[name]) } : { name, literal: props[name] });
const propNames = Object.keys(props);
if ('follow' in props) pluginPropertiesUsed.add('follow');
const deferredNames = node.tag === 'select' ? propNames.filter((name) => name === 'value') : [];
const hasClasses = Boolean(node.classes);
const immediatePlans = [
...propNames.filter((name) => name === 'type'),
...propNames.filter((name) => name !== 'type' && !deferredNames.includes(name) && !(hasClasses && name === 'class')),
].map(planProp);
const deferredPlans = deferredNames.map(planProp);
const classNames = node.classes ? Object.keys(node.classes) : null;
const classPlans = classNames && classNames.map((className) => planBinding(node.classes[className]));
const planBaseClass = classPlans && 'class' in props ? planProp('class') : null;
const childStamps = toArray(node.children).map((child, index) => compileNode(child, `${path}.${index}`));
const isSvg = SVG_TAGS.includes(node.tag);
const keepsServerChildren = node.tag === 'textarea' || (node.props?.id === APP_ELEMENT_ID && childStamps.length === 0);
return (row) => {
const claiming = adopter;
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
const compileWhen = (node, path) => {
const bindCondition = planBinding(node.when);
const branchStamps = {
children: toArray(node.children).map((child, index) => compileNode(child, `${path}.when.${index}`)),
otherwise: toArray(node.otherwise).map((child, index) => compileNode(child, `${path}.otherwise.${index}`)),
};
return (row) => {
const adopting = adopter;
const fragment = adopting ? null : document.createDocumentFragment();
const startMarker = adopting ? adopting.comment() : document.createComment('');
let endMarker = adopting ? null : document.createComment('');
const readCondition = bindCondition(row);
let mountedBranch = null;
let disposeBranch = null;
fragment?.append(startMarker, endMarker);
if (activeScope) activeScope.push(() => disposeBranch?.());
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
if (adopter) return;
const parent = endMarker.parentNode;
for (const branchNode of branchNodes) parent.insertBefore(branchNode, endMarker);
branchNodes.forEach(markEntering);
});
if (adopting) endMarker = adopting.comment();
return fragment;
};
};
const compileEach = (node, path) => {
const bindItems = typeof node.each === 'string' ? planBinding({ state: node.each }) : planBinding(node.each);
const stampRow = compileNode(node.template, `${path}.each`);
const keyOf = node.key === '.' ? (item) => item : (item) => item?.[node.key];
const source = typeof node.each === 'string' ? node.each : node.each.state;
return (outerRow) => {
mountedEachPaths?.add(path);
const adopting = adopter;
const fragment = adopting ? null : document.createDocumentFragment();
let endMarker = adopting ? null : document.createComment('');
const readItems = bindItems(outerRow);
let rowsByKey = new Map();
fragment?.append(endMarker);
if (activeScope) activeScope.push(() => rowsByKey.forEach((row) => row.dispose()));
effect(() => {
const items = [];
const itemKeys = [];
const seenKeys = new Map();
let position = -1;
for (const item of readItems() || []) {
position++;
const key = keyOf(item);
if (key === undefined || key === null || typeof key === 'object') reportListProblem('AUI0302', { key: node.key, path });
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
const parent = endMarker?.parentNode;
for (const [index, item] of items.entries()) {
const key = itemKeys[index];
let row = rowsByKey.get(key);
if (row) {
row.itemSignal.set(item);
} else {
adopter?.alignRow(key);
row = { itemSignal: signal(item) };
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
rowsByKey = nextRowsByKey;
return;
}
const afterReorder = reorderHandlers.size && rowsByKey.size ? [...reorderHandlers].map((handler) => handler([...rowsByKey].filter(([key]) => nextRowsByKey.has(key)).map(([, row]) => row.element))) : null;
let followingNode = endMarker;
let movedWithTransition = false;
for (let index = items.length - 1; index >= 0; index--) {
const rowElement = nextRowsByKey.get(itemKeys[index]).element;
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
const handleEvent = (event) => {
if (replaying) return;
const chain = [];
let element = event.target;
for (; element && element !== root; element = element.parentElement) chain.push(element);
if (element !== root) return;
if (chain.some((element) => element.__app || element.getAttribute('data-transition') === 'leave')) return;
const chord = KEY_EVENTS.includes(event.type) ? eventKeyName(event) : null;
for (const element of chain) {
const handlers = element.__handlers;
const handler = handlers && ((chord && handlers[`${event.type}.${chord}`]) || handlers[event.type]);
if (!handler) continue;
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
if (event.type === 'submit') event.preventDefault?.();
return reportCaught(error);
}
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
root.__app = true;
const formFieldsIn = (parent) => [...parent.querySelectorAll('[data-id]')].filter((element) => ['input', 'select', 'textarea'].includes(element.localName));
const isCheckedField = (element) => ['checkbox', 'radio'].includes(element.getAttribute('type'));
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
const focusedAddress = active?.getAttribute?.('data-id') != null && isInsideRoot(active) ? addressOf(active) : null;
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
activeScope = outerScope;
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
const snapshotState = () => nestByNamespace(namespaceNames, stateKeys, (key) => signals[key].peek());
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
const isLeaving = (element) => {
for (let ancestor = element; ancestor && ancestor !== root; ancestor = ancestor.parentElement) if (ancestor.getAttribute('data-transition') === 'leave') return true;
return false;
};
const describeRenderedElement = (element) => {
const childNodes = (element.__app && element !== root) || element.localName === 'textarea' ? [] : [...element.childNodes];
const text = childNodes.filter((child) => child.nodeType === 3).map((child) => child.data).join('').trim();
const children = childNodes.filter((child) => child.nodeType === 1 && child.getAttribute('data-transition') !== 'leave').map(describeRenderedElement);
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
state: snapshotState,
derived: () => (refreshDerived(derivedOwner), nestByNamespace(namespaceNames, Object.keys(derive), (name) => signals[name].peek())),
actions: () => Object.fromEntries(Object.entries(actions).map(([name, action]) => [name, action.args])),
namespaces: () => namespaces,
keys: () => [...stateKeys, ...Object.keys(derive)],
get: (key) => {
if (typeof key !== 'string' || !(key in signals)) throw unknownKeyError('get', String(key));
if (key in derive) refreshDerived(derivedOwner, key);
return signals[key].peek();
},
spec: () => spec,
observeElements: (observer) => {
elementObservers.add(observer);
for (const element of root.querySelectorAll('[data-id]')) if (!isInsideAnotherApp(element)) observer.added(element);
return () => elementObservers.delete(observer);
},
claim: (feature) => claimedFeatures.add(feature),
handleProperty: (name, handler) => {
checkPropertyHandler(name, handler, propertyHandlers);
propertyHandlers[name] = handler;
claimedFeatures.add(name);
for (const [element, propertyName, value] of pendingPropertyWrites.splice(0)) if (propertyName === name) handler(element, value);
},
onReorder: (handler) => {
reorderHandlers.add(handler);
return () => reorderHandlers.delete(handler);
},
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
if (previousValues && values.every((value, index) => value === previousValues[index])) return;
previousValues = values;
const trackingEffect = activeEffect;
activeEffect = null;
try {
callback(Object.fromEntries(keys.map((key, index) => [key, values[index]])));
} finally {
activeEffect = trackingEffect;
}
});
if (!activeScope) disposers.push(stop);
return stop;
},
tree: () =>
[...root.querySelectorAll('[data-id]')]
.filter((element) => element.__handlers || element.localName === 'a')
.filter((element) => !isInsideAnotherApp(element) && !isLeaving(element))
.map(describeInteractiveElement),
outline: () => [...root.childNodes].filter((child) => child.nodeType === 1 && child.getAttribute('data-transition') !== 'leave').map(describeRenderedElement),
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
onError: (handler) => {
errorHandlers.add(handler);
return () => errorHandlers.delete(handler);
},
onAction: (handler) => {
actionHandlers.add(handler);
return () => actionHandlers.delete(handler);
},
report: reportCaught,
onDestroy: (cleanup) => {
if (destroyed) cleanup();
else cleanups.push(cleanup);
},
onReplay: (handler) => void replayHandlers.push(handler),
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
try {
plugins.forEach((plugin, index) => {
if (typeof plugin !== 'function') fail('app', `plugins[${index}] is ${typeof plugin}, not a function`, 'A plugin is (api) => void; a page lists a factory such as withResources in page.js plugins');
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
if (dev) checkEachKeys(spec, (key) => (key in derive && refreshDerived(derivedOwner, key), signals[key]?.peek()), mountedEachPaths, checkedListProblems, reportError);
const started = startupReports;
startupReports = null;
started.forEach(deliver);
if (debug) {
import("./devtools.47ac9dc5.js").then((chunk) => chunk.module_devtools).then((module) => !api.destroyed && module.mountDevtools(api), (error) => console.warn(`debug: the debug console could not be loaded: ${error.message}`));
}
} catch (error) {
api.destroy();
throw error;
}
return api;
};
return { validate, grammar, isPlainObject, toArray, isSameValue, readEventPath, eventKeyName, mergeInitialState, countEffectRuns, signal, effect, settle, app };
})();
export { module_base_path, module_spec_core, module_ui, module_errors, module_messages, module_namespaces };
