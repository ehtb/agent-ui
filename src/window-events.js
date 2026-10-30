// Maps events on the window or document (resize, online/offline, visibilitychange, global shortcuts) to actions.
//
//   windowEvents(window, {
//     resize: ['viewport.set', { width: { event: 'target.innerWidth' }, height: { event: 'target.innerHeight' } }],
//     offline: ['network.set', { online: false }],
//     'keydown.Control+k': ['search.focus', {}, { preventDefault: true }],
//   })
//
// Same handler format as the spec's `on`, except arguments are literals or {event: path} only (there is no row or
// state context here). The event names (src/grammar.js, WINDOW_EVENTS), key chords, action names and arguments are checked when the
// plugin is installed (src/window-events-checks.js; production builds leave the checks out).
import { eventKeyName, isPlainObject, readEventPath } from './spec-core.js';
import { checkWindowEvents } from './window-events-checks.js';

export const windowEvents = (target, handlers) => (api) => {
  checkWindowEvents(handlers, api.actions());
  const listenersByType = new Map(); // event type -> { byChord: {chord: handler}, any: handler | null }

  for (const [eventName, handler] of Object.entries(handlers)) {
    const [type, ...keyParts] = eventName.split('.');
    if (!listenersByType.has(type)) listenersByType.set(type, { byChord: {}, any: null });
    const entry = listenersByType.get(type);
    if (keyParts.length) entry.byChord[keyParts.join('.')] = handler;
    else entry.any = handler;
  }

  for (const [type, entry] of listenersByType) {
    const listener = (event) => {
      if (api.replaying) return; // a replay re-runs the log; a live event must not write into it
      const chord = type === 'keydown' || type === 'keyup' ? eventKeyName(event) : null;
      const handler = (chord && entry.byChord[chord]) || entry.any;
      if (!handler) return;
      const [actionName, argTemplates = {}, options = {}] = handler;
      const args = {};
      for (const [argName, template] of Object.entries(argTemplates)) {
        args[argName] = isPlainObject(template) && 'event' in template ? readEventPath(event, template.event) : template;
      }
      if (options.preventDefault) event.preventDefault?.();
      if (options.stopPropagation) event.stopPropagation?.();
      api.dispatch(actionName, args);
    };
    target.addEventListener(type, listener);
    api.onDestroy(() => target.removeEventListener?.(type, listener)); // a replaced page leaves no listener on the window behind
  }
};
