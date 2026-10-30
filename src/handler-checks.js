// The checks of a handler, [actionName, args?, options?], written once. Element handlers (`on` in the validator), window handlers
// (windowEvents) and every other place that names an action with arguments use these, so the same mistake has the same message
// wherever it is made. Each returns a list of "where: problem" lines (empty when the handler is right) and never throws on a
// value of the wrong kind: a hand-written spec reaches them too. Development only: production builds leave the callers' checks out.
import { didYouMean } from './messages.js';
import { HANDLER_OPTIONS, MODIFIER_ORDER } from './grammar.js';
import { KEY_EVENTS, describeValue, isPlainObject } from './spec-core.js';

// Which of `supplied` names an action does not declare, and which declared names are not supplied.
export const diffNames = (declared, supplied) => ({
  missing: declared.filter((name) => !supplied.includes(name)),
  unknown: supplied.filter((name) => !declared.includes(name)),
});

// "unknown key a, b (allowed: ...). Did you mean ...": the one message for keys a fixed set of keys does not allow.
export const checkUnknownKeys = (where, object, allowedKeys) => {
  const unknown = Object.keys(object).filter((key) => !allowedKeys.includes(key));
  if (!unknown.length) return [];
  const hints = unknown.map((key) => didYouMean(key, allowedKeys).trim()).filter(Boolean);
  return [`${where}: unknown key ${unknown.join(', ')} (allowed: ${allowedKeys.join(', ')})${hints.length ? `. ${hints.join(' ')}` : ''}`];
};

// "keydown.Control+Shift+k": only keydown and keyup accept a key, modifiers once each, in the order Control, Alt, Shift, Meta.
export const checkKeyChord = (where, eventType, keyParts) => {
  if (!keyParts.length) return [];
  const problems = [];
  if (!KEY_EVENTS.includes(eventType)) problems.push(`${where}: only keydown and keyup accept a key`);
  const modifiers = keyParts.join('.').split('+').slice(0, -1);
  const orderedModifiers = MODIFIER_ORDER.filter((modifier) => modifiers.includes(modifier));
  if (modifiers.join() !== orderedModifiers.join() || modifiers.length !== new Set(modifiers).size) {
    problems.push(`${where}: modifiers must be unique and in the order ${MODIFIER_ORDER.join('+')}`);
  }
  return problems;
};

// The arguments and options of a handler are objects, and the options are known ones.
export const checkHandlerParts = (where, actionName, args, options) => {
  if (!isPlainObject(args)) return [`${where}: arguments must be an object of argument names to values, got ${describeValue(args)}. Write [${JSON.stringify(actionName)}, { name: value }], or leave the arguments out for an action without any`];
  if (!isPlainObject(options)) return [`${where}: options must be an object (${HANDLER_OPTIONS.join(', ')}), got ${describeValue(options)}. Write [${JSON.stringify(actionName)}, {}, { preventDefault: true }]`];
  return checkUnknownKeys(`${where} options`, options, HANDLER_OPTIONS);
};

// A handler passes exactly the arguments its action declares ({ name: type }).
export const checkArgumentNames = (where, actionName, declared, args) => {
  const { missing, unknown } = diffNames(Object.keys(declared), Object.keys(args));
  return [
    ...missing.map((name) => `${where}: missing argument ${name} for ${actionName}`),
    ...unknown.map((name) => `${where}: unknown argument ${name} for ${actionName} (declared: ${Object.keys(declared).join(', ') || 'none'})`),
  ];
};
