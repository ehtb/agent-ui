// What `agent-ui explain <topic>` prints for the parts of the grammar and the files around it: the one valid form, a working example,
// and where the full reference is. The recipes (cookbook/recipes.mjs) are the other half of `explain`; a recipe is a whole page, a topic
// is one part.
//
//   title    one line
//   form     the one valid form, as the code states it
//   example  JavaScript that builds a value with the builders of @ehtb/agent-ui/spec (they are in scope) and returns it; test/explain.test.mjs
//            runs it, and when `namespaces` is given validates the result against them, so an example cannot rot
//   see      where the reference is
const todos = {
  state: { items: [{ id: 1, title: 'milk', done: false }], draft: '' },
  derive: { remaining: (get) => get('items').filter((todo) => !todo.done).length },
  actions: {
    add: { args: { title: 'string' }, run: (store, { title }) => store.set('items', [...store.get('items'), { id: store.get('items').length + 1, title, done: false }]) },
    toggle: { args: { id: 'number' }, run: (store, { id }) => store.set('items', store.get('items').map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo))) },
    setDraft: { args: { value: 'string' }, run: (store, { value }) => store.set('draft', value) },
  },
};
const pickers = { rowState: { open: false }, actions: { toggle: { args: { id: 'number' }, run: (store, { id }) => store.setRow(id, { open: !store.getRow(id).open }) } } };
const orders = { state: { list: [{ id: 1, customer: 'Ada', lines: [{ id: 10, sku: 'pen' }] }] }, actions: { drop: { args: { orderId: 'number', lineId: 'number' }, run: () => {} } } };

export const topics = [
  {
    name: 'start',
    title: 'Start a page: the first ten minutes',
    form: [
      '1. Read docs/AGENT-RULES.md (the short rules for an app), then docs/GUIDE.md (how pages, URLs, APIs and forms fit). Use docs/API.md as the reference.',
      '2. Run `agent-ui explain` and copy the recipe closest to the task; `agent-ui explain <recipe>` prints its files.',
      '3. A page is pages/<url>/page.js (behavior) and pages/<url>/view.js (content). Add a folder, not a route list.',
      '4. State lives in namespaces and only actions write it; every list has a stable, unique key; every action argument is declared.',
      '5. Run `agent-ui check` before you finish, and write a test with ui.dispatch, await ui.settle() and assertNoErrors(ui).',
    ].join('\n'),
    see: 'docs/AGENT-RULES.md, "Start here"; docs/GUIDE.md',
  },
  {
    name: 'page-css',
    title: 'Page CSS and CSS shared with a subset of pages',
    form: [
      'pages/<url>/page.css   that page\'s CSS; pages/style.css   CSS every page loads.',
      'Both may start with relative imports: @import "../shared/alert.css"; — at the top, one statement per file, with a .css extension.',
      'A file imported by pages A and B is one shared stylesheet linked only to A and B; one imported by pages/style.css is on every page.',
      'Do not import CSS from page.js, view.js or a component (they run in Node). A component owns a class name and a CSS file; the page that uses it imports that file in page.css.',
      'Global CSS loads first, imported CSS before the importing file, and page.css last. Use @layer if independent shared files need a strict order. CSS stays global; there is no scoped CSS.',
    ].join('\n'),
    see: 'docs/BUILD.md, "CSS imports"; docs/API.md, "Project layout"',
  },
  {
    name: 'element',
    title: 'An element: tag(attributes | null, ...children)',
    form: [
      'One builder per tag. The first argument is always the attributes object, or null; the rest are children (text, bindings, elements, each, when).',
      '`id` is the element\'s address in the spec (data-id); `domId` is the HTML id attribute. `classes` maps a class name to a binding; `class` is the constant part.',
      '`on` maps an event to act(...) or a list of them. Every other attribute is a prop. Inputs, selects and textareas need aria-label; images need alt.',
    ].join('\n'),
    example: "div({ id: 'card', class: 'card', classes: { open: state('card.open') } }, h2(null, state('card.title')), button({ on: { click: act('card.toggle') } }, 'Toggle'))",
    namespaces: { card: { state: { open: false, title: 'Hello' }, actions: { toggle: { args: {}, run: (store) => store.set('open', !store.get('open')) } } } },
    see: 'docs/API.md, "Elements" and "Builders"',
  },
  {
    name: 'binding',
    title: 'A binding: a value that follows the state',
    form: [
      'state(\'namespace.key\')          a state key or derived value, then any path inside it: state(\'todos.current.title\')',
      'item(\'field\')                   a field of the innermost row of an each; item(\'.\') is the item itself (lists of strings or numbers)',
      'row(\'name.field\')               a field of an enclosing row that said as: \'name\'; row(\'name\') is the whole item',
      'rowState(\'namespace.field\')     the per-row state of the innermost row (the namespace declares rowState)',
      'not, length, equals, greaterThan, lessThan, and, or, join   small operators over bindings and literals; nothing else exists',
      'Anything over a whole list, and all formatting of numbers and dates, is computed in derive.',
    ].join('\n'),
    example: "p(null, join(state('todos.remaining'), ' left'), when(equals(state('todos.remaining'), 0), ' (all done)'))",
    namespaces: { todos },
    see: 'docs/API.md, "Bindings"; recipe format-values',
  },
  {
    name: 'handler',
    title: 'A handler: act(\'namespace.verb\', args, options)',
    form: [
      'on: { click: act(\'todos.add\', { title: state(\'todos.draft\') }) }',
      'Arguments are exactly the ones the action declares: a literal, state(...), item(...), row(...) or event(\'target.value\'). No operators and no logic.',
      'Several handlers on one event: on: { click: [act(\'a.first\'), act(\'b.second\')] } run in order, each logged.',
      'Keys: \'keydown.Enter\', \'keydown.Control+Shift+k\'. Options: { preventDefault, stopPropagation }; a submit is prevented unless you say otherwise.',
    ].join('\n'),
    example: "input({ 'aria-label': 'New todo', value: state('todos.draft'), on: { input: act('todos.setDraft', { value: event('target.value') }), 'keydown.Enter': act('todos.add', { title: state('todos.draft') }) } })",
    namespaces: { todos },
    see: 'docs/API.md, "Events and handlers"',
  },
  {
    name: 'each',
    title: 'A list: each(source, key, template, { as })',
    form: [
      'each(\'todos.visible\', \'id\', li(...))     one row per item of a state or derived list; the key is a field that is unique and stable, or \'.\' for strings and numbers',
      'The key must be unique across the whole list and never missing, also in lists you write as literals in `derive` or `initialState` and in a `when` branch that is not shown yet: two items with the same key and the later one is dropped (error AUI0303). `agent-ui check` and the check at mount report it with the list and the two positions.',
      'Nested: each(item(\'lines\'), \'id\', li(...)) inside a row; item(...) is the innermost row.',
      'To read the outer row from the inner template, name it: each(\'orders.list\', \'id\', ..., { as: \'order\' }) and write row(\'order.id\') inside.',
    ].join('\n'),
    example: "ul(null, each('orders.list', 'id', li(null, each(item('lines'), 'id', li(null, join(row('order.customer'), ': ', item('sku')), button({ 'aria-label': 'Remove', on: { click: act('orders.drop', { orderId: row('order.id'), lineId: item('id') }) } }, 'x')))), { as: 'order' }))",
    namespaces: { orders },
    see: 'docs/API.md, "each"; recipes list-edit and nested-rows',
  },
  {
    name: 'when',
    title: 'A condition: when(binding, children, otherwise)',
    form: 'Only the branch that matches exists. The condition is a binding; children and otherwise are one node or a list of nodes, and at least one is given (null for the empty one).',
    example: "div(null, when(state('todos.draft'), span(null, 'typing...'), span(null, 'idle')))",
    namespaces: { todos },
    see: 'docs/API.md, "when"',
  },
  {
    name: 'per-row-state',
    title: 'State per row: rowState in the namespace, rowState(...) in the view',
    form: [
      'namespace:  pickers: { rowState: { open: false }, actions: { toggle: { args: { id: \'number\' }, run: (store, { id }) => store.setRow(id, { open: !store.getRow(id).open }) } } }',
      'view:       inside an each: classes: { open: rowState(\'pickers.open\') }, on: { click: act(\'pickers.toggle\', { id: item(\'id\') }) }',
      'store:      getRow(id), setRow(id, changes), clearRow(id); the row is addressed by the key of the list\'s rows. The state key is namespace.rowState, only rows that differ.',
    ].join('\n'),
    example: "ul(null, each('orders.list', 'id', li({ classes: { open: rowState('pickers.open') }, on: { click: act('pickers.toggle', { id: item('id') }) } }, item('customer'))))",
    namespaces: { orders, pickers },
    see: 'docs/API.md, "Per-row state"; recipe row-state',
  },
  {
    name: 'namespace',
    title: 'A namespace: { state, derive, actions, resources?, shapes?, rowState? }',
    form: [
      'todos: {',
      '  state: { items: [], draft: \'\' },                         plain JSON, replaced never mutated',
      '  derive: { remaining: (get) => get(\'items\').filter(...).length },     pure; own keys plain, other namespaces\' keys as \'namespace.key\'',
      '  actions: { add: { args: { title: \'string\' }, calls: [\'draft.clear\'], run: (store, { title }, call) => { ... } } },',
      '}',
      'An action writes only its own namespace (store.set(\'items\', ...)); a change in another goes through calls and call(\'draft.clear\', {}). Argument types: string, number, boolean, json.',
    ].join('\n'),
    see: 'docs/API.md, "State"; README.md, "State management"',
  },
  {
    name: 'plugin',
    title: 'A plugin: effects live outside actions',
    form: [
      'A page lists plugins: [withResources]. A plugin is (environment) => (api) => void; it reads with api.watch(keys, callback) and writes with api.dispatch(name, args), and stays quiet while api.replaying.',
      'The server runs plugins too, against a stand-in window. A plugin with a timer, a window listener, a request or a browser-only library starts with `if (isServerRendering) return;` (environment: { win, fetchFunction, dev, isServerRendering }).',
      'To draw into an element (a chart, an editor): mountElement(api, \'element-id\', (element, { key }) => cleanup) from @ehtb/agent-ui/mount-element; the element has an explicit id and no children in the spec.',
    ].join('\n'),
    see: 'docs/API.md, "Plugins"; recipes browser-only-plugin, draw-into-element',
  },
];
