# agent-ui API reference

This file is authoritative for everything under `src/`. If code and this file disagree, fix one of them in the same change. Everything here is implemented and tested unless marked **proposed**. Bundling and shipping an app is in `BUILD.md`. The reasons behind the design are in `DESIGN.md`.

Contents: 1 mental model, 2 a complete minimal app, 3 spec grammar, 4 namespaces: state, derive, actions, 5 update model, 6 plugins, 7 agent API, 8 spec tools, 9 validator and error catalogue, 10 testing, 11 recipes, 12 components, reusable namespaces, server rendering, types and dev loop, 13 pages, 14 limits.

## 1. Mental model

```
state (signals, plain JSON) --derive (pure functions)--> derived signals
        ^                                                     |
   actions (typed, the only writers)                  bindings in the spec --one effect each--> one DOM property
        ^
   delegated DOM events <-- spec `on` maps events to [actionName, args]       plugins: api.watch / api.dispatch
```

An app is two values:

- `namespaces`: `{ name: { state, derive, actions, resources, shapes, rowState } }`. `state` is the initial data as JSON, `derive` holds pure functions computed from state, and `actions` are named, typed functions, the only code that writes state. Every state key, derived value and action belongs to exactly one namespace and writes only its own (section 4).
- `spec`: the UI tree, as data.

Nothing else carries behavior. Anything that touches the outside world (network, timers, window events) is a plugin. A plugin talks to the app only through `api.watch` (state out) and `api.dispatch` (changes in), so every change of state is an action in the log.

```js
import { app } from '@ehtb/agent-ui';
const ui = app({ namespaces, spec, root, initialState: {}, plugins: [], dev: true, debug: false });
```

`app` validates the namespaces and the spec first and throws an `Error` that lists the problems one per line (`error.problems` is the list) when it finds any. `debug: true` makes the browser console show what the app does (the debug console, below); `debug` is `false` unless you say otherwise. It then creates one signal per state key, renders into `root`, runs the plugins, and returns the agent API (section 7). `initialState` (optional) is a partial state in the shape of `ui.state()`, `{ namespace: { key: value } }`, laid over the declared state; it is how server-rendered state arrives. An unknown namespace or key in it is an error with a suggestion. `dev` is required, `true` or `false`, with no default: `true` deep-freezes state so an in-place mutation fails loudly and turns the development checks on, `false` is for production. A generated browser entry writes it down (`true` in a development build), so the mode is never guessed.

The grammar is machine-readable: `import { grammar } from '@ehtb/agent-ui'` gives the allowed tags, events, key modifiers, binding keys, argument types and node keys. These are the same constants the validator uses.

### Importing

The package is imported by name. Every module has one specifier, types included. The bundler resolves these the way Node does, through the package's `exports`.

| Import | What it is |
|---|---|
| `@ehtb/agent-ui` | the runtime: `app`, `signal`, `effect`, `settle`, `validate`, `grammar`, `mergeInitialState`, `countEffectRuns` |
| `@ehtb/agent-ui/head` | the plugin `withHead`, which keeps the browser's document current as the state changes, for a page whose `head` is a function of the state (section 13, "Head") |
| `@ehtb/agent-ui/resources`, `/window-events`, `/follow`, `/moves` | plugins; a page downloads only the ones it imports. All the plugins, and when to list each: section 6, "The plugins the package ships" |
| `@ehtb/agent-ui/spec` | the builders (section 3, "Builders"): `div(...)`, `state(...)`, `act(...)`, `each`, `when`, one function per tag and operator |
| `@ehtb/agent-ui/mount-element` | `mountElement(api, id, mount)`: how a plugin that draws into an element (a chart, an editor, a map) claims it (section 6, "Plugins that draw into an element") |
| `@ehtb/agent-ui/spec-tools`, `/components`, `/memoize`, `/sync-apps` | `patchSpec`, `listIds`, `expandComponents`, `defineElement`, `param`, `paramKey`, `slot`, `memoizeItem`, `syncApps` (one-way sync between two separate apps on a page, section 6) |
| `@ehtb/agent-ui/shell`, `/navigation` | `defineShell` (the part of a document that stays while the page changes) and the plugin `withNavigation` (soft links and `route.go`): section 13, "Shell and soft navigation" |
| `@ehtb/agent-ui/pages`, `/url-pattern` | `definePage` and `startPage` (section 13), and `compileUrlPattern` / `sortBySpecificity`, the URL patterns that pages and API tables share |
| `@ehtb/agent-ui/messages` | `fail(where, problem, fix)` and `didYouMean(word, candidates)`: the one shape of every error, for plugins and project code that follow rule 12 |
| `@ehtb/agent-ui/http-headers` | `checkResponseHeaders(headers, where, options)` and `mergeResponseHeaders(...layers)`: the checks and merge order the render handler applies to API, form and transform headers; for a host server or plugin that writes its own response (section 12, "Request context, response headers and a session") |
| `@ehtb/agent-ui/server`, `/hydrate` | server rendering (`renderPage`) and the browser side (`browserEnvironment`) |
| `@ehtb/agent-ui/server/ssr-handler.mjs` | `createSsrHandler`: a request handler `(request, response, next?)` for your own Node server that renders the pages and handles the `api` module; it serves no files. Its `initialStateFor`, `stateForBrowser` and `transformResponse` hooks add public state, choose what the document carries, and change an answer's headers or body (section 12) |
| `@ehtb/agent-ui/spec-schema` | `createSpecSchema()`: the JSON Schema of the spec |
| `@ehtb/agent-ui/devtools` | the debug console (`mountDevtools`): what the app does, written to the browser console |
| `@ehtb/agent-ui/cli/ssr-server.mjs`, `/cli/static-handler.mjs` | `createSsrServer`, `createStaticServer`: the servers behind `agent-ui serve` and `agent-ui dev`, for tests and examples. Not for production: a deployed site is served by the host's own file server |
| `@ehtb/agent-ui/build` | the build pipeline as a library (Node only): `build`, `loadConfig`, `frameworkBuildOptions`, `prerender` (the static build), `discoverPages`, `formatReport` |
| `@ehtb/agent-ui/build/build.mjs`, `/build/config.mjs`, `/build/prerender.mjs` | one stage of the build pipeline, the configuration loader and the static build, for a script that drives a build itself (Node only) |
| `@ehtb/agent-ui/testing/dom-shim.mjs`, `/testing/helpers.mjs`, `/testing/json-schema.mjs`, `/testing/browser.mjs` | test helpers, Node only; in the repository the files are `test/support/*.mjs`. `browser.mjs` drives a real headless Chrome (section 10) |
| `@ehtb/agent-ui/build/presets.mjs` | `frameworkBuildOptions` for the build configuration |

Command line: `agent-ui build | dev | serve | check | schema | explain | init`, run as `npx agent-ui <command>` or from `package.json` scripts.

## 2. A complete minimal page

A page is a folder with a `page.js` (the page's behavior) and a `view.js` beside it (its content) — `pages/page.js` and `pages/view.js` are the page at `/`, and a folder below `pages/` is the URL of its path, see GUIDE.md. There is no entry file to write: the build generates it. A test drives the page without a browser. Only the server and the build import `view.js`: a production build evaluates it in Node and ships the finished spec as data, so the browser downloads the behavior and the spec, not the builders.

`pages/page.js` exports a `page`: its `head` and its `namespaces`. The notes live in the namespace `notes`; the draft being typed is another namespace, `composer`, because it is a different concern. When the form is submitted both change, so `composer.submit` calls the action `notes.add` instead of writing the notes itself. The framework is imported by package name (see "Importing" above):

```js
export const namespaces = {
  notes: {
    state: { items: [], nextId: 1 },
    derive: { label: (get) => `${get('items').length} ${get('items').length === 1 ? 'note' : 'notes'}` },
    actions: {
      add: {
        args: { text: 'string' },
        run: (store, { text }) => {
          const id = store.get('nextId');
          store.set('items', [...store.get('items'), { id, text }]);
          store.set('nextId', id + 1);
        },
      },
      remove: {
        args: { id: 'number' },
        run: (store, { id }) => store.set('items', store.get('items').filter((note) => note.id !== id)),
      },
    },
  },
  composer: {
    state: { draft: '' },
    actions: {
      setDraft: { args: { value: 'string' }, run: (store, { value }) => store.set('draft', value) },
      submit: {
        args: {},
        calls: ['notes.add'],
        run: (store, args, call) => {
          const text = store.get('draft').trim();
          if (!text) return;
          call('notes.add', { text });
          store.set('draft', '');
        },
      },
    },
  },
};

export const page = { head: { title: 'Notes' }, namespaces };
```

`pages/view.js` beside it holds the content and exports it as `view`:

```js
export const view = {
  tag: 'main',
  children: [
    { tag: 'h1', children: 'Notes' },
    {
      tag: 'form',
      on: { submit: ['composer.submit'] },
      children: [
        {
          tag: 'input',
          id: 'draft',
          props: { 'aria-label': 'New note', value: { state: 'composer.draft' } },
          on: { input: ['composer.setDraft', { value: { event: 'target.value' } }] },
        },
        { tag: 'button', props: { type: 'submit' }, children: 'Add' },
      ],
    },
    {
      tag: 'ul',
      children: {
        each: 'notes.items',
        key: 'id',
        template: {
          tag: 'li',
          children: [
            { tag: 'span', children: { item: 'text' } },
            {
              tag: 'button',
              props: { 'aria-label': 'Delete' },
              on: { click: ['notes.remove', { id: { item: 'id' } }] },
              children: '×',
            },
          ],
        },
      },
    },
    { tag: 'p', children: { state: 'notes.label' } },
  ],
};
```

An optional `pages/page.css` next to it is that page's stylesheet; it may `@import` shared CSS files, and `agent-ui build` writes the site (`BUILD.md`, "CSS imports"). The notes live in memory: durable data belongs on the server (`resources`, section 6). Test the page with the helpers from section 10 (`notes.test.mjs`); `definePage` gives the `create` function that the generated browser entry calls too:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { definePage } from '@ehtb/agent-ui/pages';
import { createRoot } from '@ehtb/agent-ui/testing/dom-shim.mjs';
import { page } from './pages/page.js';
import { view } from './pages/view.js';

const { create } = definePage(page, { path: '/', view }); // the page's URL; the build takes it from the folder and the view from view.js

test('adds a note through the form action', async () => {
  const ui = create({ root: createRoot(), dev: true });
  ui.dispatch('composer.setDraft', { value: 'buy milk' });
  ui.dispatch('composer.submit');
  await ui.settle();
  assert.deepEqual(ui.state().notes.items, [{ id: 1, text: 'buy milk' }]);
  assert.equal(ui.state().composer.draft, '');
  assert.equal(ui.errors.length, 0);
});
```

`app()` (section 1) is the primitive underneath: a page is `app()` plus a URL, a head and the plugins it names. Use it directly in a library or a test of your own.

## 3. Spec grammar

```
node     := "text" | binding | element | each | when
element  := {tag, id?, props?, classes?, on?, transition?, children?}
each     := {each: "namespace.key" | binding, key: "field" | ".", as?: "name", template: element}
when     := {when: binding, children?: node | node[], otherwise?: node | node[]}
binding  := exactly one of
              {state: "namespace.key.path"}  {item: "field" | "."}  {row: "name.field" | "name"}  {rowState: "namespace.field"}  {not: x}  {length: x}
              {equals: [x, y]}  {greaterThan: [x, y]}  {lessThan: [x, y]}  {and: [x, y, ...]}  {or: [x, y, ...]}
              {join: [x, ...]}                                       (x is a binding or a literal)
```

An unknown key anywhere in a node is a validation error. `chilren` is reported with a suggestion, never ignored.

### Bindings

| Binding | Value |
|---|---|
| `{state: "todos.draft"}` | The state key or derived value `draft` of the namespace `todos`, then any optional-chained path inside its value: `{state: "todos.current.title"}` is key `todos.current`, path `.title`. Always written with its namespace. Re-evaluated when that key changes. |
| `{item: "field"}` | Field of the current row's item. Valid inside an `each` template, including nested `when` and `each`. In a nested `each`, `{item}` is the **innermost** row. `{item: "."}` is the item itself, for lists of strings or numbers. |
| `{row: "name.field"}` | Field of the item of an **enclosing** `each` that said `as: "name"`, from any depth below it. `{row: "name"}` is that whole item (lists of strings or numbers). Also valid as a handler argument. See "each". |
| `{rowState: "namespace.field"}` or `{rowState: "rowname.namespace.field"}` | The value of `field` in the `rowState` of `namespace`, for the row of the innermost `each` (the row key is the `each`'s `key`), or, with three parts, for the row of the enclosing `each` that said `as: "rowname"`. See "Per-row state". |
| `{not: x}` | `!x`. |
| `{length: x}` | `x.length`, or 0 for `null` and `undefined`. Works for arrays and strings. |
| `{equals: [x, y]}` | `x === y`: strict equality, so two lists or objects are equal only when they are the same value (the same reference), even when their contents match. Compare strings, numbers and booleans, or a field of them (`{item: 'id'}`). A derived value, by contrast, keeps its previous reference when a recompute is structurally equal to it, to depth 2 (`isSameValue`), so rows do not re-render for nothing; that rule is about what re-renders, not about `equals`. |
| `{greaterThan: [x, y]}`, `{lessThan: [x, y]}` | `>` and `<`. |
| `{and: [...]}`, `{or: [...]}` | Boolean `every` and `some` over truthiness, at least 2 operands. They return `true` or `false`, not an operand. |
| `{join: [...]}` | Concatenates operands as strings; `null` and `undefined` become empty. Use it to build text, class strings, URLs and style strings from several values. |

As a child, a binding renders text. `null` and `undefined` become empty; numbers and booleans are stringified. Operands are bindings or literals (string, number, boolean, null). An object operand that is not a binding is an error.

### Elements

| Field | Meaning |
|---|---|
| `tag` | One of the allowed tags, listed in `grammar.tags`: div span p h1 h2 h3 ul ol li button input label a section header footer main nav form select option textarea strong em b i small code pre blockquote hr br img table thead tbody tfoot tr th td caption dl dt dd details summary dialog aside article fieldset legend figure figcaption progress time, and the SVG tags svg g path circle ellipse rect line polyline polygon use (see "SVG"). Void tags (`input`, `img`, `hr`, `br`, and the SVG shapes) cannot have children. |
| `id` | Stable address, rendered as `data-id`. Must be a unique non-empty string within the spec. Defaults to the spec path (see "Default ids"). Give an explicit id to anything tests or other agents must find across edits. |
| `props` | `{name: literal \| binding}`. See "Props" below. |
| `classes` | `{className: binding}`. Values must be bindings, never `true` or `false` literals; constant classes go in `props.class`. The final `class` attribute is the static `props.class` plus every class whose binding is truthy, written as one attribute and removed when empty. |
| `on` | `{ "event": handler }`. See "Events and handlers". |
| `transition` | A positive number of milliseconds. See "Transitions". |
| `children` | A node or an array of nodes. |

**Props.** `value`, `checked` and `disabled` are DOM properties, written only when they differ from the current value. `focus: true` calls `element.focus()` after insertion. `follow` (a boolean or a boolean binding, never an attribute) makes the element track the pointer while it is true: see "Following the pointer". `soft: true` on a link (`a` with an `href`; a literal, never a binding) makes following it a soft navigation when the page has a shell that listens: it is written as the attribute `data-soft`, and everything else about the link stays a normal link (section 13, "Shell and soft navigation"). Every other name is an attribute: `true` sets an empty attribute, `false` and `null` remove it. For `aria-*` names, booleans become the strings `"true"` and `"false"`, and `false` does not remove them. `data-agent-ui-*` names are the framework's (they mark what a server wrote into the head) and are refused in a view.

Order is handled for you. `type` is applied before the other props, and a `select`'s `value` is applied after its options exist. A select's value is **not** re-applied when its options change later; re-select by binding `value` to state that changes.

The validator reports names from other conventions at mount: `className`, `htmlFor` and `onClick`-style names. It also reports object values (`style` must be a string; build it with `join`) and unsafe URLs.

**URL safety.** Values of `href`, `src`, `action` and `formaction` that start with `javascript:` or `vbscript:` are blocked: the attribute is removed and `errors` records it. `data:` is blocked everywhere except the `src` of an element that shows it (an `img`); the `src` of a `<script>` in the head is checked like an `href`. Literal violations are reported by the validator, bound ones at runtime.

**Transitions.** After the first render, a row of an `each` or a branch of a `when` whose root element has `transition` gets `data-transition="enter"` for two frames when it is added. When it is removed it gets `data-transition="leave"` for that many milliseconds first, and ignores events meanwhile. CSS does the animating, for example `li { transition: opacity .2s } [data-transition] { opacity: 0 }`. State is final immediately; only the DOM removal is delayed. Initial and server-rendered markup never animates.

**Moves.** With the plugin `withMoves` (`@ehtb/agent-ui/moves`; `moves` for `app()`), a row of a keyed `each` whose root element has `transition` also slides when it changes position: before the reorder the plugin measures the row (`getBoundingClientRect`), after it plays `element.animate` from the old spot to the new one (a translate, FLIP) for that many milliseconds. Nothing else is needed in the spec or the CSS, and only the rows that moved are animated. Without the plugin the rows jump to their places, and in development the runtime says so in the console, once per list, with the import. It is skipped, and the row simply jumps, where there is no layout or no `Element.animate` (server rendering, the test shim), while `ui.replaying`, and when the user prefers reduced motion. The animation sets `transform` for its length, so do not rely on a transform of your own on such a row.

**Following the pointer.** `follow: <boolean binding>` in `props` (the drag overlay of a sortable list, a slider thumb). The plugin `withFollow` (`@ehtb/agent-ui/follow`; `follow` for `app()`) does the following; a spec that uses `follow` without it fails at mount with that import in the message. While it is true the plugin listens to `pointermove` on the document, and only for that time. On every frame it writes `--follow-x` and `--follow-y` (for example `37px`) on the element: how far the element must move from the place its layout gave it, so that it stays under the pointer where it was grabbed. The first move after `follow` turns true fixes the start. The CSS decides what to do with them: `[data-dragging] { transform: translate(var(--follow-x, 0px), var(--follow-y, 0px)); pointer-events: none }`. The coordinates are not state and not in the log, so replay and tests are unaffected, and nothing runs while `follow` is false. When a keyed `each` reorders its rows, the following row is re-placed at once, and it is not part of the "Moves" animation. Give a following row `pointer-events: none`, or the rows beneath it never receive `pointerover`. Touch: the pointer is captured by the element that received `pointerdown`, and its moves still reach the document, so the element follows. The properties are removed when `follow` turns false, and nothing is written after that. `follow` follows whatever binds it, not how the drag began: a state that is true after a keyboard pick-up makes the element follow the mouse too. If a page ends the drag with a handler on a broad ancestor (a `pointerup` on `main`), every pointer release there is a logged action, a no-op when nothing is being dragged. A literal other than `true`/`false` is refused by the validator.

**Drag and drop.** The grammar has no `dragstart`, `dragover`, `drop` or `dataTransfer`, and none will be added: a drag is the bubbling pointer events (`pointerdown` on a grip, `pointerover` on the rows it crosses, `pointerup` and `pointercancel`) calling actions, with `follow` for the picked-up row and `transition` for the others (the page lists their plugins, `withFollow` and `withMoves`). A touch pointer is captured by the grip and never reports the rows it crosses, so the keyboard (Enter, the arrow keys, Escape) is both the touch path and the accessible one, and belongs in every sortable list. Copy the recipe `drag-reorder` (`agent-ui explain drag-reorder`, tested in `test/examples/cookbook.test.mjs`); `examples/react-converted-components` builds a reusable `sortable` on the same pattern.

**SVG.** A closed subset for icons and simple drawings: `svg`, `g`, `path`, `circle`, `ellipse`, `rect`, `line`, `polyline`, `polygon`, `use` (`grammar.svgTags`). The runtime makes them in the SVG namespace; on the server they are markup, which an HTML parser puts in that namespace by itself. Their attributes are `grammar.svgAttributes` (`viewBox`, `fill`, `stroke`, `stroke-width`, `d`, `cx`, `points`, `transform`, ...) besides `href`, `width`, `height`, `class`, `style` and the global ones; an SVG attribute on an HTML tag is refused. The rules, all checked by the validator: a shape (every SVG tag but `svg`) stands only inside an `svg`; an `svg` holds only SVG tags, no text and no HTML; an `svg` either says what it shows (`role: 'img'` with an `aria-label`) or is `'aria-hidden': 'true'` beside text that says it. An icon used many times comes from a sprite in `public/` (`use({ href: '/icons.svg#star' })`, the base path added like any URL). What is drawn from data (the points of a line) is a derived value. A large or interactive chart is a library drawn by a plugin (`mountElement`). Copy recipe `svg-icons`.

### Events and handlers

A handler is `[actionName, args?, options?]`, where `actionName` is `namespace.verb` (`'todos.add'`). An event may also have a **list of handlers**, `[['todos.add', {...}], ['draft.clear']]`: they run in order, each as its own logged action, and every argument is read before the first one runs (so `{state}` arguments see the state as it was when the event happened). The first action that fails stops the list. For `preventDefault`, the handlers that state it decide (any `true` prevents; `false` everywhere opts out); if none states it, a `submit` is prevented as usual. A list has at least two handlers (a list of one is the handler itself).

- **Events:** `click`, `dblclick`, `pointerdown`, `pointermove`, `pointerup`, `pointercancel`, `pointerover`, `pointerout`, `input`, `change`, `keydown`, `keyup`, `focusin`, `focusout`, `submit`. They are delegated from the mount root. The nearest element with a matching handler, walking up from the target, fires. Handlers on its ancestors do **not** also fire. The pointer events are the bubbling ones (mouse, touch and pen); `pointerenter` and `pointerleave` do not bubble, so they are not here. `{event: "pointerType"}` reads `"mouse"`, `"touch"` or `"pen"`.
- **Keys:** `keydown.Enter`, `keyup.Escape`, `keydown.Control+Shift+k`. The chord is the modifiers present, in the fixed order `Control+Alt+Shift+Meta`, then `event.key` as the browser reports it, so a shifted `?` is `Shift+?`. An exact chord handler wins over a plain `keydown` handler on the same element. `keydown.Enter` does **not** fire while Shift is held; the plain `keydown` handler, if any, fires instead.
- **args:** `{argument: value}`. A value is a literal, `{state: path}` (read at event time), `{item: field}` (the row item at event time), `{row: name.field}` (a field of an enclosing named row), or `{event: "target.value"}` (a path into the event; use `target.checked` for checkboxes). The set of argument names must match the action's declaration exactly. Literal types are checked statically. A `json` literal may be an object or array; an object is read as a binding when it has a top-level `state`, `item`, `row` or `rowState` key (or is `{event}`), so do not use those keys in literal data, and the builder and validator refuse an object with an operator key (`not`, `length`, `equals`, `greaterThan`, `lessThan`, `and`, `or`, `join`).
- **options:** `{preventDefault?: boolean, stopPropagation?: boolean}`. `submit` handlers call `preventDefault` by default, because a form submits to an action, not to a server. Pass `{preventDefault: false}` to opt out. Other events keep their default unless asked.

### each

`each` names a state or derived key (`"todos.visible"`), or is a binding such as `{item: "tags"}` for nested lists. `key` names a field that is unique per item, or is `"."` when the item itself is the key. The template is exactly one element.

**Reading the outer row.** `{item}` is always the innermost row. When an inner template needs a field of an outer row (an order's id for a line's remove button, a customer's name for a line's label), the outer `each` gives its row a name with `as`, and anything inside it, at any depth, reads it with `{row: "name.field"}`, in bindings and in handler arguments:

```js
each('orders.list', 'id', li(null, each(item('lines'), 'id', li(null, join(row('order.customer'), ': ', item('sku')), button({ on: { click: act('orders.removeLine', { orderId: row('order.id'), lineId: item('id') }) } }, 'x')))), { as: 'order' })
```

The name is an identifier (letters and digits, starting with a lowercase letter) and cannot repeat the name of an enclosing `each` (the inner one would hide the outer). `{row}` follows the outer row when its item is replaced, and the validator checks it when the mount happens: a `row` outside any `as` fails with the names in scope and "Did you mean", and when the outer list has a shape (`shapes`) the field is checked against it. The recipe is `nested-rows` (`agent-ui explain nested-rows`). There is no need to copy outer fields into the inner items in `derive`.

Rows are created once per key and reused. A row's `{item}` bindings re-run only when the item **reference** changed. Rows are reordered in place, and a removed row has its effects disposed. Each row's root element gets `data-key`. An item without a usable key (missing, `null`, or an object) is reported in `errors` and skipped. A duplicate key is reported, with the list's source and the positions of the two items. In development the lists that read a state or derived key are also checked when the app mounts, including those inside a `when` branch that is not shown yet, so a duplicate in the data is found before the branch opens (`agent-ui check` reports it); a list below another `each` is checked when a row renders. The check at mount is development-only; a list that renders reports the duplicate as `AUI0303` in production too, and the list skips the later item.

### when

Renders `children` while the binding is truthy and `otherwise` while it is falsy. At least one of the two is required. Only the active branch exists. It is rebuilt when truthiness flips, not on every change, and the other branch's effects are disposed.

### Builders (`src/spec.js`)

**Builders are how a spec is written; the JSON above is what they produce** (the wire format the validator, the server renderer, the browser and the action log see). Write builders: a wrong call fails at its own line with the builder's name and the fix, and the shape is the one models have seen most (an element is a tag name, attributes and children). `@ehtb/agent-ui/spec` writes the same JSON as function calls, and a wrong call fails at the line that made it, with the builder's name and the fix. A builder returns exactly the object you would have written by hand (a test compares them), so the validator, `patchSpec`, server rendering and the action log see no difference, and raw JSON and builders can be mixed in one spec.

```js
import { main, h1, ul, li, input, button, each, when, act, event, item, equals, length, state } from '@ehtb/agent-ui/spec';

main(null,
  h1(null, 'Notes'),
  input({ 'aria-label': 'New note', value: state('composer.draft'), on: { input: act('composer.setDraft', { value: event('target.value') }) } }),
  ul(null, each('notes.items', 'id', li(null, item('text'), button({ on: { click: act('notes.remove', { id: item('id') }) } }, 'Delete')))),
  when(equals(length(state('notes.items')), 0), 'Nothing yet'),
);
```

| Builder | Result |
|---|---|
| `tag(attributes \| null, ...children)` for every tag in the grammar | `{ tag, props, children }`. `id`, `classes`, `on`, `transition` keep their meaning; every other attribute is a prop. `domId` is the HTML `id` attribute (`props.id`), because `id` is the element's address in the spec. Children may be text, bindings, elements, `each`, `when`, components, or arrays of them (flattened one level). The first argument is always the attributes object or `null`. |
| `state(path)`, `item(path)`, `row(path)`, `rowState(path)`, `event(path)` | `{ state: path }`, `{ item: path }`, `{ row: path }`, `{ rowState: path }`, `{ event: path }` (`event` only as a handler argument). `state` paths are `namespace.key`, then any path inside the value; a path without a namespace fails at the call. |
| `not`, `length`, `equals`, `greaterThan`, `lessThan`, `and`, `or`, `join` | The operators, with the operand counts of the grammar. |
| `act(name, args?, options?)` | A handler `[name, args?, options?]`; `name` is `namespace.verb`. The `on` values must be made with it, or be a list of them. |
| `when(condition, children, otherwise?)`, `each(source, key, template, { as }?)` | `when` and `each` nodes. `{ as: 'name' }` names the row for `row('name.field')` in the template. |

Mistakes caught at the call: a plain string as the first argument (`div('text')`), another framework's names (`className`, `htmlFor`, `onClick`, `props`, `children`), an unknown event or handler option (with "Did you mean"), `classes` values that are not bindings, a number or `null` as a child, children on a void tag, a wrong operand count, a `when` with nothing to show, an `each` template that is not one element. Production builds replace the checking module with a stub (`replaceModules`, as for the validator), so a builder there is only an object constructor. The validator still checks the finished spec as a whole (state keys, action names and arguments, ids, accessibility).

### Default ids

The root is `0`. Child `i` of an element at path `p` is `p.i`. Branch children are `p.when.i` and `p.otherwise.i`. An `each` template is `p.each`. A `when` or `each` node counts as one child of its parent. Paths shift when siblings are added, so use explicit ids for anything you address.

## 4. Namespaces: state, derive, actions

A namespace is `{ state?, derive?, actions?, resources?, shapes?, rowState? }`, and `namespaces` is `{ name: namespace }`. Every state key, derived value and action belongs to exactly one namespace.

```js
namespaces: {
  todos:  { state: { items: [], draft: '' }, derive: { visible: (get) => ... }, actions: { add: { args: {}, calls: ['search.clear'], run } } },
  search: { state: { query: '' }, actions: { clear: { args: {}, run: (store) => store.set('query', '') } } },
}
```

**Names.** Namespace names, state keys, derived names and action verbs are identifiers: letters and digits, starting with a lowercase letter (`todos`, `nextId`, `setDraft`). No dots and no dashes: the dot separates the parts of a qualified name. The qualified forms are the only forms outside the code of a namespace:

| Where | Written |
|---|---|
| a state binding, an `each` source, an action argument `{state}`, a `watch` list of a plugin, `ui.get(...)` | `todos.draft` (state key or derived value), then any path inside the value: `todos.current.title` |
| an action in a handler, `dispatch`, the log, `windowEvents`, `calls` | `todos.add` |
| `ui.state()`, `ui.derived()`, `initialState` | `{ todos: { items, draft } }`, nested by namespace |

**Inside a namespace.** An action's `store` and a derived value's `get` are scoped. A key of the namespace itself is written plain (`store.get('draft')`, `get('items')`); a key of any other namespace is written with its namespace (`get('search.query')`), for reading only. One form for each: writing `store.get('todos.draft')` inside `todos` is an error that says to drop the namespace.

An action writes only its own namespace. `store.set('search.query', ...)` from a `todos` action fails with `state key "search.query" belongs to namespace "search", and todos.add belongs to "todos". An action writes only its own namespace. If this change follows from todos.add, list one of the actions of "search" in calls and use call(...) (search.clear); if it does not, the state is in the wrong namespace: move it, or derive it`. Ownership is checked in production builds too, because it is how the scoped store resolves keys.

**Design rule: derive or move first.** Most cross-namespace writes are a sign that state sits in the wrong namespace, or that the second value is derivable from the first. Reach for `calls` for a real workflow: one user action whose consequence belongs to another concern ("add the todo, then clear the search box").

### state

`state` is a JSON-serializable object. Each key becomes one signal (named `namespace.key`), and a write replaces the whole key. Values are immutable, and frozen in dev mode.

Every value must survive `JSON.stringify` unchanged. A function, `undefined`, `NaN`, a `Date`, a `Map`, a `Set`, a class instance or a loop is refused at mount. The message gives the path and what to store instead, for example `state todos.rows[1].at: undefined is not JSON. Use null for "no value"`.

### shapes: what one item of a list looks like

State keys hold plain JSON, so by itself nothing says what is inside a list. An optional `shapes` entry does, by state key or derived name:

```js
todos: {
  state: { items: [] },
  shapes: { items: { fields: { id: 'number', title: 'string', done: 'boolean', meta: 'json' } } },
}
```

`fields` maps each field of one item to an argument type (`'string'`, `'number'`, `'boolean'`, `'json'`; `'json'` is any value). A shape gives three checks:

- **Statically**, `{item: 'field'}` bindings and handler arguments inside an `each` over that key are checked against `fields`: `unknown item field txet. Did you mean "text"? Fields of "todos.items": id, title, done`. A nested `each` over a field of the row has no shape and is not checked. `{item: '.'}` is always allowed.
- **On every write in development**, `store.set('items', ...)` must give a list whose items have exactly the declared fields with the declared types: `store.set("items"): item 1 is missing the field "done"`, `... has the unknown field "x"`, `... field "id" should be number, got string`. Production builds skip this, like the JSON check. A refused write changes nothing. Items that already passed are remembered by identity (writes keep unchanged items' references), so changing one item of a long list checks one item; this memory lives in `src/validate.js`, which production builds replace with a stub, so none of it ships.
- **On declared and incoming state**: the initial value of the key and any `initialState` for it must fit the shape, so server-sent state with a stale layout fails at mount.

A shape on a **derived** name gets the static check only (the value is not re-checked when it is computed). A shape that has only `validate` claims nothing about `{item}` bindings.

**`validate`: plugging in a runtime type checker.** A shape may also have `validate: (item) => string | null`, called for every item whose fields already fit, in the same places as the field check; a returned message becomes the error (`item 1: <message>`), `null` passes, and a throw is reported as `the shape's validate threw`. The framework never imports a validation library (rule: no dependencies); `validate` is the hook, the way `transform` is for the build. With zod:

```js
import { z } from 'zod';                                   // in your project, not in the framework
const Todo = z.object({ id: z.number(), title: z.string().max(80), done: z.boolean() });

shapes: {
  items: {
    fields: Object.fromEntries(Object.keys(Todo.shape).map((name) => [name, 'json'])),   // the names, for the static {item} checks
    validate: (item) => { const result = Todo.safeParse(item); return result.success ? null : result.error.issues[0].message; },
  },
},
```

Valibot, ArkType or a hand-written function work the same way. Notes: `validate` only judges and must be pure, synchronous and cheap (it runs in the write path in development, and an item that already passed is remembered, so a one-item change costs one call); state must stay JSON, so do not use a schema's transforms or coercions to change the value; and because production skips shape checks, validate real input at the network boundary. Deriving `fields` from the schema, as above, keeps the two from drifting; listing real types in `fields` instead gives the field-type check as well.

Mistakes in a declaration are reported at mount: a name that is not a state key or derived value of the namespace (with a suggestion), an unknown key (`fields`, `validate` only), an empty shape, a bad type, a `validate` that is not a function, and an initial value that does not fit.

### Per-row state (`rowState`)

Some state belongs to each row of a list: whether it is open, whether it is selected, the draft text of its note. A namespace declares it once, with the default of each field:

```js
details: {
  rowState: { open: false, note: '' },
  actions: {
    toggle: { args: { id: 'number' }, run: (store, { id }) => store.setRow(id, { open: !store.getRow(id).open }) },
    forget: { args: { id: 'number' }, run: (store, { id }) => store.clearRow(id) },
  },
}
```

```js
each('people.items', 'id', li({ classes: { open: rowState('details.open') }, on: { click: act('details.toggle', { id: item('id') }) } }, ...))
```

- It is state like any other: the namespace gets one state key, `details.rowState`, `{ [rowKey]: { field: value } }`, which holds **only the rows that differ from the defaults** (a row set back to the defaults is dropped). It is in `ui.state()`, the log, `replay`, `initialState` and the server's state script. The name `rowState` cannot be used for a state key of such a namespace.
- The row is addressed by its key, the `key` of the list's `each`, as a string (`7` and `'7'` are one row). `store.getRow(id)` returns all fields (defaults with what the row changed laid over them), `store.setRow(id, changes)` changes some fields, `store.clearRow(id)` forgets the row. They exist only in a namespace with `rowState`, they write only that namespace, and `store.set('rowState', ...)` is refused with the way to write it. An unknown field in `setRow` fails with "Did you mean".
- `rowState('namespace.field')` reads one field for the row of the innermost `each`, and only that binding re-runs when that row's value changes: changing row 3 does not write to the DOM of row 4. In a nested `each`, `rowState('order.namespace.field')` reads it for the outer row that said `as: 'order'` (the same name `row('order.id')` uses); the action that writes it passes that row's key, `act('details.toggle', { id: row('order.id') })`.
- **One list per namespace.** The map is keyed by row key alone, so a namespace's `rowState` belongs to one list. Reading it for the rows of two different lists is refused at mount (naming both places), because rows with the same key in both would share an entry. Give the second list a namespace of its own (a namespace can be mounted under several names). Two views of the same list may share it.
- **Reading all rows.** `store.getRow(id)` exists in actions only. In `derive`, `get('details.rowState')` is the sparse map: a row that is absent has the defaults, so a count of open rows is `Object.values(map).filter((row) => row.open).length` when the default is `false`, and needs the default written again when it is not.
- **Cost.** Each `rowState` binding keeps a small signal, so a write to the map re-runs one cheap check per binding: O(rows), like a derived list, though only the changed row writes to the DOM. Measured on the test DOM, one write costs about 0.1 ms with 1000 rows and 0.5 ms with 20000. It is valid in an `each` template, under `when` too, and checked at mount (no `each` around it, a namespace without `rowState`, a field that does not exist).
- **Who forgets.** A row's state stays when its item leaves the list, so it is there again if the item returns; the owner of the list forgets it. The action that removes the item lists `details.forget` in `calls` and calls it (recipe `row-state`).
- Use it for what every row has. A thing that exists once (which row is being edited) is an ordinary state key; so is anything the list's own data holds.

### Formatting values: `derive`, `Intl` and `memoizeItem`

The grammar has no formatting operators (no currency, no dates, no padding) and will not get any: formatting depends on the locale and on the data, and `Intl` already does it correctly. The one way to show a formatted value:

1. Keep the facts in state as numbers and ISO dates.
2. Derive a list of **display rows** from them, with the formatted text, in `derive`, using `Intl.NumberFormat` and `Intl.DateTimeFormat` created once at module level.
3. Wrap the per-item work in `memoizeItem`, so a change to one item formats one item and every other row keeps its reference (the `each` then touches nothing else).
4. Bind the text with `item('amountText')`.

```js
const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' });
const describeInvoice = memoizeItem((invoice) => ({ id: invoice.id, amountText: money.format(invoice.cents / 100) }));
// derive: { rows: (get) => get('items').map(describeInvoice) }      view: each('invoices.rows', 'id', li(null, item('amountText')))
```

`memoizeItem` caches by the item alone, so the formatter must depend on the item only: a locale or currency the visitor can switch is a derive over both inputs, without `memoizeItem`. Formatted text is display, not state: never store it. Recipe: `format-values` (`agent-ui explain format-values`).

### derive

`derive` is `{name: (get) => value}`. `get(key)` reads a state key or another derived value of the namespace (plain) or of another namespace (`'search.query'`), and tracks it. Declaration order does not matter. Functions must be pure and synchronous. This is a convention the framework does not check (it cannot see a `Date.now()` or a timer inside a function): a derived value that is not pure makes replay and server rendering differ from the browser, and the same holds for `Date.now()` and `Math.random()` in an action. What it does check is every other rule of the namespace: what a function reads exists, no cycles, and a throw names the derived value.

A derived value fails at mount, with its own name and what to do, when it reads a name that does not exist, depends on itself (`todos.a -> todos.b -> todos.a`), throws, or has the name of a state key of its namespace. Example: `derived "todos.label": get("cuont"): namespace "todos" has no state key or derived value "cuont". Did you mean "count"? It has: count, label`.

A recomputed value that is structurally equal to the previous one keeps the previous reference, so nothing downstream re-runs. Arrays and plain objects are compared two levels deep.

### actions

Actions are the only writers:

```js
actions: {
  add: {
    args: { title: 'string' },
    calls: ['search.clear'],   // optional: actions of OTHER namespaces this one may call
    run: (store, args, call) => { store.set('items', [...store.get('items'), { id: store.get('nextId'), title: args.title.trim() }]); call('search.clear', {}); },
  },
},
```

The action is called `todos.add` (the namespace and the key). A verb is declared once, in its namespace.

- `args` is required. It declares each argument and its type: `'string'`, `'number'`, `'boolean'`, or `'json'`. `'json'` accepts any JSON value, including `null`, objects and arrays; use it for data from the network or the router. `args: {}` means no arguments. Every declared argument must be present with that type. Extra arguments are ignored at runtime and rejected by the validator in handlers.
- In a handler, `on: { click: ['todos.add', { arg: ... }] }`, an argument is a literal, `{ event: 'target.value' }`, `{ state: 'todos.draft' }` or `{ item: 'field' }`. Operators such as `not` and `equals` are not evaluated there, and the validator says so. Compute the value in a derived value and pass `{ state: 'todos.name' }`, or decide inside the action. A toggle is an action that reads the current value: `store.set('open', !store.get('open'))`.
- `store.get(key)` reads the current value immediately, including writes made earlier in the same action. `store.set(key, value)` writes, and freezes the value in dev mode. Both refuse a key that does not exist, with a suggestion and the keys of the namespace. `store.set` also refuses derived names, other namespaces' keys, and in dev mode a value that is not JSON.
- On success the call is appended to `log` as `[name, args]`. A type error or a thrown exception is **not** logged. It is recorded in `errors` and `console.error`, and **every write of that action is undone** (and those of the actions it called), so a failed action never leaves half a change behind. Validating first is still good style, but it is no longer needed for correctness.
- Name the verb for what it does (`add`, `setDraft`, `toggle`); the namespace already says what it is about. Make actions idempotent where an event can repeat, such as a `focusout` after Enter.

### calls: changing another namespace

An action lists the actions of other namespaces it may run in `calls` and runs them with `call(name, args)`, its third argument:

```js
submit: { args: {}, calls: ['notes.add'], run: (store, args, call) => { call('notes.add', { text: store.get('draft').trim() }); store.set('draft', ''); } },
```

- The called action runs with its own scoped store: it writes its own namespace's keys, so the owner of the state keeps its invariants.
- It runs inside the caller: one flush (nothing renders between the writes), one log entry (the outer action; `replay` repeats the call), one undo scope. If the called action throws, the error propagates with both names (`todos.add: search.clear: boom`) and everything either of them wrote is undone, unless the caller catches the error, in which case only the called action's writes are undone.
- Only what `calls` lists can be called, with the arguments the called action declares; both are checked when `call` runs, and the names are checked at mount.
- It is checked at mount that every entry exists (with a suggestion), lives in another namespace (a call inside a namespace is a plain function), appears once, and that the called action itself declares no `calls`: **one level only**, so what an action can cause stays readable from the action. Call the final actions from the outer one.
- A resource's lifecycle action (`onSuccess`) may use `calls` like any other action (`checkout.succeeded` calls `cart.reload` in `examples/shop`).

### State management in one place

Flow is one way: state, then derive, then bindings, then one DOM property. Events return only through actions.

- One store per app, one signal per `namespace.key`; a write replaces the whole key.
- State is JSON-serializable and immutable.
- UI-only state (edit mode, drafts, filters) also lives in a namespace, addressed by id.
- Every successful action is logged. `replay`, regression tests and server-to-browser state transfer rely on the log.
- An action writes its own namespace; `calls` is the only way to cause a write in another, and the called action does the writing.

Limits: namespaces are one level (no nesting), no component-local state (per-row state is `rowState`), derived lists are recomputed in full, `{item}` is the innermost row (an outer one is read with `as` and `row`), no built-in undo or redo, and actions are synchronous (network and timers belong to plugins). Direction if the model must grow, not built: undo and redo on the action log. The full description is in the README; the working rules are in `docs/AGENT-RULES.md` under "State and actions".

### Timing

Updates flush in one microtask. After `dispatch`, `state()` and `derived()` are current immediately, and so is `store.get` of a derived value inside an action after earlier `store.set` calls of that action. `outline()` and the DOM are current after `await ui.settle()`. A derived value that throws is reported (`console.error`) without stopping the other updates; an action is only blamed for it when the action itself reads that value.

## 5. Update model and cost

- Each dynamic binding (text, attribute, property, class set) is one effect that writes only when the value changed. A state change re-runs only the effects that read it. Changing one list item re-runs only that row's bindings.
- There is no virtual tree and no diff. Cost is proportional to the affected bindings, plus O(n) work for derived lists and key matching when an `each` source changes.
- Measured with the shim DOM, using the benchmark in `examples/todomvc`. Shim timings compare runtime versions with each other; they are not browser numbers. Toggling one list item is 3 DOM mutations at every size. It costs about 0.5 ms at 1,000 items, 1.2 ms at 5,000 and 4.7 ms at 20,000, because derived values rescan the list. A keystroke elsewhere costs about 0. Adding 20,000 items one by one takes about 0.9 s, because `[...items, item]` copies the array each time; that is the cost of immutability in the action, not of the runtime.

## 6. Plugins

A plugin is `(api) => void`, run once after mount. A plugin that talks to the outside world must not act while `api.replaying` is true (see `resources`).

**The plugins the package ships.** Each is its own import, so a page downloads only the ones it lists. A page lists the `with...` form in `plugins` of page.js; an app made with `app()` lists the plugin itself. `agent-ui explain plugins` prints this table.

| Plugin (page form) | Import | List it when | Without it |
|---|---|---|---|
| `withResources` (`resources(fetch)` for `app()`) | `@ehtb/agent-ui/resources` | a namespace declares `resources` | the page fails at start: "declares resources, but no plugin loads them" |
| `({ win }) => windowEvents(win, { ... })` | `@ehtb/agent-ui/window-events` | an action answers an event of the window or the document (`resize`, `keydown.Control+k`, `online`) | nothing listens |
| `withHead` | `@ehtb/agent-ui/head` | the page's `head` is a function of the state and must follow it in the browser | the page fails at start in development: "head.title follows the state, but nothing keeps the browser's document current" |
| `withFollow` (`follow` for `app()`) | `@ehtb/agent-ui/follow` | the spec uses the `follow` prop (a dragged row under the pointer) | the app fails at mount: "the spec uses "follow", but no plugin handles it" |
| `withMoves` (`moves` for `app()`) | `@ehtb/agent-ui/moves` | rows with `transition` should slide to their new place when the list reorders | rows jump; development says so in the console once per list |
| `withNavigation` (in a shell's `plugins`) | `@ehtb/agent-ui/navigation` | the shell's pages link to each other with `soft: true` or `route.go` | soft links are normal page loads |

Two helpers are for writing a plugin, not plugins themselves: `mountElement` (`@ehtb/agent-ui/mount-element`) claims an element to draw into, and `syncApps` (`@ehtb/agent-ui/sync-apps`) connects two apps. The debug console is not listed either: `debug: true` loads it.

A page lists plugin factories, `plugins: [withResources]`, and each factory receives the environment, `(environment) => (api) => void`: `win`, `fetchFunction`, `dev`, `isServerRendering` and, for a shell's plugins, `shellName`.

**The server runs the plugins too.** While a page is rendered on the server (`agent-ui serve`, `agent-ui build`'s static pages, `agent-ui check`), `isServerRendering` is `true` and `win` is a stand-in that holds only `location`, `addEventListener`, `removeEventListener`, `setTimeout`, `clearTimeout` and the same two listener functions on `win.document`. In a browser `isServerRendering` is `false`; in a test that mounts a page with the shim it is not set (so false), and the plugin runs against the shim's window. A plugin with an effect of its own (a timer, a listener on the window, a request, a library that needs a real browser) starts with `if (isServerRendering) return;`. A plugin that reaches for anything else on the server's window fails the render with the original message and this advice. A plugin whose library needs a real canvas or layout, which the shim has not either (Chart.js), also checks `win === window`, as `examples/loading-states` does. Recipe: `browser-only-plugin` (`agent-ui explain browser-only-plugin`).

There is no storage plugin and no client-side router. Durable data and state live on the server and are loaded with `resources`, so every device and tab sees the same thing and a page can be rendered with it; a link is a page load (GUIDE.md, section 1), which a link marked `soft` makes faster without changing what it means ("Shell and soft navigation" in section 13). The URL patterns that pages and API tables share are in section 13.

### resources (`src/resources.js`)

Network requests described as data. Their lifecycle goes through logged actions.

A resource belongs to the namespace that declares it, next to its `state` and `actions`:

```js
namespaces: { items: {
  state: { query: '', list: [], status: 'idle', error: '' },
  actions: { loading, loaded, failed },                 // the lifecycle actions, of this namespace
  resources: [{
    watch: ['query', 'filters.category'],             // keys the request depends on; own keys plain, other namespaces' keys as namespace.key; runs at mount and on change
    owns: ['list', 'status', 'error'],                // optional: keys of this namespace only the lifecycle actions may write
    request: (values) => ({ url, method?, headers?, body? }) || null,   // values.query, values['filters.category']; null: nothing to load (cancels in flight)
    onStart: 'loading',                               // an action of this namespace, args: {}
    onSuccess: 'loaded',                              // args: { data: 'json' }
    onError: 'failed',                                // args: { message: 'string' }  ("HTTP 404", "network down", ...)
    onCancel: 'cancelled',                            // optional, args: {}; runs when `request` returns null while a request is in flight
    onIdle: 'idle',                                   // optional, args: {}; runs when `request` returns null after a request started or settled
    response: (data) => {},                           // optional check of the answer, written with the library you like (zod: Items.parse); it throws when the data does not fit
    delayMs: 250,                                     // optional debounce, for search-as-you-type
    revalidate: 'never',                              // optional: the server already ran this resource and its state is in the document; do not run it again on mount (requires owns)
  }],
} }
// plugins: [resources(fetchFunction, { win, serverRendered })]   // one plugin runs the resources of every namespace; win only needs setTimeout/clearTimeout (default globalThis)
```

`withResources` (the page-level form: `plugins: [withResources]`) passes `serverRendered` from the environment, so the browser knows whether the document already carries the server's resource output. `resources(...)` takes the same option when used directly.

- Only the **latest** request counts. An older response that arrives later is ignored.
- With `delayMs`, a request already in flight is not aborted when a new change starts waiting out the delay; it is aborted (and ignored) when the delayed request actually starts, or at once if `request` returns `null`. So an older response can still land during the delay.
- Every request is called with `signal` (an `AbortSignal`) in its options. It is aborted when a newer request replaces it or when `request` returns `null`, so the network work stops too. The aborted request is never reported: no `onError`. A `fetchFunction` that ignores `signal` still works, the response is just ignored.
- To cancel because of a user interaction elsewhere, dispatch an action that sets a state key listed in `watch`, and have `request` return `null` while it is set. `onCancel` runs only if a request was actually in flight (not when it had already settled or was still waiting out `delayMs`), so use it to reset the status: `cancelled: { args: {}, run: (store) => store.set('status', 'idle') }`.
- `onIdle` runs when `request` returns `null` after a request has started or settled (also when a request is in flight, after `onCancel` if that is given), never on an initial `null` at mount. Use it in chained resources so a step clears its own state when the step before it becomes `null`.
- `owns` lists the state keys of the namespace that hold this resource's output (`['list', 'status', 'error']`). In development mode, `store.set` from any action other than this resource's `onStart`, `onSuccess`, `onError`, `onCancel` or `onIdle` fails naming both the action and the resource. (Other namespaces cannot write them anyway.)
- `response` is a function that checks the JSON a request answers, with whichever library you use (`response: Items.parse` for a zod schema; the framework imports none). It runs on every successful answer, in development and in production, so a library you pass ships to the browser; leave it out of a production build if you do not want that. It throws when the data does not fit: `onError` then runs with `the response from <url> does not fit: <message>` and `onSuccess` does not. Its return value is ignored.
- `revalidate: 'never'` trusts state that a server render embedded: the first `watch` call in a browser whose document carries an `agent-ui-state` script does not run `request`, `onStart` or `onIdle`, so a page that was rendered with its data does not load it a second time on mount. A later change to a watched key still loads. It requires `owns`, because the keys the server wrote must be the ones this resource owns; without `owns` the definition is refused. The declaration applies to the **browser**; the render itself still runs the resource, and a page without a state script (for example in a test) loads as usual. It is not a cache: use it only when the server's state is complete and fresh enough for the first paint, and change a watched key to refresh.
- The definition is checked when the plugin is installed: the allowed keys are `watch`, `request`, `onStart`, `onSuccess`, `onError`, `onCancel`, `onIdle`, `owns`, `response`, `delayMs` and `revalidate`; the first five are required; every `watch` key must be a state key or derived value (own keys written plain, other namespaces' with their namespace); every `owns` key must be a plain state key of the namespace, not in `watch` and not owned by another resource; the lifecycle actions are written as verbs of the same namespace, must exist and declare the arguments above. Each mistake names the namespace and the resource and says what to write. A namespace that declares `resources` while no `resources(...)` plugin is installed fails at mount.
- An object `body` is sent as JSON with a content-type header.
- A failed response with a JSON body `{ "message": "..." }` reaches `onError` as that message; any other failure arrives as `HTTP <status>`.
- Responses live in the action log, so `replay()` reproduces the state without a network call. Resources stay quiet while `api.replaying`.
- In tests, pass a fake `fetchFunction` (`createFakeFetch`, section 10).

### windowEvents (`src/window-events.js`)

`windowEvents(target, { 'resize': [action, args?, options?], 'keydown.Control+k': [...], offline: [...] })` maps events on `window` or `document` to actions (qualified names: `'viewport.set'`).

- The handler format is the same as `on`, with one difference: arguments are literals or `{event: path}` only, for example `{ width: { event: 'target.innerWidth' } }`.
- The event is one of the events of `on` or `resize`, `scroll`, `online`, `offline`, `visibilitychange`, `hashchange`, `popstate`, `focus`, `blur`, `pagehide`, `pageshow`, `beforeunload` (`WINDOW_EVENTS` in `src/grammar.js`); a key chord (`keydown.Control+k`) only on `keydown` and `keyup`, modifiers in the order Control, Alt, Shift, Meta.
- Argument names must match the action's declaration exactly. All of it is checked when the plugin is installed (`src/window-events-checks.js`, left out of production builds): one line per problem, with a "Did you mean" for event and action names.

### syncApps (`src/sync-apps.js`): two separate apps on one page

The shell's `reads` are built on it, and a page the host owns with two agent-ui apps in it uses it directly (`examples/islands`).

**Purpose, and only this:** keep two *independent apps* that share one page informed about each other, one way. The typical case is a widget app (a header with a cart count) next to the page app; a shell (section 13) uses it for what it reads from its page. It has nothing to do with the `<a>` element. It is **not** for sharing state inside one app (use `derive` to read another namespace and `calls` to cause a change in one), **not** for adding namespaces or routes at runtime, and **not** two-way.

```js
import { syncApps } from '@ehtb/agent-ui/sync-apps';

const stop = syncApps({
  from: cartApp,                    // the value app() returned for the app that owns the data
  to: badgeApp,                     // the app that wants to know
  watch: ['cart.count'],            // qualified state or derived keys of `from`
  action: 'badge.set',              // a qualified action of `to`
  args: { count: 'cart.count' },    // each argument of the action -> the watched key that supplies it
});
```

- The receiving app changes only through its own action, so it logs the change and its own `replay` works; the sending app is only read. The first values are sent at once, then after every change; the same values are never sent twice in a row.
- Both ends are checked when the sync is made, with the usual messages: unknown option (with a suggestion), `from`/`to` not apps or the same app, unknown watch key, unknown action, and `args` that do not match the action's declared arguments exactly. A value of the wrong type is an error naming the sync.
- Nothing is sent while either app is replaying. `syncApps` returns a disposer.
- For both directions, make each app own different keys and sync twice. Syncing the same keys both ways can loop for object values.
- `window.__ui` points to the app that mounted last (the page app, when a shell is involved); `window.__shell` is the shell's app.

### Writing your own plugin

Timers, sockets, clipboard, anything external: watch state, dispatch actions, stay quiet while replaying.

```js
export const every = (win, { milliseconds, action }) => (api) => {
  win.setInterval(() => { if (!api.replaying) api.dispatch(action); }, milliseconds);
};
```

What a plugin may use: `api.watch` and `api.dispatch` (state out, events in), `api.replaying` and `api.onReplay`, `api.onDestroy`, `api.onError` and `api.report`, `api.onAction`, `api.observeElements` (what `mountElement` is built on), and the two hooks the motion plugins are built on: `api.onReorder(handler)` (called before every reorder of a list with the row elements that stay; the function it returns runs after the rows are placed) and `api.handleProperty(name, handler)` (the plugin that writes a prop the grammar leaves to a plugin; today only `follow`). `src/follow.js` and `src/moves.js` are short plugins to read as models.

### Plugins that draw into an element (`src/mount-element.js`)

A chart, an editor or a map owns its DOM. The spec has an **empty element with an explicit id**; a plugin claims it with `mountElement(api, id, mount)` from `@ehtb/agent-ui/mount-element`:

```js
import { mountElement } from '@ehtb/agent-ui/mount-element';

export const withChart = () => (api) =>
  mountElement(api, 'revenue-chart', (element, { key }) => {
    const chart = drawChart(element, api.get('sales.series'));
    const stop = api.watch(['sales.series'], (values) => chart.update(values['sales.series']));
    element.addEventListener('click', onClick);                 // in onClick: if (!api.replaying) api.dispatch('sales.select', { index })
    return () => { stop(); element.removeEventListener('click', onClick); chart.destroy(); };
  });
```

- `mount(element, { id, key })` is called once the element is in the page, for **every** element with that id (one per row of an `each`, `key` being the row's key; a new one each time a `when` brings the branch back). What it returns is called when that element is taken out of the page, and when the app is destroyed. `mountElement` returns a function that gives the id back.
- The element belongs to the plugin from then on: it writes into it and attaches its own listeners. State goes out through `api.watch`, and what happens in the element goes back as `api.dispatch(...)`, a logged action, quiet while `api.replaying` like every plugin. The plugin never writes state itself, and the spec never holds logic for it.
- Mistakes are refused when the plugin starts, with the fix: an id no element has (with "Did you mean"), an element that has children in the spec (the plugin would write into what the spec renders), an id already claimed (an element has one owner), and a `mount` that is not a function. A `mount` or a cleanup that throws is reported in `errors` and the page goes on.
- The module is only in the bundles of pages whose plugins import it. The runtime offers two small members for it, `api.spec()` and `api.observeElements({ added, removed })`; a plugin that needs more than `mountElement` can use them. On the server the same plugin runs against the server DOM, where nothing can be drawn: a plugin whose library needs a real browser returns early when `isServerRendering` is true (section 6).
- Recipe: `draw-into-element` (`agent-ui explain draw-into-element`). A page lists the plugin as `plugins: [withChart]`.

## 7. Agent API (returned by `app()`; `window.__ui` in browsers)

| Member | Meaning |
|---|---|
| `dispatch(name, args)` | Runs an action. Returns `undefined` on success or an error string. |
| `settle()` | Resolves after all scheduled updates. Await it before asserting on the DOM. |
| `state()` / `derived()` | JSON snapshots, nested by namespace: `{ namespace: { key: value } }`. Frozen in dev mode, so copy before editing. |
| `actions()` | `{ 'namespace.verb': argumentTypes }`: the callable surface. |
| `keys()` / `get(key)` | Every qualified state key and derived name (`['todos.items', 'todos.visible']`), and the current value of one of them. |
| `namespaces()` | What `app()` was given, for plugins that read their part of the declarations (`resources`). |
| `claim(feature)` | A plugin says it read a part of the declarations (`resources` calls `claim('resources')`), so a declaration nobody reads is reported at mount. |
| `tree()` | The **interactive** elements as JSON: `{ id, key, tag, label, value?, checked?, href?, on: {event: actionName | [actionName, ...]} }`. `value` is shown for input, select and textarea; checkboxes and radios show `checked` (a boolean) instead, as `outline()` does. Links are included with `href`. |
| `outline()` | The **rendered** UI as an array of root nodes, nested JSON: `{ id, key?, tag, text?, classes?, value? \| checked?, children? }`. `text` is the element's own text nodes. Use it to assert on non-interactive output (messages, classes, what is visible) without a browser or screenshots. |
| `log` | Successful actions in order. |
| `errors` | Runtime error strings. Tests should assert it stays empty. |
| `replay(actionLog?)` | Resets state to the initial state of `app()` (the declared state with `initialState` laid over it), re-dispatches the log one action at a time, and returns the final snapshot. `replaying` is true meanwhile. |
| `replaying` | Boolean getter. Plugins with external effects must check it. |
| `destroy()` / `destroyed` | Stops the app: its effects (derived values, bindings, every `watch`), its event listeners and the cleanups plugins registered, then empties its root. Later `dispatch` calls do nothing, so a response that arrives late changes nothing. Idempotent. A page that a soft link replaces is destroyed first. |
| `onDestroy(cleanup)` | A plugin that holds something outside the app (a timer, a request in flight, a window listener) registers how to let go of it; `destroy()` calls the cleanups, the last registered first. `resources` aborts its request and drops its timer, `windowEvents` removes its listeners. |
| `onReplay(handler)` | Calls `handler()` when `replay()` starts. A plugin with a request or a timer in flight drops it there, so its answer cannot land on top of the replayed state (`resources` does). |
| `onAction(handler)` | Calls `handler({ name, args, replaying })` after every action that succeeded and was logged. Returns a function that removes it. The debug console (`debug: true`) uses it; so can a plugin that wants to see actions as they happen. |
| `onError(handler)` | Calls `handler({ code, details, message, error, action, app })` for every error the runtime catches and does not throw again (a failed dispatch, a blocked URL, an update that threw, a duplicate key). Returns a function that removes it. What went wrong while the app was starting is delivered once every plugin is installed. A handler that throws is written to the console and never reaches the app. This is where a monitoring tool plugs in (`docs/GUIDE.md`, "Reporting errors"). |
| `report(error)` | A plugin hands over an error it caught and will not throw again: it is added to `errors`, written to the console and shown to the `onError` handlers. An error whose `code` has the form `AUI` and four digits keeps it and its `details`; any other error, whatever else it carries (`ENOENT`, a library's code, its own `details`), gets the code `AUI0304` and `{ message }`. |
| `spec()` / `observeElements({ added, removed })` | The spec the app renders, and a way to be told about the elements that arrive in the page and leave it. `mountElement` (section 6) is built on them. |
| `watch(keys, callback, { owns }?)` | Calls `callback({ 'namespace.key': value, ... })` now and after every change to any listed qualified state or derived key, batched. Returns a disposer. `owns` is `{ where, keys, allowedActions, message(key) }`: in development mode `store.set` of one of `keys` fails with `message(key)` unless it runs inside one of `allowedActions`; a key already claimed by another `watch` fails at once, naming both sides. `resources` uses it. |

**What replay reproduces.** `replay(log)` repeats the logged actions, including the answers `resources` wrote, so state is deterministic and a bug in an action can be kept as a test. It does not replay plugin side effects or DOM work that is not in the log (an editor's document, a chart, where the pointer is); test those in a browser. Plugins check `api.replaying` so their effects do not fire during a replay.

**The debug console.** Make the app with `debug: true` (`app({ ..., debug: true })`; for a page, `debug: true` in the `page` of page.js; for a shell, in `defineShell`) and the browser's console shows the app: the state as a table at the start, then one collapsed group per action (`▸ todos.add {"text":"milk"} 2 changed`) with its arguments and every state key and derived value it changed, as `before → after` for plain values and an expandable `{ before, after }` for lists and objects. A replay is not written action by action, and a failed action is the runtime's `console.error`. The console does the rest: `__ui.state()`, `console.table(__ui.log)`, `__ui.dispatch(name, args)`, `__ui.replay(__ui.log)`, and the console's own filter by level. A server never shows the console, even with `debug: true`: it renders with the flag off, and the console is for the browser's. The flag is a boolean, `false` unless set; nothing is read from the browser to decide it. It works in a production build too: the console's code is a chunk of its own that every build contains and only an app made with `debug: true` fetches. `mountDevtools(ui)` from `@ehtb/agent-ui/devtools` does the same for an app you already have.

## 8. Spec tools (`src/spec-tools.js`)

For agents that generate or edit specs programmatically: atomic edits addressed by explicit element `id`.

```js
import { patchSpec, listIds } from '@ehtb/agent-ui/spec-tools';
const result = patchSpec(spec, [
  { op: 'set', id: 'title', changes: { children: 'New title', props: null } },   // null deletes a key
  { op: 'insert', parentId: 'list', index: 0, node: { tag: 'li', id: 'new', children: 'first' } },
  { op: 'remove', id: 'old-banner' },
  { op: 'move', id: 'footer', parentId: 'page', index: 1 },
], { namespaces });          // context optional: when given, the result is validated
// -> { ok: true, spec } | { ok: false, problems: [...] }   (nothing is applied unless everything is valid)
```

Each operation has exactly its own keys (`set`: `op`, `id`, `changes`; `insert`: `op`, `parentId`, `index?`, `node`; `remove`: `op`, `id`; `move`: `op`, `id`, `parentId`, `index?`), and `changes` of a `set` may name only the fields of an element other than its tag (`props`, `children`, `id`, `classes`, `on`, `transition`). A missing key, an unknown key or operation, or a wrong kind of value is a problem (with a "Did you mean"), whether or not a context is given; nothing is ignored. `listIds(spec)` returns `[{ id, tag }]` in document order. The input spec is never modified. `insert` and `move` target an element's `children`. `each` templates and the root cannot be removed or moved.

## 9. Validator and error catalogue

The validator lives in `src/validate.js` and is imported by `src/ui.js`. Production builds replace it with a stub (see `BUILD.md`), so these checks run in development builds, in `agent-ui dev` and in tests. A production page does not report them.

`validate(spec, { namespaces, initialState? })` returns `["<specPath>: <problem>", ...]`, and `app()` throws an `Error` whose message has one problem per line (`app: the spec has 2 problems:`, then the lines) and whose `problems` property is the same list. `$` is the spec root. Everything below fails at mount, with a path, instead of rendering nothing. Where a near miss exists, the message ends with `Did you mean "..."?`.

### Spec structure

| Message | Fix |
|---|---|
| `unknown key X (allowed: ...)` | Typo or wrong node kind. The allowed keys are listed, and a near miss is suggested. |
| `bad node (expected tag, each, when or a binding, ...)` | Nodes are strings, bindings, elements, `each` or `when` objects. |
| `bad tag X` | Use an allowed tag (`grammar.tags`), or extend `ALLOWED_TAGS` with a test. |
| `unknown state X` | The binding is `namespace.key` plus an optional path. Add the key to the namespace's `state` or `derive`, or fix the typo. The message says whether the namespace or the key is the unknown one, suggests the nearest and lists what exists; a binding without a namespace (`state('draft')`) suggests the qualified name. |
| `item binding outside each`, `item needs a field name` | `{item}` only works inside an `each` template. |
| `a binding has exactly one key (...)` | A binding object has one operator key. |
| `<operator> needs [x, y]`, `... needs a list of at least 2 operands`, `... needs a list of operands` | Wrong operand count. |
| `operand must be a binding or a literal` | Operands cannot be arbitrary objects. |
| `needs a binding` | `when`, a non-string `each`, and `classes` values must be bindings. |
| `when needs children or otherwise` | Give the `when` something to show. |
| `each needs key`, `each template must be one element` | Add `key`; make `template` one element object. |
| `transition must be a positive number of milliseconds` | Use a number greater than 0. |
| `duplicate id X`, `id must be a non-empty string` | Explicit ids are unique strings. |

### Props and accessibility

| Message | Fix |
|---|---|
| `props.className: use "class"`, `props.htmlFor: use "for"`, `events go in the "on" key, not props` | Names from other conventions. Use the names in section 3. |
| `props.X: unknown attribute "classs". Did you mean "class"?` | A prop is an attribute of HTML (`grammar.attributes` / `ATTRIBUTES` in `src/grammar.js`), `data-*` or `aria-*`, or one of the three of agent-ui: `follow`, `soft`, `focus`. Fix the typo; an attribute that is real HTML and missing from the list is added to the list (with the grammar test), not worked around. |
| `props.style: must be a literal or a binding (build a style string with join)` | Build the style string with `join`. |
| `must be a literal or a binding` | Prop values are literals or bindings, never objects. |
| `unsafe URL` | A literal `javascript:` or `vbscript:` URL, or `data:` outside the `src` of an `img` (a head `<script src>` counts as an `href`). |
| `input\|select\|textarea\|progress needs aria-label` | Add `aria-label`. Not needed for `type: 'hidden'`. |
| `button\|a needs text or aria-label` | Give it children or a label. |
| `img needs alt (use "" for decorative images)` | Add `alt`. |
| `svg needs aria-label with role: 'img' ... or 'aria-hidden': 'true' ...`, `svg has aria-label but not role: 'img'` | Say what the drawing shows (`role: 'img'` and `aria-label` together), or hide a decorative icon next to text that says it. |
| `path is drawn inside an svg`, `an svg holds only g, path, ...`, `an svg holds no text` | SVG shapes stand inside an `svg`, and an `svg` holds only SVG tags. |
| `props.fill: fill is an attribute of an svg drawing, and this is a div` | Put the attribute on the `svg` or a shape, or style the element with CSS. |
| `img\|input\|hr\|br\|path\|... cannot have children` | Void elements, the SVG shapes among them. |

### Components

| Message | Fix |
|---|---|
| `component X needs param P`, `component X has no param P` | Give every required param and only declared ones; the message suggests the nearest name. |
| `param P is "v", which is not one of its options` | A variant key that does not exist. Use one of the listed options. |
| `param P must be a literal option` | A variant cannot be a binding. Use a `when` with one `use` per variant. |
| `components.X.params.P: unknown key ...`, `cannot have both default and optional`, `default ... is not one of the options` | Mistakes in a param declaration. Allowed keys: `default`, `options`, `optional`, `type`. |
| `param P must be a string or a binding, got 3`, `must be a handler`, `unknown type ...` | A literal that does not fit the param's declared `type`, or a type that does not exist. |
| `div(...): "className" is another convention. Write class`, `child 1 is the number 3`, `unknown event "clik"`, `equals(...): it takes exactly 2 operands` | A builder was called wrongly (section 3, "Builders"). The message starts with the builder, the stack trace points at your line. |

### Handlers

| Message | Fix |
|---|---|
| `unknown action X. ... Actions are written namespace.verb: ...` | Define it in the `actions` of its namespace or fix the name; a near miss is suggested. |
| `missing argument A for X`, `unknown argument A for X (declared: ...)` | Handler args must match the action's `args` exactly. |
| `X expects T, got a literal U` | A literal argument has the wrong type. |
| `event needs a path string` | Write `{event: "target.value"}`. |
| `bad event X`, `only keydown and keyup accept a key` | Use the event list in section 3. |
| `modifiers must be unique and in the order Control+Alt+Shift+Meta` | Fix the chord order. |
| `handler must be [actionName, args?, options?] or a list of those`, `a list of one handler is the handler itself` | Handler shape. A list has at least two handlers; its entries are checked one by one (`on.click[1]: ...`). |

### Namespaces, actions, derive and state

| Message | Fix |
|---|---|
| `namespace: "todo-list" is not allowed. A namespace name is the first half of every state key and action name ...` | Namespace names, state keys, derived names and action verbs are letters and digits starting with a lowercase letter; the message writes the fixed name (`todoList`). |
| `namespace "todos": unknown key "action". Did you mean "actions"? Allowed keys: state, derive, actions, resources, shapes` | A namespace has exactly these keys. |
| `unknown item field x. Did you mean ...? Fields of "todos.items": ...` | A `{item}` binding over a list with a shape names a field the shape does not have. |
| `... shapes.items: needs fields, validate or both`, `shapes.items.fields.id: bad type ...`, `shapes.items.validate: must be a function ...`, `shapes.itmes: "itmes" is not a state key or derived value ...` | Fix the shape declaration (section 4, "shapes"). |
| `state todos.items: item 0 is missing the field "x"`, `... has the unknown field ...`, `... field "id" should be number, got string` | The declared or incoming value does not fit its shape. The same messages, prefixed `store.set("items")`, report a refused write in development. |
| `action todos.x: run must be a function` | `run` is the function that writes state. |
| `action todos.x: args is required and must be an object. Write args: {} ...` | Declare `args`, even when empty. |
| `action todos.x.arg: bad type T` | Types are `'string'`, `'number'`, `'boolean'`, `'json'`. |
| `action todos.x: unknown key "..."` | An action has `args`, `run` and `calls`. |
| `action todos.add: calls[0] "search.clr" is not an action. Did you mean "search.clear"?` | `calls` lists existing qualified actions. |
| `... is in the same namespace "todos". calls is for actions of other namespaces` | Share code inside a namespace with a plain function. |
| `... itself declares calls. A called action cannot call further actions (one level only)` | Call the final actions from the outer action. |
| `... is listed twice` | Remove the duplicate. |
| `derive todos.x: must be a function (get) => value` | A derived value is `(get) => value`. |
| `derive todos.x: has the same name as a state key of "todos", and a derived value would silently replace it. Rename one of them` | Rename the state key or the derived value. |
| `state todos.x: <what> is not JSON. <what to store>` | Store plain data: a `Date` as `toISOString()`, a `Map` as an array of pairs, `null` instead of `undefined`. |
| `initialState: unknown namespace "x". Did you mean ...?`, `initialState.todos.x: "todos" has no state key "x". ...` | `initialState` has the shape of `ui.state()` and names only declared namespaces and keys. |
| `namespace "todos": declares resources, but no plugin loads them. Add the resources plugin ...` | Install `resources(fetchFunction)` from `@ehtb/agent-ui/resources`. |

### Raised at mount by the runtime

These come from `src/ui.js`, not from the validator, and also stop the mount:

| Message | Fix |
|---|---|
| `derived "todos.x": get("y"): namespace "todos" has no state key or derived value "y". Did you mean ...? It has: ...`, `... there is no namespace "serch". Did you mean ...?` | Fix the name the derived value reads. |
| `derived "todos.x": get("todos.y"): "todos.y" is in this namespace ("todos"). Write "y" without the namespace` | A namespace writes its own keys plain; only other namespaces are written with the prefix. |
| `derived "todos.x": a derived value cannot depend on itself: todos.a -> todos.b -> todos.a. Break the loop ...` | Compute one of them from state instead. |
| `derived "todos.x": <exception message>` | The derived function threw. |

### Error codes

Every error the runtime reports or throws has a code, `AUI` and four digits, and small plain `details`; the sentence below is what the development build says. A production build has no sentences: the message is the code and the details, `AUI0202 {"action":"todos.add"}`, and `error.code` and `error.details` hold the same. `decodeError` (import it from `@ehtb/agent-ui/error-messages`, in a script or a monitoring tool's server side, not in the page) turns either form back into the sentence, and `agent-ui explain 'AUI0202 {"action":"todos.add"}'` does the same on the command line. A decoder that has only the details leaves out what only the development build knew (the names that exist, for a "did you mean"). An error that wraps another one (`AUI0201`, `AUI0108`, `AUI0109` carry the inner error as `cause`) is decoded together with it.

| Code | Meaning | Details |
|---|---|---|
| `AUI0101` | A key given to `store.get` or `store.set` is not a string. | `operation`, `key` |
| `AUI0102` | A key of the action's own namespace was written with the namespace. | `operation`, `key`, `namespace` |
| `AUI0103` | A state key or derived value that does not exist was read or written. | `operation`, `key`, `fromNamespace` |
| `AUI0104` | An action wrote the state of another namespace. | `operation`, `key`, `namespace`, `action`, `actionNamespace` |
| `AUI0105` | A derived value was written. | `operation`, `key` |
| `AUI0106` | `call()` named an action that the calling action does not list in `calls`. | `name`, `caller`, `calls` |
| `AUI0107` | Derived values depend on each other in a loop. | `chain` |
| `AUI0108` | A derived value threw while it was computed. | `name`, `cause` |
| `AUI0109` | `call()` passed arguments that do not match the called action. | `name`, `cause` |
| `AUI0201` | An action threw; everything it wrote was undone. | `action`, `cause` |
| `AUI0202` | `dispatch` or a handler named an action that does not exist. | `action` |
| `AUI0203` | An action was called with an argument of the wrong type. | `action`, `argument`, `expected`, `got` |
| `AUI0204` | An argument of a handler could not be read when the event happened. | `action`, `argument`, `cause` |
| `AUI0301` | An unsafe URL was blocked. | `prop` |
| `AUI0302` | An item of an `each` has no usable key. | `key`, `path` |
| `AUI0303` | Two items of an `each` have the same key; the later one is not shown. | `value`, `path`, `key`, `source` (the state or derived key the list reads, when it reads one), `first` and `second` (the positions of the two items) |
| `AUI0304` | An update of the page threw, or a plugin reported an error that has no `AUI` code. | `message` |
| `AUI0401` | A `mountElement` plugin threw in its mount or its cleanup. | `where`, `id`, `phase`, `cause` |
| `AUI0501` | The page's `ready(state)` did not return true or false. | `path`, `answer` |
| `AUI0502` | A value of the page's head is not a string, a number or a boolean. | `where`, `name`, `value` |
| `AUI0503` | A URL in the page's head is unsafe. | `where`, `name`, `value` |

Errors that exist only to be fixed while writing the page (the validator, the builders, the `*-checks` modules, the install-time checks of a plugin) have no code: they are not in a production build, or they happen when the page starts, with their full text.

### Recorded in `errors` at runtime

The sentences below are the development build's; the code of each is in the table above.

| Message | Meaning |
|---|---|
| `unknown action X. Did you mean ...? Actions are written namespace.verb: ...` | `dispatch` was called with a name that is not an action. |
| `todos.add.arg: want T, got U` | An argument had the wrong type. The action did not run. |
| `todos.add: <exception message>` | The action threw; all its writes were undone. This includes a frozen-state mutation ("object is not extensible"). A failure in a called action reads `todos.add: search.clear: <message>`. |
| `X: store.get("k"): namespace "todos" has no state key or derived value "k". Did you mean ...?` | The action read a key that does not exist. |
| `X: store.set("k"): namespace "todos" has no state key or derived value "k". ...`, `X: store.set("k"): "k" is a derived value and cannot be written. Write the state it is computed from` | Only state keys can be written. |
| `X: store.set("search.query"): state key "search.query" belongs to namespace "search", and X belongs to "todos". An action writes only its own namespace. ...` | Use `calls`, move the state, or derive it (section 4). |
| `X: call("search.clear"): X does not list it in calls. Add it: calls: [...]`, `call("a.b"): a.b.arg: want T, got U` | `call` runs only listed actions, with their declared arguments. |
| `X: store.set("k"): <what> is not JSON. <what to store>` | Dev mode only: the action wrote a value that JSON cannot hold. |
| `duplicate key K in <path> (list "source", items 0 and 2)`, `item without usable key "k" in <path>` | The data of the list (`source`) has two items with the same key, or an item without one. Fix the state or the `derive` that builds it. |
| `blocked unsafe URL in href` | A bound URL was unsafe. The attribute was removed. |

## 10. Testing

Everything is testable headless, in Node, with no dependencies. In the framework repository, `npm test` runs it all and `npm run test:framework` runs the framework tests alone. The test helpers are part of the package.

`@ehtb/agent-ui/testing/dom-shim.mjs` is a minimal DOM that counts mutations. Sibling operations are O(1), as in a real DOM.

| Export | Use |
|---|---|
| `createRoot()` | The mount element for `app()` or `create()`. |
| `createWindow(path?, search?)` | Window stub for a page at `path`: `location.pathname` and `location.search`, `fireWindowEvent(type, props)` for `resize`, `online`, `keydown` and so on, `setTimeout` and `clearTimeout`. |
| `fireEvent(element, type, props)` | A bubbling event from an element: `fireEvent(input, 'keydown', { key: 'Enter' })`. Set `input.value` or `checkbox.checked` first, then fire `input` or `change`. Pass `preventDefault: () => ...` to observe it. |
| `findElements(root, predicate)`, `findByClass(root, name)`, `findByTag(root, tag)` | Query rendered elements. Elements expose `attributes`, `classNames`, `childNodes` and `textContent`. |
| `mutations.count` | Reset to 0, act, then read it to assert update cost. |
| `ShimElement.focusedElement` | The last element that received `focus()`. |

`@ehtb/agent-ui/testing/helpers.mjs`:

| Export | Use |
|---|---|
| `mountSpec({ namespaces, initialState?, spec, plugins })` | Mounts a throwaway app. |
| `flushAsync(ui)` | Waits for promises, 0 ms timers and UI updates. |
| `createFakeFetch(respond)` | A fetch whose `calls` you can inspect. `respond(url, options)` may return data, `{ ok: false, status }`, an `Error`, or a promise. |
| `deferred()` | A promise you resolve by hand, for races. |
| `outlineById(ui.outline(), id)` | Finds a node of the outline. |
| `waitFor(condition, { timeout?, interval? }?)` | Polls until `condition()` is true and fails, naming the condition, after `timeout` ms (default 3000). Use it instead of a fixed `sleep` to wait for something a timer does, such as a transition ending: a sleep is a guess that a busy machine makes wrong. |
| `assertNoErrors(ui)` | Fails with the messages of `ui.errors` when the app reported any (a duplicate list key, an action that threw). Call it after `await ui.settle()` and after the step that opens a branch. |
| `assertRepeatable(ui, actionName, args?)` | Dispatches an action (`'todos.add'`), settles, dispatches it again with the same args and asserts no state key (`todos.items`) changed. Use it on idempotent user actions (selection, filters, form lookup). |
| `measureAction(ui, actionName, args?)` | Dispatches an action, settles, and returns what it cost, counted rather than timed (the same on every machine): `domWrites` (DOM writes a browser would perform, counted by the test DOM, so mount on it), `effectRuns` (bindings, derived values and watches that ran: a binding runs for every row whose item got a new reference, even when it then writes nothing), `stateChanged` and `derivedChanged` (the keys whose value was replaced), `elements` and `elementsBefore` (what `ui.outline()` shows). |
| `assertCost(ui, actionName, args, limits)` | `measureAction`, then fails when a count is over its limit (`{ domWrites?, effectRuns?, stateChanged?, derivedChanged?, elements? }`), with what it measured and where that cost usually comes from. Put it on the action that changes one row of a long list: `assertCost(ui, 'todos.toggle', { id: 3 }, { effectRuns: 10 })` fails when every row runs again. `countEffectRuns()` (from `@ehtb/agent-ui`) is the counter it reads. |

Things to know when writing tests:

- Shim elements expose `localName`, not `tag`, plus `textContent` and `attributes`.
- `fireEvent` on a missing element is a bug in the test. Check the lookup result first.
- For per-row computed text such as "2 cards", precompute it in `derive`. Rows cannot compute.
- To re-run a resource with the same inputs, change a watched key: a retry action flips a watched flag (`ordersCancelled` in `examples/orders`).
- Prefer asserting on `ui.state()`, `ui.derived()`, `ui.outline()`, `ui.tree()` and `ui.errors` over DOM details.
- Reproduce bugs as an action log and keep them as tests with `ui.replay(log)`.
- The shim is not a browser. It does not model native focus, event ordering, or default actions. For those, run the same session in a real browser (below).

**A real browser, `@ehtb/agent-ui/testing/browser.mjs`.** Headless Chrome (or Chromium; `CHROME_PATH` names another build) driven over the DevTools protocol with Node's own WebSocket: no Playwright, no dependency. `launchBrowser()` returns `null` when there is none, so a test skips itself; `serveSite({ projectRoot })` builds a project and serves it with the render server; `browser.open(url)` returns a page with `evaluate`, `until`, and real input: `click(selector)` and `doubleClick(selector)` (mouse events at the element's position), `type(selector, text, { replace })` (focus, then text inserted as a keyboard or a paste does), `press('Enter')` (key events to the focused element) and `settle()`. The page's own `window.__ui` is the same agent API as in a shim test, so one session can be run twice and compared: `examples/todomvc/browser.test.mjs` types, ticks, double-clicks, edits, filters and clears in the shim and in Chrome, and asserts that `state()`, `derived()` and `outline()` are identical after every step. `examples/shop/browser.test.mjs` does the same for soft navigation (history, focus, the document that stays).

## 11. Recipes

- **Form:** put inputs inside a `form` with `on: { submit: ['form.submit'] }` and a `type: 'submit'` button. Each field has `value: {state: 'form.field'}` and an `input` handler that sets it. The submit action (in the form's namespace) validates by reading the drafts from `store`, then sets `form.error` or calls the owner of the data (`calls: ['contacts.add']`). Show errors with `when` and `{greaterThan: [{length: {state: 'form.error'}}, 0]}`.
- **Async data and chained resources:** a resource's output is written only by its lifecycle actions (`onStart`, `onSuccess`, `onError`, `onCancel`, `onIdle`); declare those state keys in `owns` so dev mode refuses writes from anywhere else. To restart a resource, change a `watch` key (a retry action flips a watched flag). In a multistep flow, each step is a namespace that watches the key the previous step owns (`watch: ['customer.data']`) and uses `onIdle` to clear its own state when that input becomes `null` (`examples/orders/pages/page.js`). Render with `when` and `otherwise`.
- **Empty state:** `{ when: {greaterThan: [{length: {state: 'notes.items'}}, 0]}, children: list, otherwise: emptyMessage }`.
- **Link with params:** `props: { href: { join: ['/person/', {item: 'id'}] } }` and a page folder `pages/person/[id]/` (its path is `/person/:id`). Add `soft: true` inside a shell.
- **Dynamic class or style:** `classes: { active: {equals: [{state:'view.tab'}, 'a']} }`. Styles are a string: `props: { style: { join: ['width:', {item:'percent'}, '%'] } }`.
- **Tabs and conditional views:** a `view.tab` state key and `when` nodes comparing it. Put the view in the route if it must be linkable.
- **Keyboard shortcuts:** `windowEvents(window, { 'keydown.Control+k': ['search.focus', {}, { preventDefault: true }] })`.
- **One event, two actions:** a list of handlers, `on: { 'keydown.Enter': [act('todos.add', { title: state('draft.title') }), act('draft.clear')] }`. Use `calls` instead when the second action is a consequence the first must always cause.
- **Timers or other external effects:** write a plugin (section 6) and check `api.replaying`.
- **Lists of strings:** `{ each: {item: 'tags'}, key: '.', template: { tag: 'li', children: {item: '.'} } }`.

## 12. Components, server rendering, types, dev loop

### Components (`src/components.js`)

`expandComponents(spec, components)` expands named, parameterized fragments into plain spec before `app()` validates and mounts it.

```js
const components = {
  card: { params: ['id', 'title'], spec: { tag: 'li', id: { param: 'id' }, children: [{ tag: 'h3', children: { param: 'title' } }, { slot: 'children' }] } },
};
const spec = expandComponents({ tag: 'ul', children: [{ use: 'card', with: { id: 'a', title: { state: 'page.heading' } }, children: [{ tag: 'p', children: 'body' }] }] }, components);
```

- `{param: name}` is replaced by the value from `with`: a string, a number, a binding or a whole node. It is also valid in `id`, so instances get unique ids, and inside a binding (`{ state: { param: 'key' } }` becomes `{ state: 'email.value' }`).
- `{slot: 'children'}` is replaced by the `children` of the `use` node.
- `params` as a list of names makes every param required. Unknown components, unknown keys on a `use` node and recursion beyond 20 levels are errors.
- All problems come back together, one `path: message` line each with a suggestion where one exists, thrown as one Error. The list is also on the error as `error.problems`.
- A component has no instance, state, lifecycle or reactivity of its own. After expansion it is ordinary spec, so the validator, `patchSpec`, `tree()` and `outline()` see exactly what is mounted. Duplicate ids from reuse are caught by the validator.

**Param declarations** (for component libraries). `params` may also be an object that says more about each param:

```js
params: {
  id:      {},                                   // required
  variant: { options: { default: 'btn-default', outline: 'btn-outline' }, default: 'default' },
  class:   { default: '' },
  onClick: { optional: true },
}
```

| Declaration | Meaning |
|---|---|
| `{}` | Required. A use that omits it is an error. |
| `default: value` | Used when the param is omitted. |
| `options: { key: 'value' }` | A variant. The use writes a key; `{param}` in the spec becomes the mapped value. Any other key is an error that lists the options and suggests the nearest. The key must be a literal, because variants are resolved when the page is built: to switch at runtime, use a `when` with one `use` per variant. A component that forwards a variant to another component declares its own options, because the inner one would receive the mapped value. |
| `{param: name, key: true}` | Not a declaration but a use: inside the spec it gives the option key the use wrote (`'outline'`), not the mapped value, for example for a `data-variant` attribute. For an omitted variant it is the default key. |
| `optional: true` | When omitted, whatever holds `{param: name}` disappears: an object key, a list entry, and an object that this empties (an `on` with only that handler). Not combinable with `default`. |

A `join` whose operands are all literals after substitution is folded into one string at build time, so `{ join: ['btn ', { param: 'variant' }, ' ', { param: 'class' }] }` ends up as a plain `class` value. In `props.class` the result is also trimmed and its spaces collapsed, so an empty `class` param leaves no gap. A declaration mistake (unknown key, `default` that is not an option) is reported with the path `components.<name>.params.<param>` even when the component is never used.

**Components with the builders.** `defineElement(name, { params, spec })` (from `@ehtb/agent-ui/components`) defines a component whose `spec` is written with the builders, with `param(name)`, `paramKey(name)` and `slot()` for `{param}`, `{param, key: true}` and `{slot: 'children'}`. It returns a function `Component(values | null, ...children)` that makes the use node, so a page reads like the markup it produces. `expandComponents(spec, [Component, ...])` takes the list of those functions (or an object of definitions, as before).

```js
const Badge = defineElement('badge', {
  params: { tone: { options: { plain: 'b-plain', loud: 'b-loud' }, default: 'plain' }, class: { default: '', type: 'string' } },
  spec: span({ class: join('badge ', param('tone'), ' ', param('class')), 'data-tone': paramKey('tone') }, slot()),
});
expandComponents(div(null, Badge({ tone: 'loud' }, 'New')), [Badge]);
```

A param may also declare `type`: `'string'`, `'number'`, `'boolean'`, `'handler'` (made with `act`) or `'node'`. The type is checked against literal values at the use (a binding passes for string, number and boolean); it cannot be combined with `options`. The function reports mistakes at the call: an undeclared param (with the nearest declared name), a first argument that is not an object, a bad definition. `defineElement` is a build-time macro like the rest: there is still no instance, and the result is plain spec.

`examples/react-converted-components` is a shadcn/ui library converted from the real React sources, with parity tests. `CONVERTING.md` is the step-by-step procedure for converting a component.

### Reusable namespaces, the counterpart of custom hooks

Reusable state logic is a namespace defined once and mounted under any number of names. Because keys inside a namespace are short and the mount name supplies the prefix, two uses never collide and no name has to be spliced into a key:

```js
const disclosure = {
  state: { open: false },
  derive: { label: (get) => (get('open') ? 'Hide' : 'Show') },
  actions: { toggle: { args: {}, run: (store) => store.set('open', !store.get('open')) } },
};

app({ namespaces: { page: { state: { title: '' } }, sidebar: disclosure, help: disclosure }, spec, root, dev: true });
// sidebar.open, sidebar.label, sidebar.toggle, help.open, help.label, help.toggle: independent copies
```

- A namespace that needs options is a function that returns one: `textField({ validate })` gives `{ state, derive, actions }` (`examples/react-converted-components/features.js`), mounted as `email: textField({ validate })`. A namespace may also include `resources`, so a loading step ships with its lifecycle actions and its request (`loadable` in `examples/orders/pages/page.js`).
- The mount name is the only prefix; the same object mounted twice is two copies of the state (values are cloned from the declaration).
- What a reusable namespace needs from another one, it reads with a qualified key or receives as an option; it reaches other namespaces' state only through `calls`, which name actions explicitly.

`memoizeItem(computeFromItem)` caches an expensive per-item computation inside a `derive` function by the item's reference (a WeakMap). Because the store replaces changed items and keeps unchanged items' references, a reference hit means the item is unchanged and the cached result is exact: updating one row in a 10,000-row list recomputes one row, and a removed item is garbage-collected together with its cache entry.

```js
import { memoizeItem } from '@ehtb/agent-ui/memoize';

const formatRow = memoizeItem((item) => ({ ...item, label: expensiveFormat(item) }));
const derive = { rows: (get) => get('items').map(formatRow) };  // in the namespace `list`: {state: 'list.rows'}
```

Cached results are also reference-stable, so a derived list built this way keeps unchanged rows' references and `each` reuses their DOM rows. Two rules follow from caching by the item alone: `computeFromItem` must depend on the item only (a function that also reads other state, like a query or a selected id, would serve stale results; derive from both inputs without memoizing instead), and items must be objects or arrays (a string or number has no reference identity to cache by; calling the memoized function with one is an error saying so).

### Hooks and where they went

| React | agent-ui |
|---|---|
| `useState` | a `state` key of a namespace and an action that writes it; per-row state is `rowState`, per-instance state a key addressed by id |
| `useReducer` | an action: `run(store, args)` is the reducer, and every call is logged |
| `useMemo`, `useCallback` | `derive` (recomputed only when its inputs change); there is no re-render, so there is nothing to memoize. For an expensive per-item computation inside `derive`, `memoizeItem` caches by item reference |
| `useContext` | the one store; there is no provider tree, every binding reads the same state, by `namespace.key` |
| `useEffect` that fetches | a `resources` entry: `watch` is the dependency list, and start, success and failure are logged actions |
| `useEffect` for the outside world | a plugin (`resources`, `windowEvents`, or your own: `(api) => { api.watch(...); api.dispatch(...) }`) |
| `useEffect` setting the title or description | `head` of the page |
| `useRef` for the DOM | none in a view: give the element an `id`; `focus: true` focuses it. A library that draws into an element claims it by that id in a plugin: `mountElement` (section 6). Mutable values that must not render live in a plugin's closure |
| `useId` | an explicit `id` param |
| custom hook | a namespace (or a function that returns one), mounted under a name |
| `useLayoutEffect`, `useTransition`, `useDeferredValue`, Suspense | not needed or not built: `transition` is CSS-driven, loading is state (`ready`, `pending`) |

Timers, intervals and observers (`IntersectionObserver`, `ResizeObserver`) have no built-in plugin. Write one: a plugin may only touch the outside through `api.watch` (state out) and `api.dispatch` (events in), so the action log stays complete.

### Server rendering and hydration (`server/render-page.js`, `src/server-dom.js`, `src/hydrate.js`)

The server runs the same `create(env)` the browser runs, against a small server DOM. Output cannot drift from client rendering because there is one render path.

```js
const { html, state, stateScript, ui, timedOut } = await renderPage(create, {
  url: '/person/3', fetchFunction, timeoutMs: 2000, initialState: {}, dev: false,
  request,        // the request context (below): fetchFunction receives it as its third argument
  stateForBrowser, // optional: which state the document carries (see below)
  signal,         // optional: ends the render when the client disconnects (defaults to request.signal)
});
```

`dev` is required here too (`false` to serve, `true` to render with the development checks, as `agent-ui check` does).

What `renderPage` does:

- It calls `create` with `{ root, win, fetchFunction, dev, initialState, serverRendered: false }`. `win` has `location`, `addEventListener` and timers. `initialState` is the state to start from in the shape of `ui.state()`, `{ namespace: { key: value } }`, for example the outcome of a posted form.
- A page reads its parameters from the path of `url`.
- It waits for the page to be ready. A page that declares `ready` answers for itself through `ui.isReady()`; a page without it is rendered as it is. After `timeoutMs` (default 2000) it renders what exists and sets `timedOut` to true. `renderPage` itself returns the partial result. `createSsrHandler` is the one that turns a timeout into an answer: by default it logs the timeout and answers 503 (`onTimeout: 'error'`); pass `onTimeout: 'serve'` to answer the partial page with 200. A static build fails instead of writing a page that never became ready.
- It returns the markup, the state it rendered from, the `ui` object, and `stateScript`: a `<script type="application/json" id="agent-ui-state">` that is safe against `</script>` and U+2028/9. A host that needs a Content-Security-Policy nonce adds it with `transformResponse` (section 12); the reader accepts attributes in any order.
- With `request`, every data request the page makes during the render calls `fetchFunction(url, init, request)`: the host can forward the visitor's cookie or authorization header to its data source.
- `signal` (or `request.signal`) stops the render when the visitor closes the connection. The app, its resources and their data requests are ended, the render rejects with an error whose `name` is `'AbortError'`, and no partial result is returned. A render that was already aborted rejects at once.
- `stateForBrowser(state, request)` chooses what the document's state script carries. The render still uses the full state for its markup and returns it as `state`; the hook may leave a server-only key out or replace a value, but it cannot add a namespace or key the page did not declare (the browser app would not have it). The hook receives `null` as its request when a static build or `agent-ui check` calls it. This is a serialization boundary, not a secret store: a value the page renders is in the markup, and a value in the page's declared default state is in the browser bundle. Server-only state belongs in `initialStateFor` and is left out here.

**The request context, response headers and a session.** `createSsrHandler` (`@ehtb/agent-ui/server/ssr-handler.mjs`) reads each request once into the object every server-side part reads:

```js
{ method, pathname, search, query, headers, cookies, signal }
```

`method` is upper case. `pathname` is the path as sent, still percent-encoded (a page's URL pattern decodes each segment itself). `search` includes its `?`. `query` is a `URLSearchParams` of decoded values. `headers` are Node's, names lower case. `cookies` are raw values, not percent-decoded. `signal` is an `AbortSignal` that aborts when the client closes the connection before the answer is written; a resource combines it with its own signal, and a host should pass it to its own query or upstream call. The request data goes to `api.handle({ ...request, body })`, `api.handleForm({ ...request, form })`, `initialStateFor(request)`, `stateForBrowser(state, request)`, `transformResponse` as its first argument, and `renderPage`'s `fetchFunction` as its third argument. For a rendered form outcome, the page render, `initialStateFor`, `stateForBrowser`, `transformResponse`, its resources and `fetchFunction` read the outcome page's `pathname`, `search` and `query` with the POST's `method`, `headers` and `cookies` (see "Form outcomes"). It is request data, not state: do not copy it into a namespace.

Three hooks keep policy in the project:

| Hook | Returns | Used for |
|---|---|---|
| `initialStateFor(request)` | state in the shape of `ui.state()`, or null | the public state a page starts from: the signed-in visitor's name, a cart, a theme. The result is written into the document, minus what `stateForBrowser` leaves out. |
| `stateForBrowser(state, request)` | state in the shape of `ui.state()` | what the document's state script carries after the page rendered. Leave a server-only key out; the hook cannot add a namespace or key. The markup is rendered from the full state, and a declared default is in the browser bundle. |
| `transformResponse(request, { status, headers, body })` | `{ headers?, body? }`, or null | every answer this handler writes once a request context exists: pages, API answers, form outcomes, its own 404 and 500, and the 400 for a body it cannot read. Use it for CSP, HSTS, a site-wide cookie, a cache policy, or a body rewrite such as a CSP nonce. A binary raw answer is sent unchanged: the hook receives an empty `body`, may change headers, and returning a body is refused. |

```js
// session.mjs — a demo store. A real app uses a store with expiry and a server-side lookup. Serve over HTTPS: the cookie is Secure.
import { randomBytes } from 'node:crypto';

const users = new Map();
const USER = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,39}$/;

export const createSession = (user) => {
  const name = typeof user === 'string' ? user.trim() : '';
  if (!USER.test(name)) return null;
  const id = randomBytes(24).toString('base64url');
  users.set(id, name);
  return `session=${id}; Path=/; HttpOnly; Secure; SameSite=Lax`;
};
export const readSession = (id) => (typeof id === 'string' ? users.get(id) ?? null : null);
```

```js
import { randomBytes } from 'node:crypto';
import { readSession } from './session.mjs';

const handler = await createSsrHandler({
  config,
  initialStateFor: (request) => ({ session: { user: readSession(request.cookies.session) } }),
  transformResponse: (request, { headers, body }) => {
    const html = String(headers['content-type'] ?? '').startsWith('text/html');
    const nonce = html ? randomBytes(16).toString('base64') : null;
    const added = {
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
      ...(nonce ? { 'content-security-policy': `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self'` } : {}),
    };
    return html && nonce
      ? { headers: added, body: body.replace(/<script(?=[\s>])(?![^>]*\bsrc\s*=)/g, `<script nonce="${nonce}"`) }
      : { headers: added };
  },
});
```

The API and form handler of the same server complete the example: they read the request context, set a cookie and a header, and use `{ redirect }` after a form post.

```js
// api.mjs
import { createSession, readSession } from './session.mjs';

export const createApi = () => ({
  handle({ method, pathname, query, cookies, body }) {
    if (pathname !== '/api/cart') return null;
    if (method !== 'POST') return { status: 405, body: { message: 'Use POST' }, headers: { allow: 'POST' } };
    return {
      status: 200,
      body: { items: body.items, q: query.get('q'), user: readSession(cookies.session) },
      headers: { 'set-cookie': 'cart=1; Path=/; HttpOnly; Secure; SameSite=Lax', 'cache-control': 'no-store' },
    };
  },
  handleForm({ pathname, form }) {
    if (pathname !== '/login') return null;
    const cookie = createSession(form.user);
    if (!cookie) return { status: 400, url: '/login', initialState: { session: { user: null } } };
    return { redirect: '/account', headers: { 'set-cookie': cookie } };
  },
});
```

The page that shows the result declares `status: (state) => (state.session.user ? 200 : 403)` in `page.js`; it cannot set response headers. Together with the handler above, this is one complete server: `initialStateFor` supplies public state, `transformResponse` sets the site policy and rewrites HTML, the API sets its own headers and cookie, and a form post redirects with 303. `createSession` validates the name and returns a `Set-Cookie` value with `Path=/; HttpOnly; Secure; SameSite=Lax`; `readSession` looks up an opaque id. The `server-hooks` recipe is the dependency-free signed alternative.

`transformResponse` runs after the framework has laid down the content type and cache default and the API's or form outcome's headers. Return only the headers to add or replace: the object passed in contains the framework's own headers (for example `content-type` on a page or API answer) and its security header, and those names are refused in a returned object, so read them and do not spread them. A returned header replaces the existing one; `set-cookie` values add up. The framework's security header is merged last, so the hook cannot remove it. A returned `body` must be the whole body as a string; it is how a host adds a CSP nonce to inline `script` tags (the state-script reader and soft navigation accept attributes in any order). A page's CSS is an external stylesheet covered by `style-src 'self'`; a page that emits inline `style` needs a hash, a nonce or `'unsafe-inline'`, which the host decides. A soft navigation copies the next page's head and body scripts; an inline script that differs is created and runs, but the fetched document's nonce belongs to that response, not to the CSP of the document that stays. Keep page behavior in its module entry or a plugin when a soft link is used; do not rely on an inline script there. The state script is data, not code. The body may be HTML, JSON or plain text: check `headers['content-type']` before rewriting it. The hook does not run for a request that goes to `next()`, nor for the 421 and 400 answered before a request context exists. If the hook throws, the visitor gets a 500 and the hook is not run again on that answer.

The framework does not implement sessions, login, CSRF tokens or a CSP policy: it gives the request and the hooks, and the project decides. Keep a session token in an `HttpOnly` cookie (set by the API or a form, never by a page), and put only what the page may show into `initialStateFor`: the state is in the document and reaches the browser. Verify the cookie, the `Origin` header or a CSRF token in the API or form handler that changes state. Every key `initialStateFor` returns must be declared by the page; if it returns a `session` namespace on every request, import one shared `session` namespace into every page. `initialStateFor` starts the page's app; a shell is an app of its own and starts from its declared state, so a shell that shows the visitor reads that key from the page (`reads`, section 13) and the page lists the namespace. A page whose state depends on the visitor should have the host send `vary: cookie` (or `cache-control: private`) from `transformResponse` for every answer: `no-cache` alone does not keep a shared cache from reusing one visitor's HTML for another.

Headers from an API answer, a form outcome and `transformResponse` are checked in one place (`checkResponseHeaders`, exported as `@ehtb/agent-ui/http-headers`): a name comes back lower case, a name given twice is an error, `set-cookie` is the only header that may be a list, a line break, a control character other than a tab, or a non-ASCII character is refused, and the framework's own headers (`content-type`, `content-length`, `content-encoding`, `x-content-type-options` and the hop-by-hop headers) cannot be set. A page cannot set response headers; an API, a form outcome and `transformResponse` can set a cookie. `mergeResponseHeaders` lays the layers over each other, later winning, except `set-cookie`, whose values add up. The framework lays down the response's content type (when it sends one) and cache default, then the API's or form outcome's headers; a form response is given `no-store`, which its outcome headers cannot override. Then `transformResponse` is laid over them, then the framework's security header. A transform can therefore set a page's cache policy or CSP, or replace an API's or form outcome's header; to make a site policy a floor, set it in `transformResponse` unconditionally. A page GET is `no-cache` unless the transform sets one; an API answer is `no-store` unless the endpoint or the transform sets one; the framework sets `no-store` on a form response and on the 4xx and 5xx answers the handler writes itself (a page's own `status` is a page answer), and a transform can replace that too (do not make a form response cacheable).

**Form outcomes.** A form handler (`handleForm`) answers one of two shapes. `{ status, url, initialState?, headers? }` renders the page at `url` (a local printable-ASCII path starting with `/`, not `//`, with no backslash or encoded separator at the start) with the outcome as `initialState`, so the plain HTML form works without JavaScript. `{ redirect, headers? }` answers 303 with `location` and `cache-control: no-store`, so a reload does not post again; the redirect follows the same path rule (encode a segment with `encodeURIComponent`), and `location` and `cache-control` cannot be in its `headers`. A 3xx status with a `url` is refused: use `redirect`. Both kinds may add `set-cookie`; a form that changes the session should also return the new public session state in `initialState`, or redirect so the next request carries the cookie. While a rendered outcome page is made, `initialStateFor`, `stateForBrowser`, `transformResponse`, its resources and `fetchFunction` see the outcome page's `pathname`, `search` and `query`; `method`, `headers` and `cookies` remain those of the POST.

In the browser, the entry passes `initialState: readServerState(document)` to `create`, which hands it to `app({ initialState })`; the declared state is the default and the server's keys win. `browserEnvironment({ dev })` from `@ehtb/agent-ui/hydrate` does this for you, and sets `serverRendered: true` when the document carries a state script (a soft navigation sets it when the fetched document carries one). A resource declared `revalidate: 'never'` uses that flag to trust the server's output on mount instead of loading it again (section 6, `resources`); the flag says only that the document carried state, not that every resource ran, so use it only on resources the server rendered.

Hydration is by replacement. Mounting renders the spec into the root, replacing the server markup in one step; focus and anything typed into an input, select or textarea before hydration are carried over to the element with the same `data-id`. A carried value is unsubmitted input: it lasts until an action writes the state its binding reads. The server markup gives first paint, crawlers and no-JS content.

**Forms.** Render a `form` with `method` and `action` props pointing at the page URL, and `name` attributes on the fields.

- With JavaScript, the `submit` handler (default-prevented) validates and sends through `resources`.
- Without it, the browser posts the fields to the server, whose `handleForm` (see `BUILD.md`) renders the page with the outcome as `initialState`, or answers its `{ redirect }` with 303.
- Put the validation rules in one pure module imported by the client, the API and the form handler, so they cannot disagree.
- A server-computed outcome survives takeover: the page starts from the state the server embedded, and the URL's parameters are added to it.

Runnable references are in `examples/` (see `examples/README.md`): a server-rendered app with forms and a JSON API, and one rendered per request with `agent-ui serve`. Their tests show the full path from request to takeover.

A static site (`agent-ui build --static`) is described in `BUILD.md`.

### Spec schema and TypeScript declarations

`docs/spec.schema.json` is a JSON Schema (2020-12) of the spec, generated from `grammar` by `agent-ui schema`. A test fails when it is stale. Use it for constrained or structured generation of specs and for editor validation. It checks structure only; the validator owns semantics such as action names, argument types, ids, accessibility, `{item}` scope and where SVG may stand. A spec that matches the schema can still be refused: the check is `validate()` (and `agent-ui check`), never the schema alone.

`src/*.d.ts` declare the whole API for `// @ts-check` in plain JavaScript and for TypeScript projects. `npm run typecheck` checks them with `tsc`, which is run separately; `test/types/check.js` is the usage and error fixture.

### Dev loop

`agent-ui dev [--port=8080] [--host=127.0.0.1]` builds with stable names, serves with hot reload (`cli/hot-reload.mjs` and `cli/hot-client.js`: the static handler's `intercept` and `transformHtml` hooks, nothing in the handler itself), and rebuilds on change. It watches the framework's `src/`, `pages/`, `publicDir`, the directory of the `api` module and the config file.

- **A page is swapped, not reloaded.** After a rebuild the server tells the open pages which chunks and stylesheets changed. If the running page changed, the browser imports its new entry file and swaps the page app for the new one inside the same shell (`src/hot.js`, the swap of a soft navigation); the new app starts from the state the old one had, so what the visitor typed and chose stays. If the new definition does not accept that state (a namespace or key was renamed), the page starts afresh and the console says so. A changed stylesheet replaces the old one without a reload; if the page gains or loses a stylesheet chunk (a new global or shared CSS link, or an import removed), the page reloads, because the running document cannot add or remove that link by swapping an existing one.
- **How a file is "imported again".** The dev output carries a version in every URL that names a chunk (`./index.js?v=9c21`); a chunk's version covers its text and the versions of the chunks it imports. A chunk that did not change keeps its URL, so its module (and the page registry in `src/pages.js`, which lives in the framework chunk, `agent-ui`) is never evaluated twice.
- **When it reloads instead.** The framework itself changed (`src/`), a page was added or removed, a page gained or lost a stylesheet chunk, a file copied from `publicDir` changed (one copied into the assets directory is not noticed), a page with a shell changed outside its own entry chunk (the shell is not swapped), the swap threw, or the dev server was restarted. There is no browser storage and no action log involved.

## 13. Pages: URLs, per-page APIs and head (`src/pages.js`; the server side is the project's `api` module)

A page is a URL, and a URL is a folder: every folder below `pages/` with a `page.js` is a page and its path is its URL. There is no list of pages and no entry file to write; the build finds the folders and generates the entries (`BUILD.md`). A site below a path of its domain sets `basePath` in `build.config.mjs` and keeps writing its own paths (`BUILD.md`, "A site below a base path"). GUIDE.md explains the model and has the recipes. The layout of a project:

```
pages/page.js                  export const page = { ... }      the page at "/": its behavior (the file the browser entry imports)
pages/view.js                  export const view = ...          its content; only the server and the build import this file
pages/<path>/page.js           export const page = { ... }      one page, in the folder that mirrors its URL ('/item/:id' -> pages/item/[id]/page.js; '/docs/*path' -> pages/docs/[...path]/page.js)
pages/<path>/view.js           export const view = ...          that page's content (and optionally its `layout`)
pages/<path>/page.css          that page's styles (optional; may @import shared CSS)
pages/<path>/api.js            server side of that page, next to its page.js (Node only)
pages/style.css                styles of every page (optional; may @import shared CSS)
shared modules                 namespaces, components: any folder you like, imported by the pages that use them
api.js                         composeApi({ routes: { item: itemApi } })   passed to the render server as `api`
```

### A page

A page is two files. `page.js` exports one object with fixed keys: the page's behavior. `view.js` beside it exports the page's content as `view`, and optionally its `layout`, its `pending` view and the content of its `shell`. Only the server and the build import `view.js`: the build evaluates `layout(view)` in Node and ships the finished spec as data, so a browser downloads the behavior and the spec, never the code that builds the spec.

| Key | File | Required | Meaning |
|---|---|---|---|
| `head` | page.js | yes | `{ title, description?, html?, body?, tags?, bodyTags? }`: the title (required), the description, the attributes of `<html>` and `<body>`, and the elements of `<head>` and the end of `<body>`. Each value is a literal or `(state) => value`. See "Head". |
| `namespaces` | page.js | no | `{ name: { state, derive, actions, resources, shapes } }`: everything the page keeps in state, exactly as in `app()`. Shared namespaces are imported and listed here like any other; a namespace that reads another one needs it listed too. `route` is reserved. |
| `plugins` | page.js | no | `[(environment) => plugin]`: what the page needs from outside its state, imported by the page itself so that a page downloads only the code it uses. `withResources` (from `@ehtb/agent-ui/resources`) runs the namespaces' `resources`; a window listener is `({ win }) => windowEvents(win, { ... })`. A page that declares `resources` without `withResources` fails at start with the fix. |
| `ready` | page.js | no | `(state) => boolean`: the page has what it needs. |
| `pending` | view.js | no | A spec, shown instead of `view` until `ready` is true. Needs `ready` in page.js. Give its elements ids of their own. |
| `status` | page.js | no | `(state) => HTTP status`, for example 404 for an unknown id. |
| `shell` | page.js and view.js | no | The shell the page lives in: its behavior (from `defineShell`) in `page.js`, its content (`{ name, view }`) exported from `view.js`. See "Shell and soft navigation". |
| `debug` | page.js | no | `true` makes the browser console show what the page's app does: the state, and every action with what it changed (section 6, "The debug console"). Default `false`; the same key exists on `defineShell` for the shell's app. |
| `view` | view.js | yes | The spec of the content of the page (a node, usually an element): a value, not a function. |
| `layout` | view.js | no | `(content) => spec`: the shell around the content, imported from a shared module. Pages that import the same layout share one copy of it in the build. |

### definePage and the route namespace

`definePage(page, { path, view, layout, pending, shell })` checks a page and returns `{ path, namespaces, spec, create, mount, createShell, shellName, shellContent, shellNamespaces, describePage }` (`mount` is `create` plus `route.hydrate`; `createShell`, `shellName`, `shellContent` and `shellNamespaces` (the shell's own namespaces plus `route`, which the build validates the shell's content against) are undefined for a page without a shell). `path` is the page's URL pattern (`'/item/:id'`); the build takes it from the folder, and a test writes it out. `view` is the page's content (from `view.js`); `layout` and `pending` are optional and come from `view.js` too. A browser entry instead passes the finished spec as data: `startPage(page, { path, spec, shell, url })`, which registers the page under the URL of the entry's own file (`url`, `import.meta.url`) and, when it is the first page of the document, creates the app from the state the server embedded and dispatches `route.hydrate`. `agent-ui build` writes that entry and that spec for you.

- The framework provides the namespace `route`: state `route.params` (the URL's parameters, read once when the page starts: `/item/3` gives `{ id: '3' }`) and `route.hydrated` (false in the markup the server renders, true once the browser app has taken over, through the action `route.hydrate`), and the derived value `route.ready` (what `ready` says; true for a page without `ready`). A page with a shell also has `route.destination` and the action `route.go` (below).
- `create(env)` is the function the browser entry and the server renderer both call. It also keeps `document.title` current while the page's data arrives.
- Everything is checked when the page is defined, with the page's URL, the problem and the fix in the message: unknown or missing keys (with a suggestion), bad paths and names, a `view`, `layout` or `pending` left in `page.js` (they belong in `view.js`), a `view` that is a function, a `layout` that is not a function, `pending` without `ready`, a shell whose behavior and content do not go together (see below), and a `view.js` that exports anything but `view`, `layout`, `pending` and `shell` (a misspelt `layuot` is an error with "Did you mean `layout`?", not a layout that is silently missing).

### Shell and soft navigation (`src/shell.js`, `src/navigation.js`)

A link is a page load. A **soft link** is the same load, made faster: the browser keeps the document, and only the page inside a **shell** is replaced. Nothing about the link itself changes: its `href` is real, so a crawler, a middle click, a copied address and a failed swap all use it, and what the visitor gets is what a load would give (the same URL, the same server document, the same state). There is no router: no route list, no client-side state that survives a swap; the server's documents are the source.

**The shell** is the part of a document that stays while the page changes: a header, a footer, a player. It is an app of its own next to the page's app, so every rule of an app holds for it (state in namespaces, behavior through actions, effects in plugins). Two files, like a page:

```js
// shared/shell.js            the behavior: imported by the page.js of every page that uses the shell
import { defineShell } from '@ehtb/agent-ui/shell';
import { withNavigation } from '@ehtb/agent-ui/navigation';

export const shell = defineShell({
  name: 'main',
  namespaces: { frame: { state: { cartCount: 0 }, actions: { setCartCount: { args: { count: 'number' }, run: (store, { count }) => store.set('cartCount', count) } } } },
  plugins: [withNavigation],                                                                      // makes soft links work
  reads: [{ watch: ['cart.count'], action: 'frame.setCartCount', args: { count: 'cart.count' } }], // what the shell shows of the page
});

// shared/shell-view.js       the content: imported by the view.js of those pages (the build ships the result once, as data)
import { a, equals, footer, header, main, nav, pageSlot, state } from '@ehtb/agent-ui/spec';
export const shell = {
  name: 'main',
  view: main({ id: 'app-frame' }, header({ id: 'app-header' }, nav(null, a({ id: 'home', href: '/', soft: true, classes: { active: equals(state('route.path'), '/') } }, 'Home'))), pageSlot(), footer({ id: 'app-footer' }, 'Footer')),
};
```

A page uses it with `shell` in `page.js` (the behavior) and `export { shell }` in `view.js` (the content).

| `defineShell` key | Meaning |
|---|---|
| `name` | Letters and digits, starting with a lowercase letter. `view.js` repeats it, so a page cannot pair one shell's behavior with another's content. |
| `namespaces` | What the shell keeps in state, exactly as in `app()`. `route` is reserved: every shell has `route.path`, the path of the page that is showing (the navigation plugin keeps it current), so a link can mark itself current. |
| `plugins` | What the shell needs from outside its state. `withNavigation` (from `@ehtb/agent-ui/navigation`) is the one that makes soft links and `route.go` work. |
| `reads` | `[{ watch, action, args }]`: what the shell takes from the running page, one way, with `syncApps` (section 6). `watch` are qualified keys of the page's app, `action` a qualified action of the shell, `args` the same mapping as in `syncApps`. The first values are sent when a page starts, then on every change; a read stops when its page is destroyed, and the next page starts it again. The action is checked when the shell is defined, the keys when a page starts with it (the message names the shell and the read, and says to list the namespace in the page's `namespaces`). |

- **The page's place.** `pageSlot()` (from `@ehtb/agent-ui/spec`) writes the element the page's app renders into (explicit id `page-slot`, HTML id `app`). It appears exactly once in the shell's view and not inside a `when` or an `each`; a view that breaks this fails when the page is defined.
- **One way.** The shell reads the page; the page never reaches into the shell. If the shell must show something that a page decides, the page keeps it in state and the shell `reads` it.
- **What a page needs.** `page.js` and `view.js` must name the same shell (`name`), both or neither; `agent-ui check` and the build report a mismatch with both names. A page without a shell has no `route.go` and none of this code.

**Soft links.** `a({ href: '/about', soft: true }, 'About')`. `soft` is a literal `true` on an `a` with an `href`, anywhere in a shell's view or a page's view. For a button, or an action, use the framework's `route.go`: `button({ on: { click: act('route.go', { href: '/checkout' }) } }, 'Checkout')`. The action sets `route.destination` (`{ href, count }`; the count makes a second request for the same place a change) and the shell follows it: a soft navigation when the shell has `withNavigation`, a normal page load when it has not. Nothing is navigated while the app replays.

**What a soft navigation does**, in order, and what is the same as a page load:

1. It fetches the link's document (the same server render a browser would get) and reads from it the state the page starts from, the page's entry file and its stylesheets.
2. It adds the stylesheets that are not loaded yet (and waits for them), and removes the ones only the old page used.
3. It imports the entry file (once; a visit later finds it loaded) and finds the page it registered (`findEntry`, `startPage(page, { url })`).
4. It pushes the address (`history.pushState`), applies the head of the fetched document (below) and starts the new page in the same element: the old page's app is destroyed (`destroy()`, section 7), and the new one starts from the fetched state (`route.params` read from the new URL, `route.hydrate` dispatched, the title and a head that follows the state kept current by `withHead`), the shell is told the path (`route.arrive`), the page's element takes the focus, and the window scrolls to the top (or to the `#hash`). Back and forward scroll to where the visitor was on that entry: the plugin keeps a key per history entry in `history.state` (`agentUiEntry`, beside what the site keeps there), remembers the position of the entry being left, writes it into the entry on `pagehide` (`agentUiScroll`) so a reload and a return through the back/forward cache (`pageshow`) restore it too (the entry a soft navigation pushes starts with only the plugin's key, as a page load's entry starts with no state), and sets `history.scrollRestoration` to `"manual"`, because the browser's own restoration would scroll before the new page exists.
5. It announces the new page. The page's element becomes a `region` named by the document's new title, so a screen reader reads it when it takes the focus. A site that wants a live announcement too puts a live region in its shell with `domId: 'agent-ui-announcer'` (the HTML id; `id` stays the spec address), usually visually hidden with `aria-live: 'polite'`; the plugin writes the new title into it. A normal page load announces itself by changing the document title; this is the same message for a swap.

**The head of a soft navigation** is read from the text of the fetched document: the description, the attributes of `<html>` and `<body>` exactly as that document has them (the template's own, such as `lang`, and the page's), and the `meta`, `link`, `script` and `style` elements the page wrote (found between the `agent-ui-head` and `agent-ui-body` comments, never inside the text of a script). It differs from a load in three ways. A script that changed is put where the old one was (the order of the document is kept) and runs once the entry file is imported and before the new page's markup exists (a script with a `src` runs when it has loaded, whenever that is); a script that is the same as the one in the document is not run again; a script with a `src` at the end of `<body>` is not waited for. The text of a script built from the state (JSON-LD) is the document's: `withHead` does not rewrite it when the state changes later. A stylesheet is not part of `head`: write it in `page.css`, which the build links and the navigation waits for.

Back and forward do the same swap for the address they return to, without a new history entry. **Anything that is not a plain page ends in a normal page load of the same URL**, with the reason in the console (`soft navigation to /x: the answer is 404, not a plain page. Loading it as a normal page`): an answer that is not 200, a redirect, a response that is not HTML, a document without a page script, a page of another shell (or none), a failed fetch or import, an error while starting. A soft link never leaves the visitor on a half-changed page. The browser keeps what is its own: a modifier key, a middle click, `target`, `download`, another origin, and a link to a place on the page that is showing.

`agent-ui check` reads the links of every page and shell: a literal `href` (soft or not, and the `href` of an `act('route.go', ...)`) that is no page, file or API path is reported with a suggestion, and a `soft` link to a page of another shell, or to a page without one, is reported with both sides, as is a `soft` link on a page that has no shell (nothing handles it). `check` also reports what went wrong inside the shell's own app (an unsafe bound URL, an action that threw), named as the shell's.

**On the server and in the build.** `renderPage(create, { createShell, dev: false })` renders the shell with the page inside it (the document's mount point is then `<div id="shell">`, and the page's element is in its markup); the page definition offers `createShell`. A production build writes each shell's content once (`.agent-ui/shells/<name>.js`, a module of data that the entries of its pages share, so one chunk) and every page's entry registers itself under its own file's URL. `window.__shell` is the shell's app in a browser (removed when the shell is destroyed). If the shell cannot be made, the error goes to the console and the page's element stays where the server put it; `ui.tree()` and `ui.outline()` of each app leave out the app inside it.

**Not built, on purpose:** prefetching the next page, transitions between pages, scroll positions inside scrolling containers, and keeping a page's state across a swap (what must outlive a page lives in the shell or on the server). `src/navigation.js` is the plugin with its parts injectable (`navigation({ win, fetchFunction, shellName, importModule, loadStylesheet })`), for tests and for hosts that load modules their own way. The shop example (`examples/shop`) uses all of this and its `browser.test.mjs` drives it in a real Chrome.

### URL patterns (`@ehtb/agent-ui/url-pattern`)

The syntax that pages and the tables of `composeApi` share:

| Pattern | Matches |
|---|---|
| `'/about'` | exactly that path |
| `'/item/:id'` | exactly one non-empty segment: `/item/abc` with `{ id: 'abc' }`, not `/item/a/b` |
| `'/docs/*path'` | one or more remaining segments, as the last part of the pattern: `{ path: 'a/b/c' }` |

When several patterns match, the **most specific wins, however they are listed**. At the first segment where two patterns differ, a literal beats `:name`, which beats `*name`. So `/item/new` beats `/item/:id`, which beats `/item/*rest`. Two patterns with the same shape, such as `/item/:id` and `/item/:slug`, are the same pattern, and the build refuses them (naming both folders). Matching is safe and predictable:

- Every pattern compiles to one anchored regular expression whose parts cannot overlap, so a hostile URL cannot make matching slow.
- Characters that mean something in a regular expression (`.`, `+`, `(`, and so on) are literal in a pattern.
- Each captured segment is URL-decoded on its own, so `%2F` stays inside one segment. A location with malformed percent-encoding (`%E0%A4%A`) matches nothing instead of throwing.
- A pattern that cannot work (a bad parameter name, a `*name` that is not last, a name used twice) throws when it is compiled, naming the pattern.
- A trailing slash is ignored when a page reads its URL.

`compileUrlPattern(pattern)` returns `{ match(location), build(params), paramNames, specificity, shape }`; `sortBySpecificity(entries, read)` orders compiled patterns.

### Loading and status per page

`ready(state)` is the one definition of "this page has its data". `renderPage`, the static build, `agent-ui check` and the SSR handler wait for it. `pending` replaces the page content until it is true, through the derived value `route.ready` that the page's spec binds to.

`status(state)` sets the HTTP status, read through `ui.getStatus()`. A page GET is `cache-control: no-cache`; `transformResponse` can set a cache policy. A page cannot set response headers: the API, a form outcome and `transformResponse` can, and `transformResponse` runs after the framework's headers, so a host can enforce a site policy (section 12, "The request context, response headers and a session").

Both receive the snapshot of all state, `{ namespace: { key: value } }` (the same `state` that `head` receives, and the URL's parameters are `state.route.params`), and are checked when they run: `ready` must return a boolean (checked as soon as the page starts) and `status` a whole number from 100 to 599. The message names the page. `agent-ui check` calls `ui.getStatus()`, so a bad status is found without a request.

To protect a page, return the public session state in `initialStateFor` and answer `status(state)` 403 when `state.session.user` is null; render a sign-in prompt, not the protected content, and keep `initialStateFor` public. A page cannot set a redirect header. The API and form handlers must check the session too: a page status protects the page, not the data.

### Static generation

`agent-ui build --static` also renders every page and writes it to `<path>/index.html` (the page `/` to `index.html`), so a file host can serve finished pages with no server. A page whose path has parameters (`/event/:id`, `/docs/*path`) is written once for every URL its `view.js` lists:

```js
// pages/event/[id]/view.js
export const paths = ['/event/1', '/event/2'];         // or: export const paths = async () => (await readEvents()).map((event) => `/event/${event.id}`);
```

`view.js` runs only in Node, so a function may read files or a database and never reaches a browser. Each URL must match the page's pattern, be plain (letters, digits and `. _ ~ -` in its segments, no query, no trailing slash) and appear once; a page without parameters has no `paths`. A page with parameters that lists none stops a static build with an error that names the pages and the fix. Without `--static` nothing is rendered at build time, and `agent-ui serve` renders every URL per request.

`agent-ui check` renders the same URLs: every page without parameters, and a page with parameters at its `paths`. One that lists none is printed as a note, and its spec is still validated.

### Per-page API

`api.js` next to the page's `page.js` exports a table. `composeApi` (the project's own file, `examples/events/compose-api.js`: copy it and change it; the framework only asks for the `api` object it returns, see docs/BUILD.md) mounts endpoints below `<apiBase>/<name>/` (`apiBase` is an option of `composeApi`, default `'/api'`, no trailing slash) and the forms at the page paths:

```js
export const createItemApi = () => ({
  endpoints: { 'POST /:id/buy': ({ params, body, cookies }) => ({ status: 201, body: { id: params.id }, headers: { 'set-cookie': 'cart=1; Path=/; HttpOnly' } }) },   // POST /api/item/3/buy
  forms: { '/item/:id/buy': ({ params, form }) => ({ status: 200, url: `/item/${params.id}`, initialState: { ... } }) },   // or { redirect: '/thanks' }
  reset: () => {},   // optional, forgets in-memory state (tests)
});
```

- `handle` and `handleForm` receive the same request context as the page (`method`, `pathname`, `search`, `query`, `headers`, `cookies`, `signal`), plus `body` or `form`. See section 12 for the shape and for `initialStateFor`, `stateForBrowser` and `transformResponse`.
- A table cannot answer another table's paths. An unknown path below `apiBase` is a 404 JSON answer. A path that exists for other methods is a 405 with an `allow` header.
- An endpoint returns `{ status, body, headers? }`, or `{ status, body, headers?, raw: true }` when the body is already the exact bytes to send (CSV, XML, a file). A JSON answer is sent as JSON with `application/json; charset=utf-8`. A raw answer must be a string or a `Uint8Array` and must set its own `content-type` unless the body is empty. A string raw body may be rewritten by `transformResponse`; a `Uint8Array` is sent unchanged, its hook receives an empty `body`, and returning a body for it is refused. An API answer is `cache-control: no-store` unless the endpoint or `transformResponse` sets one, and it may set a cookie; the header rules are the ones in section 12.
- The handler reads a request body only as JSON (`application/json`, including `application/*+json`) or a URL-encoded form (`application/x-www-form-urlencoded`), with the `maxBodyBytes` limit (default 100 KB). A body with no content type, `multipart/form-data` or another type, and a compressed body (any `content-encoding` but `identity`), is answered 415; a body over `maxBodyBytes` is answered 413 (a declared `content-length` before reading, a chunked body while it is read); a body it cannot parse is answered 400. Decoding a compressed body is the host's: its body parser decodes it and passes the value as `request.body`. An empty body is accepted as `{}`. A host framework that parses the body itself can put the parsed value on `request.body`, which the handler uses as it is. Multipart uploads, streaming request bodies, SSE and WebSocket endpoints are not part of this handler; receive an upload in a route of the host and pass the parsed value as `request.body`.
- A form handler returns the outcome as `initialState`, nested by namespace; the URL's parameters are filled in for you, so the plain HTML form works without JavaScript. `url` is the page that shows the outcome: a local path starting with `/`, not `//`, with no backslash or encoded separator at the start. A form may instead answer `{ redirect }` under the same rule. `redirect` is answered with 303 (post/redirect/get), so a reload does not post again. Both outcomes may carry `headers`.
- The framework sets `cache-control: no-store` on a form response; its `headers` cannot set `location` or `cache-control`, and `transformResponse` can replace the framework's cache header, but a form response must not be made cacheable.
- The browser side of the same feature is a `resources` entry in the page's namespace. Keep the validation rules in one pure module imported by both.

To give one URL under a parameter page its own page, add a folder next to it (`pages/item/archived/page.js`). It wins for that URL, and the parameter page keeps the rest.

### Head

`head` in `page.js` is everything the page says about the document around its app. Every value may be a literal or a function of the state snapshot (the same `state` as in `ready` and `status`).

```js
head: {
  title: (state) => state.item.name,                          // required: string | (state) => string
  description: 'About the item',                              // string | (state) => string; written as <meta name="description">
  html: { lang: 'en', class: (state) => state.theme.name },   // attributes of <html>
  body: { 'data-page': 'item' },                              // attributes of <body>
  tags: [                                                     // elements of <head>: meta, link, base, script, style
    { tag: 'meta', props: { property: 'og:title', content: (state) => state.item.name } },
    { tag: 'link', props: { rel: 'canonical', href: (state) => `https://example.com/item/${state.item.id}` } },
    { tag: 'script', props: { type: 'application/ld+json' }, children: (state) => ({ '@type': 'Product', name: state.item.name }) },
  ],
  bodyTags: [{ tag: 'script', props: { src: '/analytics.js', defer: true } }],   // elements at the end of <body>: meta, link, script, style
}
```

- An element is `{ tag, props, children }`, as in the spec. A prop that is `false`, `null` or `undefined` is left out and `true` writes the attribute bare (`defer`).
- **The server writes it while it renders.** `describePage(state)` returns the resolved description (`{ title, description, html, body, tags, bodyTags }`), and the build and `createSsrHandler` write it into every prerendered or rendered document: the title, the description meta tag, the attributes on `<html>` and `<body>`, the elements between two `agent-ui-head` comments at the end of `<head>`, and between two `agent-ui-body` comments at the end of `<body>`. A document written by the build is the template a per-request render fills in again, so writing twice gives the same document, and an attribute or element a later state no longer asks for is removed. The page's `lang` replaces the build's default `lang="en"`; an attribute the template has itself is replaced by the page's and is not restored when a later render stops asking, which is why every render starts from the shell (`<name>.html`), as the build and `createSsrHandler` do. A `base` is written at the end of `<head>`, so it does not change URLs written earlier in it (stylesheets in the template); put URLs that must follow it after, or write them absolute.
- **The browser keeps it current.** The title always follows the state. The rest follows it through the plugin `withHead` (`import { withHead } from '@ehtb/agent-ui/head'`, listed as `plugins: [withHead]`): the description, the attributes of `<html>` and `<body>`, and `meta` and `link` elements. A page that has such a value as a function of the state and no `withHead` is refused when it is defined, because the browser would keep the server's value without anyone saying so. A page with literals only, or whose changing parts are the title, downloads none of it. A `script`, `style` or `base` is written when the document is written (by the server, or by a soft navigation that copies it) and has literal attributes, so `withHead` never touches it; that includes the text of a data script built from the state (JSON-LD), which is the state at the moment the document was written and is not rewritten later. `withHead` re-reads the whole head on every change of any key, because a head function may read any of the state; it writes only what differs, so an unrelated write costs the head functions and not the document. A soft navigation (section 13, "Shell and soft navigation") copies the whole head of the document it fetched, including those elements, so a page reached by a soft link needs `withHead` only for what follows its state; a page that is not rendered on a server (the development server) has no such elements.
- **Text is escaped for where it goes.** The text of a `script` of type `application/ld+json`, `application/json`, `importmap` or `speculationrules` may be built from the state (a string or any JSON value) and is escaped so no state value can end the script. The text of any other `script`, and of a `style`, is a literal string, and one that contains `</script`, `</style` or `<!--` is refused.
- **Checked when the page is defined**: unknown keys (with a suggestion), a tag that does not belong (`title` is `head.title`, a meta description is `head.description`, a charset is written by the framework), `on*` attributes (handlers are actions), a binding object where a function is meant, a function in a `script`, `style` or `base`, children on a `meta` or `link`, and a `script` with both `src` and children. At render an unsafe `href`/`src` stops with the attribute named.
- **Attribute names are lower case** (`charset`, `http-equiv`, `crossorigin`, not `charSet`): HTML names are case-insensitive, and one spelling keeps the URL checks and the reserved-name checks exact. A name with an upper case letter is refused when the page is defined.
- Not in `head`: the document's `<meta charset>`, the viewport, the page's stylesheets and the entry script. The build writes those.

### Check

`agent-ui check` (`--config=<file>`) renders every page in development mode, a page with parameters at the URLs its view.js lists in `paths`. It reports spec problems, action and resource errors, data that never loaded, missing titles, an invalid `status`, and links that lead nowhere in one list, and exits with code 1 when anything is wrong. It prints a table of what each URL it rendered costs: the elements shown (page and shell), the rows of the largest list, the bytes of the state script. `budgets` in `build.config.mjs` (`stateBytes`, `elements`, `listRows`) turn a page over a limit into a problem (`BUILD.md`, "Budgets"). `checkProject` returns the same numbers as `measurements`.

## 14. Limits and what is deliberately not here

Not built, with reasons (details in `DESIGN.md`):

- Component instances with their own state or lifecycle. Use `expandComponents` for markup and a namespace mounted under several names for state logic.
- A modal, popover, menu or tooltip component with a focus trap. A native `dialog` plus explicit state is the one form; copy recipe `modal`, whose plugin traps and restores the focus and marks the background `inert`.
- Refs in the view, and effects that are not a `resources` entry or a plugin. A plugin claims an element with `mountElement`.
- Scoped CSS or CSS-in-JS. Plain stylesheets keep selectors greppable.
- A template language. The spec is the template language.
- Two-way binding sugar. An explicit one-line action keeps one writer path.
- Directive systems.
- Node-adopting hydration. Replacement keeps one render path.
- Patching a module in place. `agent-ui dev` swaps a whole page instead (section 12), starting it from the state the old one had.
- Non-DOM renderers.
- A session store, an auth flow, a CSP policy or a cache layer. `createSsrHandler` exposes the request and three hooks (`initialStateFor`, `stateForBrowser`, `transformResponse`); the project owns the cookie format, the login route and the policy. Shipping one would choose them for every app.
- Streaming server rendering and partial hydration. A page is rendered to one string after it is ready (or answered 503 on timeout by default); there is no stream of earlier markup and no hydration of a partial tree. The state script is the whole handover.
- File uploads, streaming request bodies, Server-Sent Events and WebSocket endpoints. `createSsrHandler` reads a JSON or URL-encoded body once, up to `maxBodyBytes`; a host that needs multipart, a raw stream or a long-lived connection receives it in its own route and passes parsed data as `request.body`, or serves it beside the handler.
- Internationalization and right-to-left layout as framework features. Text and direction are ordinary state and attributes; a project decides how it translates, stores a locale and sets `dir`. The framework ships no message catalogue and no locale-aware URL scheme.
- A cross-page transition, and scroll positions inside scrolling containers across a soft navigation (the window's position is restored on back and forward).
- A built-in load benchmark or cross-browser test matrix. Cost is counted, not timed: `measureAction`/`assertCost` in tests, the page table of `agent-ui check` and the build, and `budgets`. A few tests drive Chrome; Firefox and Safari are not run.

Known limits:

- Derived lists are recomputed in full (O(n)) when their dependencies change.
- There is no virtualization. Very long lists render every row.
- `{item}` in a nested `each` reads only the innermost row. An outer row is read with `as` and `{row}`.
- A select's `value` is not re-applied when its options change after mount.
- SVG is a closed subset for icons and simple drawings (section 3, "SVG"); no `text`, gradients, filters, canvas or media tags. Events are limited to the list in section 3.
- `tree()` and `outline()` read the DOM, so they reflect what is rendered.
- Typed-but-unsubmitted input and the focus are carried over when server markup is replaced, by `data-id`; scroll positions inside scrolling containers and running animations are not.

**Proposed** (not built): undo and redo on the action log, frozen derived outputs, a text rendering of `outline()` for review, and list virtualization if real apps need it.
