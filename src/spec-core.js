// Primitives shared by the runtime (src/ui.js) and the validator (src/validate.js). Kept in their own module so the
// validator can be left out of production builds without touching the runtime (see docs/BUILD.md, `validator: 'omit'`).

export const BINDING_KEYS = ['state', 'item', 'row', 'rowState', 'not', 'length', 'equals', 'greaterThan', 'lessThan', 'and', 'or', 'join'];
// Pointer events (pointerdown, pointermove, pointerup, pointercancel, pointerover, pointerout) are the bubbling input
// events a drag needs: they fire for mouse, touch and pen alike. pointerenter and pointerleave do not bubble, so
// delegation cannot use them. `{event: "pointerType"}` reads which kind of pointer it was.
export const DELEGATED_EVENTS = ['click', 'dblclick', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerover', 'pointerout', 'input', 'change', 'keydown', 'keyup', 'focusin', 'focusout', 'submit'];
export const KEY_EVENTS = ['keydown', 'keyup'];
// The HTML id of the element an app mounts in (src/hydrate.js exports it for server rendering; the runtime reads it to know the slot of a shell).
export const APP_ELEMENT_ID = 'app';
// The data of the comment a server writes between two neighbouring texts (src/server-dom.js), so each text of a spec has a node of its own in the markup.
export const TEXT_SEPARATOR = '|';
export const URL_PROPS = ['href', 'src', 'action', 'formaction'];
// SVG for icons and simple drawings: a closed set of tags the runtime makes in the SVG namespace (src/ui.js). The grammar's rules for
// them (where they may stand, which attributes they take) are in src/grammar.js and src/validate.js.
export const SVG_TAGS = ['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'use'];
export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
// The keys of an element that the builders keep outside `props` (everything else they are given becomes a prop).
export const ELEMENT_FIELDS = ['id', 'classes', 'on', 'transition'];


// A page lists plugin factories, (environment) => plugin; an app made with app() lists the plugin itself, (api) => void. The
// package's factories are marked so each side can refuse the other's with the fix (a factory in app() would install nothing).
// Symbol.for: a page and the runtime may be two copies of the package, and the mark must still be the same one.
export const PAGE_PLUGIN = Symbol.for('agent-ui.pagePlugin');
export const markPagePlugin = (factory) => Object.assign(factory, { [PAGE_PLUGIN]: true });

// A value that is a literal or a function of the state: the literal, or the function applied to the state.
export const valueForState = (value, state) => (typeof value === 'function' ? value(state) : value);

// An object literal or JSON.parse result (or Object.create(null)): not a Date, Map, Set, RegExp or class instance, which are not data.
export const isPlainObject = (value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
export const isBinding = (value) => isPlainObject(value) && BINDING_KEYS.some((key) => key in value);
export const toArray = (children) => (children == null ? [] : Array.isArray(children) ? children : [children]);
// What a value is, for a message: "null", "a list", or the typeof.
export const describeValue = (value) => (value === null ? 'null' : Array.isArray(value) ? 'a list' : typeof value);

export const matchesArgumentType = (value, type) =>
  type === 'json' ? value !== undefined && typeof value !== 'function' : typeof value === type;

export const isUnsafeUrl = (name, value) => {
  if (typeof value !== 'string') return false;
  const scheme = value.replace(/[\u0000- ]/g, '').toLowerCase();
  if (/^(javascript|vbscript):/.test(scheme)) return true;
  return name !== 'src' && scheme.startsWith('data:');
};

// Structural equality for derived values, down to `depth` levels of arrays and plain objects. When a recomputed value
// equals the previous one, the previous reference is kept, so nothing downstream re-runs.
export const isSameValue = (previous, next, depth) => {
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

// Reads a dotted path such as "target.value" from an event; shared by element handlers and windowEvents.
export const readEventPath = (event, path) => path.split('.').reduce((value, part) => value?.[part], event);

// The next animation frame, or a 16 ms timer where there is none (the test DOM, an older browser). One definition, because the
// runtime (entering transitions) and the follow plugin (writing the offset) must schedule the same way.
export const nextFrame = (callback) => (globalThis.requestAnimationFrame ? globalThis.requestAnimationFrame(callback) : setTimeout(callback, 16));

// "Control+Shift+k": modifiers in a fixed order, then event.key. Used to match `keydown.Control+Shift+k` handlers.
export const eventKeyName = (event) =>
  [event.ctrlKey && 'Control', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Meta', event.key]
    .filter(Boolean)
    .join('+');

// {row: "order.total"} -> ["order", "total"]; {row: "order"} -> ["order", undefined], the whole item (a list of strings or numbers).
export const splitRowPath = (path) => {
  const dot = path.indexOf('.');
  return dot === -1 ? [path, undefined] : [path.slice(0, dot), path.slice(dot + 1)];
};
