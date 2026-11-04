// Development checks for the spec builders (src/spec.js). Production builds replace this module with a stub whose
// functions do nothing (build/stubs/spec-checks-omitted.js), so a builder there is only a small object constructor.
//
// What they add over the validator: a mistake fails at the call that made it, so the stack trace names the file and line
// of the author's code, and the message names the builder: `button(...): ...`. The validator still checks the finished
// spec as a whole (state keys, action names, ids, accessibility).
//
// Every check throws one Error: where, what is wrong, how to fix it, with "Did you mean" for near misses.
import { didYouMean, fail } from './messages.js';
import { BINDING_KEYS, DELEGATED_EVENTS, KEY_EVENTS, SVG_TAGS, isBinding, isPlainObject } from './spec-core.js';
import { ACTION_NAME, ATTRIBUTES, ATTRIBUTE_PREFIXES, isPrefixedAttribute, isReservedAttribute, HANDLER_OPTIONS, OPERAND_COUNTS, ROW_PATH, ROW_STATE_PATH, STATE_PATH, SVG_ATTRIBUTES, VOID_TAGS } from './grammar.js';
import { IDENTIFIER } from './namespaces.js';
import { checkKeyChord } from './handler-checks.js';

// A short text for a wrong value inside an error message. It must never throw itself: a circular object (an event, a
// store, a DOM node), a BigInt or a Symbol cannot be written as JSON, and the author needs the real message, not a TypeError.
const show = (value) => {
  let text;
  try {
    text = typeof value === 'function' ? 'a function' : typeof value === 'number' ? String(value) : JSON.stringify(value); // JSON.stringify(NaN) is "null"
  } catch {
    text = undefined;
  }
  if (text === undefined) text = typeof value === 'object' && value !== null ? `an object (${Object.keys(value).slice(0, 3).join(', ')}${Object.keys(value).length > 3 ? ', ...' : ''}) that cannot be shown as JSON` : String(typeof value === 'symbol' ? value.toString() : value);
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
};
// A placeholder inside a component definition: {param: 'name'}, {param: 'name', key: true} or {slot: 'children'}.
const isPlaceholder = (value) => isPlainObject(value) && ('param' in value || 'slot' in value) && Object.keys(value).every((key) => ['param', 'key', 'slot'].includes(key));
const isLiteral = (value) => value === null || ['string', 'boolean'].includes(typeof value) || (typeof value === 'number' && Number.isFinite(value));
const isValue = (value) => isLiteral(value) || isBinding(value) || isPlaceholder(value);
const isNode = (value) => typeof value === 'string' || isBinding(value) || isPlaceholder(value) || (isPlainObject(value) && ('tag' in value || 'each' in value || 'when' in value || 'use' in value));

const checkNode = (where, value, position) => {
  if (isNode(value)) return;
  if (value === null || value === undefined || typeof value === 'boolean') {
    fail(where, `${position} is ${show(value)}, which is not a node`, 'Nothing is skipped silently. Use when(binding, node) to show something only sometimes, or leave the argument out');
  }
  if (typeof value === 'number') fail(where, `${position} is the number ${value}, which is not a node`, 'Write String(number) for fixed text, or state(...) for a value that changes');
  if (Array.isArray(value)) fail(where, `${position} is a list inside a list`, 'Lists of children are flattened one level. Flatten it yourself with .flat()');
  fail(where, `${position} is ${show(value)}, which is not a node`, 'Children are text, bindings, elements (div(...)), components made by defineElement, each(...) and when(...)');
};

const checkValue = (where, what, value) => {
  if (isValue(value)) return;
  if (value === undefined) fail(where, `${what} is undefined`, 'Give it a value, or null to remove the attribute, or leave it out');
  fail(where, `${what} is ${show(value)}, which is not a literal or a binding`, "Values are strings, numbers, booleans, null and bindings such as state('x'). Build a style string with join(...)");
};

const checkHandler = (where, event, handler) => {
  const chord = event.includes('.') ? event.slice(0, event.indexOf('.')) : event;
  if (!DELEGATED_EVENTS.includes(chord) || (event.includes('.') && !KEY_EVENTS.includes(chord))) {
    fail(where, `unknown event "${event}"`, `${didYouMean(chord, DELEGATED_EVENTS)}Events: ${DELEGATED_EVENTS.join(', ')}; key chords only for keydown and keyup, for example "keydown.Enter"`);
  }
  const chordProblems = checkKeyChord(where, chord, event.includes('.') ? event.slice(event.indexOf('.') + 1).split('.') : []);
  if (chordProblems.length) fail(where, chordProblems[0].slice(where.length + 2), `Write a key chord as in "keydown.Control+Shift+k": modifiers once each, in the order Control, Alt, Shift, Meta, then the key`);
  if (isPlaceholder(handler)) return;
  if (!Array.isArray(handler)) fail(where, `the handler of "${event}" is ${show(handler)}, not a handler`, `Write on: { ${event}: act('namespace.verb', { argument: value }) }`);
  // One handler is act(...); several are a list of them: [act(...), act(...)], run in order.
  const isSingle = typeof handler[0] === 'string' || isPlaceholder(handler[0]) || (isPlainObject(handler[0]) && 'join' in handler[0]);
  const handlers = isSingle ? [handler] : handler;
  if (!isSingle && handler.length === 1) fail(where, `the handler of "${event}" is a list of one handler`, `Write the handler itself: on: { ${event}: act('namespace.verb', {}) }`);
  if (!isSingle && handler.length === 0) fail(where, `the handler of "${event}" is an empty list`, `Write on: { ${event}: act('namespace.verb', {}) }`);
  handlers.forEach((one) => {
    if (!Array.isArray(one)) fail(where, `the handler of "${event}" contains ${show(one)}, not a handler`, `Write on: { ${event}: [act('a.first', {}), act('b.second', {})] }`);
    checkAct(where, one[0], one[1], one[2], one.length);
  });
};

export const checkAct = (where, name, args, options, length = 3) => {
  if (typeof name !== 'string' && !isPlaceholder(name) && !(isPlainObject(name) && 'join' in name)) fail(where, `the action name is ${show(name)}`, "Write the name of an action as a string, for example 'todo.add'");
  if (typeof name === 'string' && name === '') fail(where, 'the action name is empty', "Write the name of an action as a string, for example 'todo.add'");
  if (typeof name === 'string' && name !== '' && !ACTION_NAME.test(name)) fail(where, `the action name "${name}" is not namespace.verb`, `An action is named by its namespace and its verb, for example 'todos.add'${name.includes('.') ? '' : ` (is "${name}" a verb of some namespace?)`}`);
  if (length > 3) fail(where, `a handler has at most three parts, got ${length}`, 'Write [actionName, args, options]');
  if (args !== undefined && !isPlainObject(args)) fail(where, `the arguments are ${show(args)}`, "Write an object of argument names to values, for example { text: state('draft') }, or {} for none");
  for (const [argument, value] of Object.entries(args ?? {})) {
    if (value === undefined) fail(where, `argument "${argument}" is undefined`, 'Give it a literal, state(...), item(...) or event(...)');
    if (isPlainObject(value) && 'rowState' in value) fail(where, `argument "${argument}" is a rowState binding`, 'An action argument is a literal, state(...), item(...), row(...) or event(...). Read the row state in the view, or pass the row key and let the action read it with store.getRow');
    if (isPlainObject(value) && Object.keys(value).some((key) => ['not', 'length', 'equals', 'greaterThan', 'lessThan', 'and', 'or', 'join'].includes(key))) {
      fail(where, `argument "${argument}" is an operator expression`, 'Arguments are literals, state(...), item(...), row(...) or event(...). Compute the value in derive, or in a dedicated action');
    }
  }
  if (options !== undefined) {
    if (!isPlainObject(options)) fail(where, `the options are ${show(options)}`, 'Write { preventDefault: false } or { stopPropagation: true }');
    for (const key of Object.keys(options)) {
      if (!HANDLER_OPTIONS.includes(key)) fail(where, `unknown handler option "${key}"`, `${didYouMean(key, HANDLER_OPTIONS)}Options: ${HANDLER_OPTIONS.join(', ')}`);
    }
  }
};

export const checkElement = (tag, attributes, children) => {
  const where = `${tag}(...)`;
  if (attributes !== null && attributes !== undefined && !isPlainObject(attributes)) {
    fail(where, `the first argument is ${show(attributes)}, but it must be the attributes object or null`, `Write ${tag}(null, ${show(attributes)}) for an element without attributes`);
  }
  if (attributes === undefined) fail(where, 'the first argument is missing: it is always the attributes object or null', `Write ${tag}(null, ...children) when there are no attributes`);
  if (attributes && isNode(attributes)) fail(where, 'the first argument is a node, but it must be the attributes object or null', `Write ${tag}(null, <node>) for an element without attributes`);
  for (const [name, value] of Object.entries(attributes ?? {})) {
    if (name === 'props') fail(where, 'attributes are written directly, not under "props"', `Write ${tag}({ class: 'x', disabled: true }, ...)`);
    if (name === 'children') fail(where, 'children are the arguments after the attributes, not an attribute', `Write ${tag}(null, child, child)`);
    if (name === 'tag') fail(where, '"tag" is not an attribute: the builder is the tag', 'Use the builder for the tag you want, for example div(...)');
    if (name === 'className') fail(where, '"className" is another convention', 'Write class');
    if (name === 'htmlFor') fail(where, '"htmlFor" is another convention', 'Write for');
    if (/^on[A-Z]/.test(name)) fail(where, `"${name}" is another convention`, `Events go in "on": on: { ${name.slice(2).toLowerCase()}: act('action.name', {}) }`);
    if (BINDING_KEYS.includes(name)) fail(where, `"${name}" cannot be an attribute name, it is a binding operator`, 'Rename the attribute');
    if (name === 'id') {
      if (!(typeof value === 'string' && value !== '') && !isPlaceholder(value)) fail(where, `id is ${show(value)}`, 'Write a non-empty string: it is the stable address of the element');
    } else if (name === 'soft') {
      if (value !== true) fail(where, `soft is ${show(value)}`, `Write soft: true on a link, or leave it out`);
      if (tag !== 'a') fail(where, `soft belongs on a link, and this is a ${tag}`, `Write a({ href: '/page', soft: true }, 'text'); for a button, use on: { click: act('route.go', { href: '/page' }) }`);
      if (!('href' in attributes)) fail(where, 'a soft link has no href', `Write a({ href: '/page', soft: true }, 'text'): the href is what a crawler, a middle click and a failed soft navigation use`);
    } else if (name === 'transition') {
      if (!(typeof value === 'number' && Number.isFinite(value) && value > 0) && !isPlaceholder(value)) fail(where, `transition is ${show(value)}`, 'Write a number of milliseconds greater than 0');
    } else if (name === 'classes') {
      if (!isPlainObject(value)) fail(where, `classes is ${show(value)}`, "Write an object of class names to bindings, for example classes: { active: state('on') }");
      for (const [className, binding] of Object.entries(value)) {
        if (!isBinding(binding) && !isPlaceholder(binding)) fail(where, `classes.${className} is ${show(binding)}, not a binding`, `Never true or false: constant classes go in class, conditional ones need a binding such as state('isActive')`);
      }
    } else if (name === 'on') {
      if (!isPlainObject(value)) fail(where, `on is ${show(value)}`, "Write an object of events to handlers, for example on: { click: act('todo.add', {}) }");
      for (const [event, handler] of Object.entries(value)) checkHandler(where, event, handler);
    } else {
      if (isReservedAttribute(name)) fail(where, `"${name}" is reserved for the framework`, 'It marks what a server wrote into the head and the end of the body. Use another data-* name');
      if (name !== 'domId' && !ATTRIBUTES.includes(name) && !isPrefixedAttribute(name)) {
        const prefixed = ATTRIBUTE_PREFIXES.some((prefix) => name.startsWith(prefix));
        fail(where, `unknown attribute "${name}"`, prefixed ? 'A data-* or aria-* name needs something after the prefix and no space, quote, <, >, / or =. Write for example data-row-id' : `${didYouMean(name, ATTRIBUTES)}Attributes are the ones of HTML (src/grammar.js, ATTRIBUTES), data-* and aria-*; the HTML id attribute is domId`);
      }
      if (SVG_ATTRIBUTES.includes(name) && !SVG_TAGS.includes(tag)) fail(where, `${name} is an attribute of an svg drawing, and this is a ${tag}`, `Put it on the svg or one of its shapes, or style the ${tag} with CSS`);
      checkValue(where, `attribute ${name}`, value);
    }
  }
  if (VOID_TAGS.includes(tag) && children.length) fail(where, `${tag} cannot have children`, `Write ${tag}({ ... }) with no children`);
  children.forEach((child, index) => {
    if (Array.isArray(child)) child.forEach((inner, innerIndex) => checkNode(where, inner, `child ${index + 1}, item ${innerIndex + 1}`));
    else checkNode(where, child, `child ${index + 1}`);
  });
};

export const checkOperator = (name, operands) => {
  const where = `${name}(...)`;
  const [minimum, maximum] = OPERAND_COUNTS[name] ?? [1, 1];
  if (operands.length < minimum || operands.length > maximum) {
    const wanted = minimum === maximum ? `exactly ${minimum}` : maximum === Infinity ? `at least ${minimum}` : `${minimum} to ${maximum}`;
    fail(where, `it takes ${wanted} operand${minimum === 1 && maximum === 1 ? '' : 's'}, got ${operands.length}`, `Write ${name}(${minimum === 1 ? 'x' : 'x, y'}${maximum === Infinity ? ', ...' : ''})`);
  }
  operands.forEach((operand, index) => {
    if (!isValue(operand)) fail(where, `operand ${index + 1} is ${show(operand)}, not a literal or a binding`, "Operands are strings, numbers, booleans, null and bindings such as state('x')");
  });
};

export const checkPath = (name, value) => {
  // A component definition may build the path: state(join(param('field'), 'Value')).
  if (isPlaceholder(value) || (isPlainObject(value) && 'join' in value)) return;
  if (typeof value !== 'string' || value === '') fail(`${name}(...)`, `the argument is ${show(value)}`, `Write a non-empty string, for example ${name}('${name === 'state' ? 'todos.items' : name === 'item' ? 'title' : name === 'row' ? 'order.total' : name === 'rowState' ? 'pickers.open' : 'target.value'}')`);
  if (name === 'rowState' && !ROW_STATE_PATH.test(value)) fail('rowState(...)', `"${value}" is not namespace.field or rowname.namespace.field`, "Write the namespace that declares rowState and one of its fields, for example rowState('pickers.open'), or first the name an enclosing each gives with { as: 'group' } to read that outer row: rowState('group.pickers.open')");
  if (name === 'row' && !ROW_PATH.test(value)) fail('row(...)', `"${value}" is not name.field`, "Write the name an enclosing each gives with { as: 'order' }, then a field of its item: row('order.total'), or just the name for a whole item");
  if (name === 'state' && !STATE_PATH.test(value)) fail('state(...)', `"${value}" has no namespace`, `A state binding is namespace.key, then any path inside the value, for example state('todos.draft') or state('todos.items.length')`);
};

export const checkWhen = (condition, children, otherwise) => {
  if (!isBinding(condition) && !isPlaceholder(condition)) fail('when(...)', `the condition is ${show(condition)}, not a binding`, "Write when(state('open'), child) or when(not(state('empty')), ...). The condition is re-evaluated at runtime, so it must be a binding");
  const isEmpty = (branch) => branch === undefined || branch === null || (Array.isArray(branch) && branch.length === 0);
  if (isEmpty(children) && isEmpty(otherwise)) {
    fail('when(...)', 'it has neither children nor otherwise (an empty list counts as nothing)', 'Give it something to show: when(binding, child) or when(binding, null, otherChild). If the list is built from data, check that it is not empty before calling when, or leave the when out');
  }
  for (const [name, branch] of [['children', children], ['otherwise', otherwise]]) {
    if (branch === undefined || branch === null) continue;
    toNodes(branch).forEach((node, index) => checkNode('when(...)', node, `${name}, item ${index + 1}`));
  }
};

const toNodes = (branch) => (Array.isArray(branch) ? branch : [branch]);

export const checkEach = (source, key, template, options) => {
  if (typeof source !== 'string' && !isBinding(source) && !isPlaceholder(source)) fail('each(...)', `the source is ${show(source)}`, "Write the qualified name of a state or derived key such as 'todos.visible', or a binding such as item('tags') for a nested list");
  if (typeof source === 'string' && !STATE_PATH.test(source)) fail('each(...)', `the source "${source}" has no namespace`, "Write namespace.key, for example each('todos.visible', 'id', li(null, ...))");
  if (typeof key !== 'string' || key === '') fail('each(...)', `the key is ${show(key)}`, "Name the field that is unique per item, or '.' when the item itself is the key");
  if (!isPlainObject(template) || !('tag' in template || 'use' in template)) fail('each(...)', 'the template must be one element', "Write each('todos', 'id', li(null, ...)): the third argument is a single element");
  if (options !== undefined) {
    if (!isPlainObject(options)) fail('each(...)', `the fourth argument is ${show(options)}`, "Write { as: 'name' } or leave it out");
    for (const name of Object.keys(options)) if (name !== 'as') fail('each(...)', `unknown option "${name}"`, `${didYouMean(name, ['as'])}The only option is as: each(source, key, template, { as: 'order' })`);
    if (typeof options.as !== 'string' || !IDENTIFIER.test(options.as)) fail('each(...)', `as is ${show(options.as)}`, "Write a name in letters and digits starting with a lowercase letter, for example { as: 'order' }");
  }
};
