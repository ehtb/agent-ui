// Namespaces: the one way state, derived values and actions are declared.
//
//   namespaces: {
//     todos:  { state: { items: [], draft: '' }, derive: { remaining: (get) => ... }, actions: { add: { args: {}, calls: ['search.clear'], run } } },
//     search: { state: { query: '' }, actions: { clear: { args: {}, run: (store) => store.set('query', '') } } },
//   }
//
// Every state key, derived value and action belongs to exactly one namespace. Outside it, a key is written
// "namespace.key" ({state: 'todos.draft'}) and an action "namespace.verb" ('todos.add'). Inside an action or a derived
// value, the keys of its own namespace are written without the prefix ('draft') and the keys of any other namespace with
// it ('search.query'). An action writes only its own namespace; a change in another namespace goes through `calls`.
//
// Internally the store stays flat: one signal per qualified key ("todos.draft"), so granularity and row reuse are the
// same as before. The namespace is enforced when it is declared (validate.js) and when it is written (ui.js).

// What a namespace, state key, derived value or action verb may be called: it becomes part of "namespace.name", so no dots.
export const IDENTIFIER = /^[a-z][A-Za-z0-9]*$/;
// The namespace the router owns (route.name, route.params, route.set): no route or shared namespace can have this name.
export const RESERVED_NAMESPACE = 'route';
export const NAMESPACE_KEYS = ['state', 'derive', 'actions', 'resources', 'shapes', 'rowState'];
// A namespace with `rowState` gets one state key of this name: { [rowKey]: { field: value } }, only the rows that differ from the defaults.
export const ROW_STATE_KEY = 'rowState';
export const SHAPE_KEYS = ['fields', 'validate'];
export const ACTION_KEYS = ['args', 'run', 'calls'];

// "todos.items.0.title" -> { key: "todos.items", fields: ["0", "title"] }. A path without a second segment gives key
// "todos.undefined"-free output: `key` is null, which the callers report.
export const splitStatePath = (path) => {
  const [namespace, name, ...fields] = path.split('.');
  return { namespace, name, key: name === undefined ? null : `${namespace}.${name}`, fields };
};

// The tables of all namespaces as flat tables keyed by qualified name.
export const flattenNamespaces = (namespaces) => {
  // Tables without a prototype: a lookup by a name a user typed ("toString", "constructor") finds nothing, not an inherited function.
  const state = Object.create(null);
  const derive = Object.create(null);
  const actions = Object.create(null);
  const shapes = Object.create(null); // qualified state key or derived name -> { fields?, validate? }
  const rowStates = Object.create(null); // namespace -> { field: default } for the namespaces that declare rowState
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

// The declared state with `initialState` ({namespace: {key: value}}, the shape of ui.state()) laid over it, as a flat
// table. Keys that are not declared are left out (validate() reports them in development).
export const mergeStateValues = (flatState, initialState = {}) => {
  const merged = { ...flatState };
  for (const [namespace, values] of Object.entries(initialState)) {
    for (const [name, value] of Object.entries(values ?? {})) {
      if (`${namespace}.${name}` in merged) merged[`${namespace}.${name}`] = value;
    }
  }
  return merged;
};

// Lays two or more partial states over each other, namespace by namespace and key by key: later ones win. Use it for the
// state a visitor saved plus the state a server sent, before passing the result as `initialState`.
export const mergeInitialState = (...partialStates) => {
  const merged = {};
  for (const partial of partialStates) {
    for (const [namespace, values] of Object.entries(partial ?? {})) merged[namespace] = { ...merged[namespace], ...values };
  }
  return merged;
};

// A flat table of qualified keys as nested { namespace: { key: value } }. Every namespace is present, even without keys.
export const nestByNamespace = (namespaceNames, qualifiedKeys, read) => {
  const nested = Object.fromEntries(namespaceNames.map((namespace) => [namespace, {}]));
  for (const key of qualifiedKeys) {
    const dot = key.indexOf('.');
    nested[key.slice(0, dot)][key.slice(dot + 1)] = read(key);
  }
  return nested;
};

// The state keys a namespace declares: its `state` plus the key rowState adds.
export const declaredStateKeys = (definition) => [...Object.keys(definition?.state ?? {}), ...(definition?.rowState ? [ROW_STATE_KEY] : [])];
