// The development checks of windowEvents (src/window-events.js): every handler is checked when the plugin is installed, with the
// fix in every message. Production builds replace this module with a stub whose function does nothing
// (build/stubs/window-events-checks-omitted.js): a shipped app was checked in development, as with src/sync-apps-checks.js.
import { didYouMean } from './messages.js';
import { isPlainObject } from './spec-core.js';
import { WINDOW_EVENTS } from './grammar.js';
import { checkArgumentNames, checkHandlerParts, checkKeyChord } from './handler-checks.js';

// Throws one Error listing every problem, one per line, each "windowEvents <event>: <problem>".
export const checkWindowEvents = (handlers, declaredActions) => {
  if (!isPlainObject(handlers)) throw new Error('windowEvents: the handlers must be an object of events to handlers. Write windowEvents(window, { resize: ["viewport.set", { width: { event: "target.innerWidth" } }] })');
  const problems = [];
  for (const [eventName, handler] of Object.entries(handlers)) {
    const where = `windowEvents ${eventName}`;
    const [type, ...keyParts] = eventName.split('.');
    if (!WINDOW_EVENTS.includes(type)) problems.push(`${where}: unknown event "${type}". ${didYouMean(type, WINDOW_EVENTS)}Events: ${WINDOW_EVENTS.join(', ')}`);
    problems.push(...checkKeyChord(where, type, keyParts));
    if (!Array.isArray(handler) || typeof handler[0] !== 'string' || handler.length > 3) {
      problems.push(`${where}: a handler is [actionName, args?, options?], got ${JSON.stringify(handler)}`);
      continue;
    }
    const [actionName, args = {}, options = {}] = handler;
    const partsProblems = checkHandlerParts(where, actionName, args, options);
    problems.push(...partsProblems);
    if (!isPlainObject(args) || !isPlainObject(options)) continue;
    if (!Object.hasOwn(declaredActions, actionName)) problems.push(`${where}: unknown action ${actionName}. ${didYouMean(actionName, Object.keys(declaredActions))}Actions: ${Object.keys(declaredActions).join(', ') || 'none'}`);
    else problems.push(...checkArgumentNames(where, actionName, declaredActions[actionName], args));
    for (const [argName, value] of Object.entries(args)) {
      // A plain object is a json literal unless it uses the keys of a binding or of an event path: those must be exactly what they are.
      const keys = isPlainObject(value) ? Object.keys(value) : [];
      const isEventPath = keys.length === 1 && typeof value.event === 'string';
      const looksLikeBinding = keys.some((key) => ['state', 'item', 'row', 'rowState'].includes(key));
      if (looksLikeBinding || (keys.includes('event') && !isEventPath) || value === undefined || typeof value === 'function') {
        problems.push(`${where}.${argName}: an argument here is a literal or exactly { event: "path" }; there is no state, item or row to read at a window event. Pass { event: "target.innerWidth" } or a value`);
      }
    }
  }
  if (problems.length) throw new Error(problems.join('\n'));
};
