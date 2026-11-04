// Development checks of the runtime (src/ui.js) that only produce messages: the per-row state of a namespace (rowState). Production builds replace this module with a stub whose functions do
// nothing (build/stubs/runtime-checks-omitted.js), so the text of these errors is not downloaded. The code that follows a
// check does not depend on it: it works with the values the checks would have accepted.
import { didYouMean, fail } from './messages.js';
import { BASE_PATH_ADVICE, isBasePath } from './base-path-checks.js';

// The contract of this module: production builds replace it with build/stubs/runtime-checks-omitted.js, but it can also be in a
// production build (`--validator=include`) and an app can be made with `dev: false` while it is. So every function here has to work
// when ui.js passes it nothing because it is not in development (a `null` record, no `dev`-only state), and test/runtime-checks.test.mjs
// runs the app both ways.

export const checkBasePath = (basePath) => {
  if (!isBasePath(basePath)) fail('app', `basePath ${JSON.stringify(basePath)} is not allowed`, BASE_PATH_ADVICE);
};

// The props the grammar leaves to a plugin, and the plugin that writes each (src/follow.js).
const PLUGIN_PROPERTIES = { follow: 'withFollow, the export of @ehtb/agent-ui/follow (plugins: [withFollow] in page.js; follow in the plugins of app())' };

export const checkPropertyHandler = (name, handler, handlers) => {
  if (!Object.hasOwn(PLUGIN_PROPERTIES, name)) fail('api.handleProperty', `"${name}" is not a prop a plugin writes`, `${didYouMean(name, Object.keys(PLUGIN_PROPERTIES))}Props a plugin writes: ${Object.keys(PLUGIN_PROPERTIES).join(', ')}`);
  if (typeof handler !== 'function') fail('api.handleProperty', `the handler of "${name}" is ${typeof handler}, not a function`, 'Pass (element, value) => { ... }');
  if (handlers[name]) fail('api.handleProperty', `a second plugin handles "${name}"`, 'List the plugin once');
};

// After the plugins are installed: a spec that uses a prop no plugin handles would silently do nothing with it.
export const checkPluginProperties = (used, claimed) => {
  for (const name of used) {
    if (!claimed.has(name)) fail('app', `the spec uses "${name}", but no plugin handles it`, `Add ${PLUGIN_PROPERTIES[name]}; recipe drag-reorder shows it`);
  }
};

// Rows with `transition` changed places without the moves plugin, so they jumped instead of sliding. Said once per list, in the console:
// a list that never needs to slide is not an error.
export const noteRowsJumped = (path, noted) => {
  if (noted.has(path)) return;
  noted.add(path);
  console.warn(`each at ${path}: rows with \`transition\` changed places and jumped. To slide them, add withMoves, the export of @ehtb/agent-ui/moves (plugins: [withMoves] in page.js; moves in the plugins of app()); recipe drag-reorder shows it`);
};

export const checkRowState = (operation, namespace, rowDefaults) => {
  if (!rowDefaults) throw new Error(`store.${operation}(...): namespace "${namespace}" has no rowState. Declare the per-row fields with their defaults: rowState: { open: false }`);
};

export const checkRowKey = (operation, id) => {
  if (typeof id !== 'string' && typeof id !== 'number') throw new Error(`store.${operation}(${JSON.stringify(id)}): the row key must be a string or a number, the key of the list's rows`);
};

export const checkRowChanges = (id, changes, namespace, rowDefaults) => {
  if (changes === null || typeof changes !== 'object' || Array.isArray(changes)) throw new Error(`store.setRow(${JSON.stringify(id)}, ...): the second argument is an object of fields to values, for example { open: true }`);
  for (const field of Object.keys(changes)) {
    if (!(field in rowDefaults)) throw new Error(`store.setRow(${JSON.stringify(id)}, ...): namespace "${namespace}" has no row field "${field}". ${didYouMean(field, Object.keys(rowDefaults))}Row fields: ${Object.keys(rowDefaults).join(', ')}`);
  }
};

export const checkRowStateWrite = (key, isRowStateKey) => {
  if (isRowStateKey) throw new Error(`store.set("${key}"): "${key}" holds the per-row state and is written with store.setRow(id, { field: value }), store.clearRow(id)`);
};

// A problem is the same one when the list, the code, the value and the two positions are: data that changed before the list rendered
// is a new problem. The path comes first so that the leftovers of one list can be dropped.
const listProblemId = (code, details) => `${details.path}|${code}|${details.value}|${details.first}|${details.second}`;

// The renderer asks before it reports a problem of a list: true when the check at mount already reported this very problem (once per
// time it counted it), so opening the branch does not report it a second time. `checked` is the Map checkEachKeys fills.
export const consumeCheckedListProblem = (checked, code, details) => {
  if (!checked) return false; // an app made with dev: false keeps no record, also when this module is in the build (--validator=include)
  const id = listProblemId(code, details);
  const count = checked.get(id);
  if (count) checked.set(id, count - 1);
  return Boolean(count);
};

// Once a list has rendered it has seen its data, so what the check at mount counted for it and the renderer did not meet is out of date
// (the data changed before the branch opened) and must not swallow a report of the list later.
export const forgetCheckedListProblems = (checked, path) => {
  if (!checked) return;
  for (const id of checked.keys()) if (id.startsWith(`${path}|`)) checked.delete(id);
};

// A list (`each`) that reads a state or derived key is checked on the data it has when the app mounts, also when it sits in a branch
// (`when`) that is not shown yet and so was never rendered: a duplicate key or an item without one would only show up when the
// branch opens. Calls report(code, details) for each problem, with the spec path the runtime uses for the list. `readList(key)` gives
// the value of a qualified key, `renderedPaths` holds the lists that rendered (the renderer reported theirs), and `checked` counts the
// problems found, for consumeCheckedListProblem. Nothing below another `each` is checked: its rows do not exist yet, and a list there
// is checked when a row renders.
export const checkEachKeys = (spec, readList, renderedPaths, checked, report) => {
  if (!checked) return;
  const add = (code, details) => {
    const id = listProblemId(code, details);
    checked.set(id, (checked.get(id) ?? 0) + 1);
    report(code, details);
  };
  const walk = (node, path) => {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return;
    if (node.each !== undefined && !renderedPaths.has(path)) {
      const source = typeof node.each === 'string' ? node.each : node.each.state;
      let items;
      try {
        items = typeof source === 'string' ? readList(source) : undefined;
      } catch {
        items = undefined; // a derived value that throws is reported where it is shown
      }
      if (Array.isArray(items)) {
        const seenKeys = new Map();
        items.forEach((item, position) => {
          const key = node.key === '.' ? item : item?.[node.key];
          if (key === undefined || key === null || typeof key === 'object') add('AUI0302', { key: node.key, path });
          else if (seenKeys.has(key)) add('AUI0303', { value: key, path, key: node.key, source, first: seenKeys.get(key), second: position });
          else seenKeys.set(key, position);
        });
      }
    }
    const walkChildren = (children, prefix) => (Array.isArray(children) ? children : children === undefined ? [] : [children]).forEach((child, index) => walk(child, `${prefix}.${index}`));
    if (node.each !== undefined) return; // the lists below an each's template read its rows, and are checked when a row renders
    if (node.when !== undefined) {
      walkChildren(node.children, `${path}.when`);
      walkChildren(node.otherwise, `${path}.otherwise`);
    } else {
      walkChildren(node.children, path);
    }
  };
  walk(spec, '0');
};
