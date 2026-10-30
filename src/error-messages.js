// The catalogue of the errors the runtime reports or throws: one code each (AUI + 4 digits), what it means, and the sentence that
// says what is wrong and how to fix it. Development only: production builds replace this module with a stub
// (build/stubs/error-messages-omitted.js), and an error there is its code and its details ("AUI0103 {...}"). The words are decoded
// where the error is read, not on the visitor's device:
//
//   decodeError(error)       (imported from the package entry @ehtb/agent-ui/error-messages)                       // an Error with .code and .details, or the message "AUI0103 {...}" -> the sentence
//   agent-ui explain 'AUI0103 {"operation":"get","key":"todos.drat"}'
//
// Details are plain JSON and small. `context` is what only the development build adds when it throws (the names that exist, for a
// "did you mean"); a decoder that has only the details leaves those parts out.
//
// Codes: 01xx keys, writes and calls; 02xx actions and events; 03xx rendering and effects; 04xx plugins; 05xx pages.
import { didYouMean, problem } from './messages.js';

const list = (names) => names.join(', ') || 'none';

// What is wrong with a namespace.name that is not there: the namespace, or the name in it, as a sentence that starts with a capital.
// Shared with the validator (src/validate.js); the runtime puts it after a colon in lower case. Without the lists of what exists, the
// sentence stops at what is wrong.
export const describeUnknownKey = (namespace, name, namespaceNames, knownKeys) => {
  if (namespaceNames && !namespaceNames.includes(namespace)) return `There is no namespace "${namespace}". ${didYouMean(namespace, namespaceNames)}Namespaces: ${list(namespaceNames)}`;
  if (!namespaceNames) return `Namespace "${namespace}" has no state key or derived value "${name}"`;
  const names = knownKeys.filter((key) => key.startsWith(`${namespace}.`)).map((key) => key.slice(namespace.length + 1));
  return `Namespace "${namespace}" has no state key or derived value "${name}". ${didYouMean(name, names)}It has: ${list(names)}`;
};

const lowerFirst = (sentence) => `${sentence[0].toLowerCase()}${sentence.slice(1)}`;

export const MESSAGES = {
  AUI0101: { title: 'a key given to store.get or store.set is not a string', text: ({ operation, key }) => problem(`${operation}(${JSON.stringify(key)})`, 'the key must be a string', 'Write the name of a state key, for example "draft"') },
  AUI0102: { title: 'a key of the action\'s own namespace was written with the namespace', text: ({ operation, key, namespace }) => problem(`${operation}("${key}")`, `"${key}" is in this namespace ("${namespace}")`, `Write "${key.slice(namespace.length + 1)}" without the namespace; only other namespaces are written with it`) },
  AUI0103: {
    title: 'a state key or derived value that does not exist was read or written',
    text: ({ operation, key, fromNamespace = null }, context = {}) => {
      const [namespace, ...rest] = key.split('.');
      const written = fromNamespace === namespace ? rest.join('.') : key;
      return `${operation}("${written}"): ${lowerFirst(describeUnknownKey(namespace, rest.join('.'), context.namespaceNames, context.knownKeys))}`;
    },
  },
  AUI0104: {
    title: 'an action wrote the state of another namespace',
    text: ({ operation, key, namespace, action, actionNamespace }, { callable = [] } = {}) =>
      problem(
        `${operation}("${key}")`,
        `state key "${key}" belongs to namespace "${namespace}", and ${action} belongs to "${actionNamespace}". An action writes only its own namespace`,
        `If this change follows from ${action}, list one of the actions of "${namespace}" in calls and use call(...)${callable.length ? ` (${callable.join(', ')})` : ''}; if it does not, the state is in the wrong namespace: move it, or derive it`,
      ),
  },
  AUI0105: { title: 'a derived value was written', text: ({ operation, key }) => problem(`${operation}("${key}")`, `"${key}" is a derived value and cannot be written`, 'Write the state it is computed from (the keys its derive function reads)') },
  AUI0106: {
    title: 'call() named an action that the calling action does not list in calls',
    text: ({ name, caller, calls }) => problem(`call("${name}")`, `${caller} does not list it in calls`, `${didYouMean(name, calls)}Add it: calls: [${[...calls, name].map((called) => `'${called}'`).join(', ')}]`),
  },
  AUI0107: { title: 'derived values depend on each other in a loop', text: ({ chain }) => `a derived value cannot depend on itself: ${chain.join(' -> ')}. Break the loop: compute one of them from state instead` },
  AUI0108: { title: 'a derived value threw while it was computed', text: ({ name, cause }) => `derived "${name}": ${cause}` },
  AUI0109: { title: 'call() passed arguments that do not match the called action', text: ({ name, cause }) => `call("${name}"): ${cause}` },

  AUI0201: { title: 'an action threw; everything it wrote was undone', text: ({ action, cause }) => `${action}: ${cause}` },
  AUI0202: {
    title: 'dispatch or a handler named an action that does not exist',
    text: ({ action }, { actionNames } = {}) => `unknown action ${action}. ${actionNames ? `${didYouMean(action, actionNames)}Actions are written namespace.verb: ${list(actionNames)}` : 'Actions are written namespace.verb'}`,
  },
  AUI0203: { title: 'an action was called with an argument of the wrong type', text: ({ action, argument, expected, got }) => `${action}.${argument}: want ${expected}, got ${got}` },
  AUI0204: { title: 'an argument of a handler could not be read when the event happened', text: ({ action, argument, cause }) => `${action}.${argument}: cannot read the argument at event time (${cause}). Check that the {state}, {item} or {event} path exists` },

  AUI0301: { title: 'an unsafe URL was blocked', text: ({ prop }) => `blocked unsafe URL in ${prop}` },
  AUI0302: { title: 'an item of an each has no usable key', text: ({ key, path }) => `item without usable key "${key}" in ${path}` },
  AUI0303: {
    title: 'two items of an each have the same key; the later one is not shown',
    text: ({ value, path, key, source, first, second }) => `duplicate key ${value} in ${path}${source === undefined ? '' : ` (list "${source}", items ${first} and ${second})`}: the later item is not shown. The data holds two items with the same "${key}"${source === undefined ? '' : `; fix "${source}" so that every item has its own "${key}"`}`,
  },
  AUI0304: { title: 'an update of the page threw (a binding, or a derived value that is read by one), or an error without an AUI code was reported', text: ({ message }) => message },

  AUI0401: { title: 'a plugin that draws into an element (mountElement) threw in its mount or its cleanup', text: ({ where, id, phase, cause }) => `${where}: ${phase === 'cleanup' ? 'the cleanup of' : 'mount of'} "${id}" threw: ${cause}` },

  AUI0501: { title: 'the page\'s ready(state) did not return true or false', text: ({ path, answer }) => problem(`page "${path}"`, `ready(state) returned ${answer === undefined ? 'undefined' : JSON.stringify(answer)}, not true or false`, 'Return a boolean, for example `state.items.status === \'ready\'`') },
  AUI0502: { title: 'a value of the page\'s head is not a string, a number or a boolean', text: ({ where, name, value }) => problem(where, `${name} is ${value === undefined ? 'undefined' : JSON.stringify(value)}, not a string, a number or a boolean`, `Make ${name} a string, number or boolean, or a function that returns one`) },
  AUI0503: { title: 'a URL in the page\'s head is unsafe', text: ({ where, name, value }) => problem(where, `${name} is an unsafe URL (${JSON.stringify(value)})`, 'Use an http(s), relative or mailto URL') },
};

// The sentence for a code and its details, or null for a code this version does not know.
export const describeError = (code, details, context) => (Object.hasOwn(MESSAGES, code) ? MESSAGES[code].text(details ?? {}, context) : null);

// Reads what an error is: an Error with .code and .details, or the text a production build gave it ("AUI0103 {...}").
// Returns { code, details, text, title } (text is null when the code is unknown or the details are missing), or null when it is neither.
export const decodeError = (error) => {
  let code = error?.code;
  let details = error?.details;
  if (typeof code !== 'string' || !/^AUI\d{4}$/.test(code)) {
    // Not one of ours (a Node error has a code like "ENOENT"): read the text, which is the form a production build gives.
    const found = /^(AUI\d{4})(?: (\{[\s\S]*\}))?$/.exec(typeof error === 'string' ? error : error?.message ?? '');
    if (!found) return null;
    code = found[1];
    try {
      details = found[2] ? JSON.parse(found[2]) : undefined;
    } catch {
      details = undefined;
    }
  }
  // A wrapper (an action that threw, a derived value that threw) carries the error it wrapped as text: decode that one too.
  if (typeof details?.cause === 'string' && /^AUI\d{4}(?: \{[\s\S]*\})?$/.test(details.cause)) details = { ...details, cause: decodeError(details.cause)?.text ?? details.cause };
  const known = Object.hasOwn(MESSAGES, code);
  let text = null;
  try {
    text = known && details ? describeError(code, details) : null;
  } catch {
    text = null; // details that are not the ones of this code
  }
  return { code, details: details ?? null, title: known ? MESSAGES[code].title : null, text };
};
