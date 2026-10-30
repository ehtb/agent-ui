// Static validation of specs, and the machine-readable `grammar`. Runs once at mount and reports every problem as
// "specPath: problem". Production builds may leave this module out (`validator: 'omit'`); dev builds and tests keep it.
import { didYouMean } from './messages.js';
import { BINDING_KEYS, DELEGATED_EVENTS, URL_PROPS, describeValue, isBinding, isPlainObject, toArray, matchesArgumentType, isUnsafeUrl, splitRowPath } from './spec-core.js';
import { describeUnknownKey } from './error-messages.js';
import { checkArgumentNames, checkHandlerParts, checkKeyChord, checkUnknownKeys as describeUnknownKeys } from './handler-checks.js';
import { ATTRIBUTES, ATTRIBUTE_PREFIXES, isPrefixedAttribute, isReservedAttribute, ALLOWED_TAGS, ARGUMENT_TYPES, EACH_KEYS, ELEMENT_KEYS, LABELLED_TAGS, OPERAND_COUNTS, VOID_TAGS, WHEN_KEYS, grammar } from './grammar.js';
import { ACTION_KEYS, IDENTIFIER, NAMESPACE_KEYS, ROW_STATE_KEY, SHAPE_KEYS, declaredStateKeys, flattenNamespaces, splitStatePath } from './namespaces.js';

// ---------------------------------------------------------------------------
// Grammar constants (single source of truth for the validator, the runtime and the docs)
// ---------------------------------------------------------------------------

const ALLOWED_TAGS_SET = new Set(ALLOWED_TAGS);
const VOID_TAGS_SET = new Set(VOID_TAGS);
const LABELLED_TAGS_SET = new Set(LABELLED_TAGS);

export { grammar };

// ---------------------------------------------------------------------------
// Static validation
// ---------------------------------------------------------------------------

// State is saved, replayed and sent to the browser as JSON, so every value must survive JSON.stringify unchanged.
// Reports each problem inside `value`, with the path to it. Used for the initial state and, in development, for every
// value an action writes (the production stub returns no problems).
export const findJsonProblems = (value, path) => {
  const problems = [];
  checkJson(value, path, problems, []);
  return problems;
};

const checkJson = (value, path, problems, ancestors) => {
  const fix = (why, change) => problems.push(`${path}: ${why}. ${change}`);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') return Number.isFinite(value) ? undefined : fix(`${value} is not JSON`, 'Use a finite number, or null for "no value"');
  if (value === undefined) return fix('undefined is not JSON', 'Use null for "no value"');
  if (typeof value === 'function') return fix('a function is not JSON', 'Keep functions in `derive` and actions; state holds plain data');
  if (typeof value === 'bigint' || typeof value === 'symbol') return fix(`a ${typeof value} is not JSON`, 'Use a number or a string');
  if (ancestors.includes(value)) return fix('it contains itself', 'State must be a tree without loops');
  if (Array.isArray(value)) return value.forEach((item, index) => checkJson(item, `${path}[${index}]`, problems, [...ancestors, value]));
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return fix(`${value?.constructor?.name ?? 'this object'} is not a plain object, so it would change when saved as JSON`, 'Store plain data: a Date as value.toISOString(), a Map as an array of pairs, a Set as an array');
  for (const [key, item] of Object.entries(value)) checkJson(item, `${path}.${key}`, problems, [...ancestors, value]);
};

const quoteAll = (names) => names.map((name) => `"${name}"`).join(', ');

// `shapes: { items: { fields: { id: 'number', title: 'string' }, validate } }`: what one item of a list looks like. `fields`
// feeds the static check of {item} bindings and the runtime check of writes; `validate` is for rules a type cannot say.
const checkShapes = (namespace, shapes, stateTable, deriveTable, where, problems) => {
  if (!isPlainObject(shapes)) {
    problems.push(`${where}: shapes must be an object of state key or derived name to { fields?, validate? }, got ${Array.isArray(shapes) ? 'a list' : typeof shapes}`);
    return;
  }
  const known = [...Object.keys(stateTable), ...Object.keys(deriveTable)];
  for (const [name, shape] of Object.entries(shapes)) {
    const at = `${where}: shapes.${name}`;
    if (!known.includes(name)) problems.push(`${at}: "${name}" is not a state key or derived value of "${namespace}". ${didYouMean(name, known)}It has: ${known.join(', ') || 'none'}`);
    if (!isPlainObject(shape)) {
      problems.push(`${at}: must be an object { fields?, validate? }, got ${typeof shape}`);
      continue;
    }
    const before = problems.length;
    for (const key of Object.keys(shape)) if (!SHAPE_KEYS.includes(key)) problems.push(`${at}: unknown key "${key}". ${didYouMean(key, SHAPE_KEYS)}Allowed keys: ${SHAPE_KEYS.join(', ')}`);
    if (shape.fields === undefined && shape.validate === undefined) problems.push(`${at}: needs fields, validate or both. Write { fields: { id: 'number', title: 'string' } }`);
    if (shape.fields !== undefined) {
      if (!isPlainObject(shape.fields) || !Object.keys(shape.fields).length) problems.push(`${at}.fields: must be a non-empty object of field name to type (${ARGUMENT_TYPES.join(', ')})`);
      else for (const [field, type] of Object.entries(shape.fields)) if (!ARGUMENT_TYPES.includes(type)) problems.push(`${at}.fields.${field}: bad type ${JSON.stringify(type)}. Types are ${ARGUMENT_TYPES.join(', ')} ("json" for any value)`);
    }
    if (shape.validate !== undefined && typeof shape.validate !== 'function') problems.push(`${at}.validate: must be a function (item) => string | null, the message when the item is wrong`);
    // The declared value must already fit its shape.
    if (problems.length === before && name in stateTable) problems.push(...findShapeProblems(stateTable[name], shape, `state ${namespace}.${name}`));
  }
};

// Checks the declaration of the namespaces themselves: names, shapes, `calls`. Reports every problem as "where: problem. fix".
const checkNamespaces = (namespaces, initialState, problems) => {
  if (!isPlainObject(namespaces)) {
    problems.push(`namespaces: must be an object of namespace name to { ${NAMESPACE_KEYS.join(', ')} }. Write namespaces: { todos: { state: { items: [] }, actions: { ... } } }`);
    return false;
  }
  const namespaceNames = Object.keys(namespaces);
  const allActions = new Set();
  for (const [namespace, definition] of Object.entries(namespaces)) {
    if (isPlainObject(definition) && isPlainObject(definition.actions)) {
      // Only a namespace with a valid name has actions to call: "my.ns" is reported on its own, and a call to it must not look it up.
      if (IDENTIFIER.test(namespace)) for (const verb of Object.keys(definition.actions)) if (IDENTIFIER.test(verb)) allActions.add(`${namespace}.${verb}`);
    }
  }
  const identifierProblem = (where, name, advice) => {
    if (IDENTIFIER.test(name)) return false;
    const suggestion = name.replace(/[^A-Za-z0-9]+([A-Za-z0-9])/g, (_, letter) => letter.toUpperCase()).replace(/[^A-Za-z0-9]/g, '').replace(/^./, (first) => first.toLowerCase());
    problems.push(`${where}: "${name}" is not allowed. ${advice} Write ${IDENTIFIER.test(suggestion) ? `"${suggestion}"` : 'letters and digits, starting with a lowercase letter'}`);
    return true;
  };

  for (const [namespace, definition] of Object.entries(namespaces)) {
    const where = `namespace "${namespace}"`;
    if (identifierProblem('namespace', namespace, 'A namespace name is the first half of every state key and action name ("todos.add"), so it is letters and digits starting with a lowercase letter, no dots or dashes.')) continue;
    if (!isPlainObject(definition)) {
      problems.push(`${where}: must be an object { state?, derive?, actions?, resources?, shapes? }, got ${Array.isArray(definition) ? 'a list' : definition === null ? 'null' : typeof definition}`);
      continue;
    }
    const unknownKeys = Object.keys(definition).filter((key) => !NAMESPACE_KEYS.includes(key));
    for (const key of unknownKeys) problems.push(`${where}: unknown key "${key}". ${didYouMean(key, NAMESPACE_KEYS)}Allowed keys: ${NAMESPACE_KEYS.join(', ')}`);
    for (const [key, kind] of [['state', 'object'], ['derive', 'object'], ['actions', 'object']]) {
      if (definition[key] !== undefined && !isPlainObject(definition[key])) problems.push(`${where}: ${key} must be an ${kind} of names to ${key === 'state' ? 'values' : key === 'derive' ? 'functions' : '{ args, run }'}, got ${Array.isArray(definition[key]) ? 'a list' : typeof definition[key]}`);
    }
    if (definition.resources !== undefined && !Array.isArray(definition.resources)) problems.push(`${where}: resources must be a list, got ${typeof definition.resources}. Write resources: [{ watch, request, onStart, onSuccess, onError }]`);

    const stateTable = isPlainObject(definition.state) ? definition.state : {};
    if (definition.rowState !== undefined) {
      if (!isPlainObject(definition.rowState) || !Object.keys(definition.rowState).length) problems.push(`${where}: rowState must be an object of row field names to their default values, for example rowState: { open: false, note: '' }`);
      else {
        for (const [field, fallback] of Object.entries(definition.rowState)) {
          identifierProblem(`${where} rowState field`, field, 'It is the second half of "namespace.field" in a rowState binding, so it is letters and digits starting with a lowercase letter.');
          checkJson(fallback, `rowState ${namespace}.${field}`, problems, []);
        }
      }
      if (ROW_STATE_KEY in stateTable) problems.push(`${where}: state key "${ROW_STATE_KEY}" clashes with rowState, which keeps the per-row values in a state key of that name. Rename the state key`);
    }
    const deriveTable = isPlainObject(definition.derive) ? definition.derive : {};
    const actionTable = isPlainObject(definition.actions) ? definition.actions : {};
    for (const name of Object.keys(stateTable)) {
      identifierProblem(`${where} state key`, name, 'It is the second half of "namespace.key" in bindings, so it is letters and digits starting with a lowercase letter.');
      checkJson(stateTable[name], `state ${namespace}.${name}`, problems, []);
    }
    if (definition.shapes !== undefined) checkShapes(namespace, definition.shapes, stateTable, deriveTable, where, problems);
    for (const [name, compute] of Object.entries(deriveTable)) {
      identifierProblem(`${where} derived value`, name, 'It is the second half of "namespace.name" in bindings, so it is letters and digits starting with a lowercase letter.');
      if (typeof compute !== 'function') problems.push(`derive ${namespace}.${name}: must be a function (get) => value`);
      if (name in stateTable) problems.push(`derive ${namespace}.${name}: has the same name as a state key of "${namespace}", and a derived value would silently replace it. Rename one of them`);
    }
    for (const [verb, action] of Object.entries(actionTable)) {
      const name = `${namespace}.${verb}`;
      if (identifierProblem(`${where} action`, verb, 'The action is called "namespace.verb" and the namespace already says what it is about, so the verb is letters and digits starting with a lowercase letter.')) continue;
      if (!isPlainObject(action)) {
        problems.push(`action ${name}: must be an object { args, run }, got ${typeof action}`);
        continue;
      }
      for (const key of Object.keys(action)) if (!ACTION_KEYS.includes(key)) problems.push(`action ${name}: unknown key "${key}". ${didYouMean(key, ACTION_KEYS)}Allowed keys: ${ACTION_KEYS.join(', ')}`);
      if (typeof action.run !== 'function') problems.push(`action ${name}: run must be a function`);
      if (action.args === undefined || action.args === null || typeof action.args !== 'object' || Array.isArray(action.args)) {
        problems.push(`action ${name}: args is required and must be an object. Write args: {} for an action without arguments, or args: { name: 'string' }`);
      }
      for (const [argName, type] of Object.entries(action.args || {})) {
        if (!ARGUMENT_TYPES.includes(type)) problems.push(`action ${name}.${argName}: bad type ${type}`);
      }
      if (action.calls !== undefined) {
        if (!Array.isArray(action.calls)) {
          problems.push(`action ${name}: calls must be a list of action names. Write calls: ['search.clear']`);
          continue;
        }
        action.calls.forEach((called, index) => {
          const calledWhere = `action ${name}: calls[${index}] ${JSON.stringify(called)}`;
          if (typeof called !== 'string' || !allActions.has(called)) {
            problems.push(`${calledWhere} is not an action. ${typeof called === 'string' ? didYouMean(called, [...allActions]) : ''}Actions: ${[...allActions].join(', ') || 'none'}`);
          } else if (called.startsWith(`${namespace}.`)) {
            problems.push(`${calledWhere} is in the same namespace "${namespace}". calls is for actions of other namespaces; share code inside a namespace with a plain function`);
          } else if (namespaces[called.split('.')[0]].actions[called.split('.')[1]]?.calls?.length) {
            problems.push(`${calledWhere} itself declares calls. A called action cannot call further actions (one level only). Call the final actions from ${name} directly`);
          } else if (action.calls.indexOf(called) !== index) {
            problems.push(`${calledWhere} is listed twice. Remove the duplicate`);
          }
        });
      }
    }
  }

  // The state a page starts from: only declared keys, and values that survive JSON.
  if (!isPlainObject(initialState)) problems.push('initialState: must be an object { namespace: { key: value } }, the shape of ui.state()');
  else {
    for (const [namespace, values] of Object.entries(initialState)) {
      if (!(namespace in namespaces)) {
        problems.push(`initialState: unknown namespace "${namespace}". ${didYouMean(namespace, namespaceNames)}Namespaces: ${quoteAll(namespaceNames) || 'none'}. initialState has the shape of ui.state(): { namespace: { key: value } }`);
        continue;
      }
      if (!isPlainObject(values)) {
        problems.push(`initialState.${namespace}: must be an object of state keys to values, got ${typeof values}`);
        continue;
      }
      const declaredKeys = declaredStateKeys(namespaces[namespace]);
      for (const key of Object.keys(values)) {
        if (!declaredKeys.includes(key)) problems.push(`initialState.${namespace}.${key}: "${namespace}" has no state key "${key}". ${didYouMean(key, declaredKeys)}State keys of "${namespace}": ${declaredKeys.join(', ') || 'none'}`);
        else {
          const before = problems.length;
          checkJson(values[key], `initialState ${namespace}.${key}`, problems, []);
          const shape = namespaces[namespace].shapes?.[key];
          if (isPlainObject(shape) && problems.length === before) problems.push(...findShapeProblems(values[key], shape, `initialState ${namespace}.${key}`));
        }
      }
    }
  }
  return true;
};

// The problems of a list of items against a shape ({ fields?: { name: type }, validate?: (item) => string | null }), with the
// item's index: a missing or unknown field, a wrong type, or what `validate` says. `validate` is the hook for a runtime type
// checker such as zod (it only judges; the framework never imports one). Used for declared and incoming state and, in
// development, for every write of a key that has a shape (the production stub returns no problems).
// Items that already passed a shape. Writes keep the identity of unchanged items (replace, never mutate; development
// freezes state), so a one-item change checks one item. Lives here, in the module production builds replace with a stub,
// so none of it ships. A shape's rules are pure functions of the item, which is what makes remembering a pass exact.
const passedItems = new WeakMap(); // shape -> WeakSet of items
export const findShapeProblems = (value, shape, path) => {
  const fix = 'Fix the value, or change the shape in "shapes"';
  if (!Array.isArray(value)) return [`${path}: this key has a shape, so it holds a list of items, got ${describeValue(value)}. ${fix}`];
  const problems = [];
  const names = shape.fields ? Object.keys(shape.fields) : [];
  if (!passedItems.has(shape)) passedItems.set(shape, new WeakSet());
  const passed = passedItems.get(shape);
  value.forEach((item, index) => {
    if (passed.has(item)) return;
    const before = problems.length;
    const where = `${path}: item ${index}`;
    if (shape.fields) {
      if (!isPlainObject(item)) {
        problems.push(`${where} must be an object with the fields ${names.join(', ')}, got ${describeValue(item)}. ${fix}`);
        return;
      }
      for (const name of names) {
        if (!(name in item)) problems.push(`${where} is missing the field "${name}". ${fix}`);
        else if (!matchesArgumentType(item[name], shape.fields[name])) problems.push(`${where}: field "${name}" should be ${shape.fields[name]}, got ${describeValue(item[name])}. ${fix}`);
      }
      for (const key of Object.keys(item)) {
        if (!names.includes(key)) problems.push(`${where} has the unknown field "${key}". ${didYouMean(key, names)}Fields: ${names.join(', ')}. ${fix}`);
      }
    }
    // `validate` sees only items whose fields already fit, so it can rely on the declared field types.
    if (shape.validate && problems.length === before) {
      let answer;
      try {
        answer = shape.validate(item);
      } catch (error) {
        answer = `the shape's validate threw: ${error.message}`;
      }
      if (typeof answer === 'string' && answer) problems.push(`${where}: ${answer}`);
    }
    if (problems.length === before && item !== null && typeof item === 'object') passed.add(item);
  });
  return problems;
};

// Returns a list of "specPath: problem" strings. `$` is the root of the spec. `namespaces` is what app() takes
// (src/namespaces.js); problems in the declarations come first, and the spec is checked against what they declare.
const VALIDATE_CONTEXT = ['namespaces', 'initialState'];

export const validate = (spec, context = {}) => {
  const problems = [];
  for (const key of Object.keys(context ?? {})) {
    if (!VALIDATE_CONTEXT.includes(key)) problems.push(`validate: unknown context key "${key}". ${didYouMean(key, VALIDATE_CONTEXT)}Allowed keys: ${VALIDATE_CONTEXT.join(', ')}`);
  }
  if (problems.length) return problems;
  const { namespaces = {}, initialState = {} } = context ?? {};
  if (!checkNamespaces(namespaces, initialState, problems) || problems.length) return problems;
  const { state, derive, actions, shapes, rowStates } = flattenNamespaces(namespaces);
  const knownStateKeys = new Set([...Object.keys(state), ...Object.keys(derive)]);
  const explicitIds = new Set();
  const rowStateSources = new Map(); // namespace -> the list its rowState is read for, and where

  // {state: "todos.items.0.title"} reads key "todos.items", then the path ".0.title" inside its value.
  const checkStateKey = (path, specPath) => {
    const { namespace, name, fields } = typeof path === 'string' ? splitStatePath(path) : { fields: [] };
    if (fields.includes('')) {
      problems.push(`${specPath}: state ${path} has an empty path segment. Remove the extra or trailing dot`);
      return;
    }
    if (name !== undefined && knownStateKeys.has(`${namespace}.${name}`)) return;
    problems.push(`${specPath}: unknown state ${path}. ${describeMissingKey(namespace, name)}`);
  };
  const describeMissingKey = (namespace, name) => {
    const namespaceNames = Object.keys(namespaces);
    if (namespace === undefined) return `A state binding is written namespace.key. Namespaces: ${namespaceNames.join(', ') || 'none'}`;
    if (name === undefined) {
      const owners = [...knownStateKeys].filter((key) => key.split('.')[1] === namespace);
      return `A state binding is written namespace.key.${owners.length ? ` Did you mean ${owners.map((key) => `"${key}"`).join(' or ')}?` : ` ${didYouMean(namespace, [...knownStateKeys])}`}`.trimEnd();
    }
    return describeUnknownKey(namespace, name, namespaceNames, [...knownStateKeys]);
  };

  // A literal is JSON: a string, a finite number, a boolean or null. Anything else (undefined, NaN, Infinity, a function) is lost or changed when the spec is
  // written as data, so the page would differ from what was written.
  const notJson = (value) => value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint' || (typeof value === 'number' && !Number.isFinite(value));
  const checkOperand = (operand, specPath, insideEach) => {
    if (isBinding(operand)) checkBinding(operand, specPath, insideEach);
    else if (operand !== null && typeof operand === 'object') {
      problems.push(`${specPath}: operand must be a binding or a literal`);
    } else if (notJson(operand)) {
      problems.push(`${specPath}: operand ${String(operand)} is not a literal. Use a string, a finite number, a boolean or null, or a binding`);
    }
  };

  const checkBinding = (binding, specPath, insideEach) => {
    const keys = Object.keys(binding);
    if (keys.length !== 1) {
      problems.push(`${specPath}: a binding has exactly one key (${BINDING_KEYS.join(', ')}), got ${keys.join(', ')}`);
      return;
    }
    const [operator] = keys;
    const operand = binding[operator];
    if (operator === 'state') return checkStateKey(operand, specPath);
    if (operator === 'item') {
      if (typeof operand !== 'string' || !operand) problems.push(`${specPath}: item needs a field name. Write item('title'), or item('.') for the whole row`);
      if (!insideEach) problems.push(`${specPath}: item binding outside each`);
      else if (typeof operand === 'string' && operand !== '.' && insideEach.fields && !(operand in insideEach.fields)) {
        const fieldNames = Object.keys(insideEach.fields);
        problems.push(`${specPath}: unknown item field ${operand}. ${didYouMean(operand, fieldNames)}Fields of "${insideEach.name}": ${fieldNames.join(', ')}`);
      }
      return;
    }
    if (operator === 'row') {
      if (typeof operand !== 'string' || !operand) return problems.push(`${specPath}: row needs "name.field", the name an enclosing each gives with as and a field of its item. Write row('order.total')`);
      if (!insideEach) return problems.push(`${specPath}: row binding outside each. A row binding reads a row of an enclosing each that says as: 'name'`);
      const [name, field] = splitRowPath(operand);
      const names = Object.keys(insideEach.names);
      if (!(name in insideEach.names)) return problems.push(`${specPath}: no enclosing each says as: "${name}". ${didYouMean(name, names)}${names.length ? `Names in scope: ${names.join(', ')}` : 'No enclosing each has an as. Write each(source, key, template, { as: "name" }) on the outer each'}`);
      const fields = insideEach.names[name];
      if (field !== undefined && fields && !(field in fields)) problems.push(`${specPath}: unknown field ${field} of the rows named "${name}". ${didYouMean(field, Object.keys(fields))}Fields: ${Object.keys(fields).join(', ')}`);
      return;
    }
    if (operator === 'rowState') {
      const parts = typeof operand === 'string' ? operand.split('.') : [];
      if (!insideEach) return problems.push(`${specPath}: rowState binding outside each. The per-row state belongs to a row of an enclosing each`);
      if (parts.length !== 2 && parts.length !== 3) return problems.push(`${specPath}: rowState needs "namespace.field" (the innermost row) or "rowname.namespace.field" (the row an enclosing each names with as), for example rowState('pickers.open') or rowState('group.pickers.open')`);
      const [rowName, namespace, field] = parts.length === 3 ? parts : [null, ...parts];
      let rowSource = insideEach.source;
      if (rowName !== null) {
        const names = Object.keys(insideEach.names);
        if (!(rowName in insideEach.names)) return problems.push(`${specPath}: no enclosing each says as: "${rowName}". ${didYouMean(rowName, names)}${names.length ? `Names in scope: ${names.join(', ')}` : 'No enclosing each has an as. Write each(source, key, template, { as: "name" }) on the outer each'}`);
        rowSource = insideEach.sources[rowName];
      }
      if (!(namespace in rowStates)) return problems.push(`${specPath}: namespace "${namespace}" has no rowState. ${didYouMean(namespace, Object.keys(rowStates))}Declare it: rowState: { ${field}: <default> }${Object.keys(rowStates).length ? `. Namespaces with rowState: ${Object.keys(rowStates).join(', ')}` : ''}`);
      if (!(field in rowStates[namespace])) return problems.push(`${specPath}: rowState of "${namespace}" has no field "${field}". ${didYouMean(field, Object.keys(rowStates[namespace]))}Fields: ${Object.keys(rowStates[namespace]).join(', ')}`);
      // The map is keyed by the row key alone, so two lists would share an entry when their keys match.
      const earlier = rowStateSources.get(namespace);
      if (earlier === undefined) rowStateSources.set(namespace, { source: rowSource, specPath });
      else if (earlier.source !== rowSource) problems.push(`${specPath}: rowState of "${namespace}" is read for the rows of ${rowSource}, and ${earlier.specPath} reads it for the rows of ${earlier.source}. The state is keyed by row key alone, so rows with the same key in both lists would share it. Declare a second namespace with its own rowState for one of the lists`);
      return;
    }
    if (operator === 'not' || operator === 'length') return checkOperand(operand, specPath, insideEach);
    const [minimum, maximum] = OPERAND_COUNTS[operator];
    if (!Array.isArray(operand) || operand.length < minimum || operand.length > maximum) {
      const expected = maximum === 2 ? '[x, y]' : minimum === 2 ? 'a list of at least 2 operands' : 'a list of operands';
      problems.push(`${specPath}: ${operator} needs ${expected}`);
      return;
    }
    operand.forEach((item, index) => checkOperand(item, `${specPath}.${index}`, insideEach));
  };

  const requireBinding = (value, specPath, insideEach) => {
    if (isBinding(value)) checkBinding(value, specPath, insideEach);
    else problems.push(`${specPath}: needs a binding`);
  };

  const checkUnknownKeys = (node, allowedKeys, specPath) => problems.push(...describeUnknownKeys(specPath, node, allowedKeys));

  const checkProp = (name, value, specPath, insideEach) => {
    const propPath = `${specPath}.props.${name}`;
    if (name === 'className') problems.push(`${propPath}: use "class"`);
    if (name === 'htmlFor') problems.push(`${propPath}: use "for"`);
    if (isReservedAttribute(name)) problems.push(`${propPath}: "${name}" is reserved for the framework. It marks what a server wrote into the head and the end of the body. Use another data-* name`);
    else if (/^on[A-Za-z]/.test(name)) problems.push(`${propPath}: events go in the "on" key, not props`);
    else if (name !== 'className' && name !== 'htmlFor' && !ATTRIBUTES.includes(name) && !isPrefixedAttribute(name)) {
      problems.push(`${propPath}: unknown attribute "${name}". ${ATTRIBUTE_PREFIXES.some((prefix) => name.startsWith(prefix)) ? 'A data-* or aria-* name needs something after the prefix and no space, quote, <, >, / or =. Write for example data-row-id' : `${didYouMean(name, ATTRIBUTES)}Attributes are the ones of HTML (src/grammar.js, ATTRIBUTES), data-* and aria-*; an attribute that is missing from that list is added there`}`);
    }
    if (name === 'soft' && value !== true) return problems.push(`${propPath}: soft is ${JSON.stringify(value)}. Write soft: true on a link, or leave it out (a bound value is not allowed: whether a link is soft is fixed when the page is written)`);
    if (isBinding(value)) return checkBinding(value, propPath, insideEach);
    if (name === 'follow' && typeof value !== 'boolean') return problems.push(`${propPath}: follow is ${JSON.stringify(value)}. Write true, false or a binding such as equals(state('list.draggingId'), item('id'))`);
    if (value !== null && typeof value === 'object') {
      problems.push(`${propPath}: must be a literal or a binding${name === 'style' ? ' (build a style string with join)' : ''}`);
    } else if (notJson(value)) {
      problems.push(`${propPath}: ${String(value)} is not a literal. Use a string, a finite number, a boolean or null, or a binding`);
    } else if (URL_PROPS.includes(name) && isUnsafeUrl(name, value)) {
      problems.push(`${propPath}: unsafe URL`);
    }
  };

  // Handler: [actionName, args?, options?]. Argument names and literal types must match the action's declaration.
  const checkHandler = (eventName, handler, specPath, insideEach) => {
    const handlerPath = `${specPath}.on.${eventName}`;
    const [eventType, ...keyParts] = eventName.split('.');
    if (!DELEGATED_EVENTS.includes(eventType)) problems.push(`${specPath}.on: bad event ${eventName}`);
    problems.push(...checkKeyChord(handlerPath, eventType, keyParts));
    // One handler is [actionName, args?, options?]; several are a list of those, run in order, each as its own logged action.
    const isOne = Array.isArray(handler) && typeof handler[0] === 'string';
    if (!isOne && !(Array.isArray(handler) && handler.length > 0 && handler.every((one) => Array.isArray(one) && typeof one[0] === 'string'))) {
      problems.push(`${handlerPath}: handler must be [actionName, args?, options?] or a list of those`);
      return;
    }
    if (!isOne && handler.length === 1) problems.push(`${handlerPath}: a list of one handler is the handler itself. Write [actionName, args] without the outer list`);
    (isOne ? [handler] : handler).forEach((one, index) => checkOneHandler(isOne ? handlerPath : `${handlerPath}[${index}]`, one, insideEach));
  };

  const checkOneHandler = (handlerPath, handler, insideEach) => {
    const [actionName, args = {}, options = {}] = handler;
    // Hand-written specs reach here too: arguments and options that are not objects are reported, never thrown on.
    problems.push(...checkHandlerParts(handlerPath, actionName, args, options));
    if (!isPlainObject(args) || !isPlainObject(options)) return;
    const action = actions[actionName];
    if (!action) {
      problems.push(`${handlerPath}: unknown action ${actionName}. ${didYouMean(actionName, Object.keys(actions))}Actions are written namespace.verb: ${Object.keys(actions).join(', ') || 'none'}`);
    } else {
      problems.push(...checkArgumentNames(handlerPath, actionName, action.args || {}, args));
    }
    for (const [argName, argValue] of Object.entries(args)) {
      const argPath = `${handlerPath}.${argName}`;
      if (isPlainObject(argValue) && 'event' in argValue) {
        if (Object.keys(argValue).length !== 1 || typeof argValue.event !== 'string' || !argValue.event) problems.push(`${argPath}: event needs a path string, for example {event: 'target.value'}`);
      } else if (isBinding(argValue)) {
        // At event time only a state key, a row field and an event path can be read; operators are not evaluated there.
        if (!('state' in argValue) && !('item' in argValue) && !('row' in argValue)) {
          problems.push(`${argPath}: an action argument can be a literal, {event: path}, {state: key}, {item: field} or {row: name.field}, not {${Object.keys(argValue)[0]}: ...}. Compute the value in a derived value and pass {state: name}, or decide inside the action`);
        } else checkBinding(argValue, argPath, insideEach);
      } else if (action && argName in (action.args || {}) && !matchesArgumentType(argValue, action.args[argName])) {
        problems.push(`${argPath}: ${actionName} expects ${action.args[argName]}, got a literal ${typeof argValue}`);
      }
    }
  };

  const checkElement = (node, specPath, insideEach) => {
    checkUnknownKeys(node, ELEMENT_KEYS, specPath);
    if (!ALLOWED_TAGS_SET.has(node.tag)) problems.push(`${specPath}: bad tag ${node.tag}`);
    if (node.id !== undefined) {
      if (typeof node.id !== 'string' || !node.id) problems.push(`${specPath}: id must be a non-empty string`);
      else if (explicitIds.has(node.id)) problems.push(`${specPath}: duplicate id ${node.id}`);
      explicitIds.add(node.id);
    }
    const props = node.props || {};
    for (const name of Object.keys(props)) checkProp(name, props[name], specPath, insideEach);
    for (const className of Object.keys(node.classes || {})) {
      requireBinding(node.classes[className], `${specPath}.classes.${className}`, insideEach);
    }
    if (node.transition !== undefined && !(Number.isFinite(node.transition) && node.transition > 0)) problems.push(`${specPath}: transition must be a positive number of milliseconds`);
    for (const eventName of Object.keys(node.on || {})) checkHandler(eventName, node.on[eventName], specPath, insideEach);

    if ('soft' in props && (node.tag !== 'a' || !('href' in props))) {
      problems.push(`${specPath}: soft belongs on a link with an href, and this is ${node.tag === 'a' ? 'an a without href' : `a ${node.tag}`}. Write a({ href: '/page', soft: true }, 'text'); for a button, use act('route.go', { href: '/page' })`);
    }
    const hasLabel = 'aria-label' in props;
    const hasContent = toArray(node.children).length > 0;
    if (LABELLED_TAGS_SET.has(node.tag) && !hasLabel && props.type !== 'hidden') problems.push(`${specPath}: ${node.tag} needs aria-label`);
    if ((node.tag === 'button' || node.tag === 'a') && !hasLabel && !hasContent) {
      problems.push(`${specPath}: ${node.tag} needs text or aria-label`);
    }
    if (node.tag === 'img' && !('alt' in props)) problems.push(`${specPath}: img needs alt (use "" for decorative images)`);
    if (VOID_TAGS_SET.has(node.tag) && hasContent) problems.push(`${specPath}: ${node.tag} cannot have children`);
    toArray(node.children).forEach((child, index) => checkNode(child, `${specPath}.${index}`, insideEach));
  };

  const checkNode = (node, specPath, insideEach) => {
    if (typeof node === 'string') return;
    if (!isPlainObject(node)) {
      problems.push(`${specPath}: bad node`);
      return;
    }
    if (isBinding(node)) return checkBinding(node, specPath, insideEach);

    if ('when' in node) {
      checkUnknownKeys(node, WHEN_KEYS, specPath);
      requireBinding(node.when, `${specPath}.when`, insideEach);
      if (toArray(node.children).length === 0 && toArray(node.otherwise).length === 0) problems.push(`${specPath}: when needs children or otherwise, and an empty list shows nothing either way. Give it something to show`);
      toArray(node.children).forEach((child, index) => checkNode(child, `${specPath}.when.${index}`, insideEach));
      toArray(node.otherwise).forEach((child, index) => checkNode(child, `${specPath}.otherwise.${index}`, insideEach));
      return;
    }

    if ('each' in node) {
      checkUnknownKeys(node, EACH_KEYS, specPath);
      // Rows read their fields from the list's shape when it has one; a row of any other list is just "inside an each".
      // `names` holds the rows of the enclosing eaches that said `as`: their name, and their fields when the list has a shape.
      const outerNames = insideEach ? insideEach.names : {};
      // The source is "namespace.key" or the binding {state: "namespace.key"}: both name the list, so both get its shape.
      const sourceKey = typeof node.each === 'string' ? node.each : isPlainObject(node.each) && Object.keys(node.each).length === 1 && typeof node.each.state === 'string' ? node.each.state : null;
      const outerSources = insideEach ? insideEach.sources : {};
      const source = sourceKey ?? JSON.stringify(node.each);
      let rowContext = { name: null, fields: null, names: outerNames, source, sources: outerSources };
      if (typeof node.each === 'string') checkStateKey(node.each, `${specPath}.each`);
      else requireBinding(node.each, `${specPath}.each`, insideEach);
      const shape = sourceKey === null ? undefined : shapes[sourceKey];
      if (isPlainObject(shape) && isPlainObject(shape.fields)) rowContext = { ...rowContext, name: sourceKey, fields: shape.fields };
      if (node.as !== undefined) {
        if (typeof node.as !== 'string' || !IDENTIFIER.test(node.as)) problems.push(`${specPath}: as is ${JSON.stringify(node.as)}. Write a name in letters and digits starting with a lowercase letter, for example as: 'order'`);
        else if (node.as in outerNames) problems.push(`${specPath}: as: "${node.as}" is already the name of an enclosing each, and a row would hide it. Give this each another name`);
        else rowContext = { ...rowContext, names: { ...outerNames, [node.as]: rowContext.fields }, sources: { ...outerSources, [node.as]: source } };
      }
      if (!node.key || typeof node.key !== 'string') problems.push(`${specPath}: each needs key`);
      if (isPlainObject(node.template) && node.template.tag) checkElement(node.template, `${specPath}.each`, rowContext);
      else problems.push(`${specPath}: each template must be one element`);
      return;
    }

    if ('tag' in node) return checkElement(node, specPath, insideEach);
    problems.push(`${specPath}: bad node (expected tag, each, when or a binding, got keys ${Object.keys(node).join(', ') || 'none'})`);
  };

  checkNode(spec, '$', false);
  return problems;
};
