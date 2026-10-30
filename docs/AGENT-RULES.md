# agent-ui: rules for an agent building an app

This is the short operating manual for an agent that writes an app with agent-ui. Read it before you write a page. Then read `GUIDE.md` (how pages, URLs, APIs and forms fit together) and use `API.md` as the reference. `agent-ui explain` prints a recipe from `cookbook/` or the one valid form of a part of the grammar.

The `AGENTS.md` at the root of the framework repository is for work on the framework itself, not for building an app; it is not published.

## 1. Start here

1. Run `agent-ui explain` and copy the recipe closest to the task. A recipe is a page that `agent-ui check` renders and the tests drive; start from it instead of from memory of another framework. `agent-ui explain <name>` prints the files.
2. A page is a URL and two files: `pages/<url>/page.js` (behavior) and `pages/<url>/view.js` (content). `/` is `pages/page.js`; `/event/:id` is `pages/event/[id]/page.js`; `/docs/*path` is `pages/docs/[...path]/page.js`.
3. Change state through named, typed actions only. The spec holds no logic.
4. Run `agent-ui check` before you finish: it renders every page whose URL has no parameters, validates every finished spec, and reports spec, link and data problems together. Fix every line it prints.
5. Test with the agent API: dispatch actions, `await ui.settle()`, assert `ui.state()`, `ui.derived()`, `ui.outline()` and `ui.tree()`, and call `assertNoErrors(ui)`.

Every validator message has the place, the problem and the fix, and an unknown key gets a "Did you mean" suggestion. Fix the spec at the path it names; do not suppress the check.

## 2. The model

- **The UI is a JSON spec**, written with the builders of `@ehtb/agent-ui/spec`. The builders return the JSON the runtime, the server and the tests see.
- **State is plain JSON in namespaces.** Every state key, derived value and action belongs to one namespace (`todos.draft`, `todos.add`). Replace values, never mutate them.
- **Only actions write state**, and an action writes only its own namespace. Cross-namespace changes go through declared `calls`.
- **Everything external is a plugin**: network, timers, window events, an editor. Plugins talk to the app only through `api.watch` and `api.dispatch`, so every state change is a logged action.
- **Every list has a stable, unique key.** A duplicate drops the later item; `agent-ui check` and the mount check report it.

The flow is one way: state, then `derive`, then spec bindings, then one DOM property. Events go back only as `[actionName, args]` handlers.

## 3. A page

`page.js` is behavior only:

```js
export const page = {
  head: { title: 'Todos' },        // required; also description, html, body, tags, bodyTags
  namespaces: { todos },           // everything the page keeps in state
  plugins: [withResources],        // what the page needs from outside its state
  ready: (state) => true,          // optional: the server waits for this before it renders
  status: (state) => 200,          // optional: the HTTP status for the URL
  shell: mainShell,                // optional: the header/footer that stays across links
  debug: false,                    // optional: the console panel in the browser
};
```

`view.js` exports `view` (required) and optionally `layout`, `pending` and the content of the shell. In a production build, only the server and the build import `view.js`: the browser gets the finished spec as data, so it never downloads the builders. A development build imports `view.js` in the browser too, so the spec is rebuilt from source.

Styles: `pages/<url>/page.css` is that page's CSS; `pages/style.css` is every page's CSS. Both may start with `@import "./file.css";` for CSS shared with a few pages; the build links a file imported by a subset of pages only to those pages (`BUILD.md`, "CSS imports"). Never import CSS from `page.js`, `view.js` or a component: those run in Node.

Keep `window` and `fetch` injectable where you write a helper, so tests run headless.

**Server state, headers and a session.** A page renders from its own state. The render server (`createSsrHandler`) reads the request once and gives it to `api.handle`, `api.handleForm`, `initialStateFor`, `transformResponse` and `fetchFunction(url, init, request)`; `initialStateFor(request)` returns public state the page starts from, and `transformResponse(request, { status, headers, body })` returns `{ headers?, body? }` to add response headers or rewrite the body (for example a CSP nonce). The framework has no session store, login flow, authorization or CSP policy: keep a session token in an `HttpOnly` cookie set by the API or a form, put only public data in `initialStateFor`, and check the cookie or CSRF token in the handler that changes state. A page cannot set response headers; API and form outcomes and `transformResponse` can set a cookie. The host sends `vary: cookie` or `cache-control: private` from `transformResponse` for a page whose state depends on the visitor; `no-cache` alone does not separate visitors in a shared cache. See `GUIDE.md`, "A session, a CSP and response headers".

## 4. State and actions

```js
export const todos = {
  state: { items: [], draft: '' },
  derive: {
    remaining: (get) => get('items').filter((todo) => !todo.done).length,
  },
  actions: {
    add: {
      args: { title: 'string' },
      run: (store, { title }) => store.set('items', [...store.get('items'), { id: store.get('items').length + 1, title, done: false }]),
    },
    setDraft: { args: { value: 'string' }, run: (store, { value }) => store.set('draft', value) },
  },
};
```

- Names are identifiers: letters and digits, starting with a lowercase letter, no dots or dashes.
- Argument types are `'string'`, `'number'`, `'boolean'`, `'json'`; pass exactly the declared arguments in a handler.
- `derive` functions are pure and synchronous. Own keys are plain (`get('items')`); another namespace is read qualified (`get('search.query')`), never written.
- To change another namespace, list its action in `calls` and run `call('search.clear', {})`. The owner does the writing, one level only, and the whole thing is one log entry that is undone if any part throws.
- Keep state JSON-serializable: strings, numbers, booleans, null, arrays, plain objects. No functions, `Date`, `Map`, `Set` or class instances.
- No `Date.now()` or `Math.random()` in an action: replay must be deterministic. Counters and ids live in state.
- A row's own state (open, selected, a draft) is `rowState` in the namespace, written with `store.setRow(id, { open: true })` and read with `rowState('todos.open')`. Call `clearRow` from the removing action through `calls`.
- A nested `each` that needs an outer row names it: `each(source, key, template, { as: 'order' })`, read with `row('order.id')`. Do not copy outer fields into inner items.
- Format numbers, dates and money in `derive` with `Intl`, one row per item, and use `memoizeItem` so one change formats one item (recipe `format-values`). The grammar has no formatting operators.

## 5. The view

Write the spec with builders, never by hand:

```js
import { act, button, div, each, event, h2, input, item, p, state } from '@ehtb/agent-ui/spec';

div({ id: 'todos' },
  h2(null, 'Todos'),
  input({ 'aria-label': 'New todo', value: state('todos.draft'), on: { input: act('todos.setDraft', { value: event('target.value') }) } }),
  button({ on: { click: act('todos.add', { title: state('todos.draft') }) } }, 'Add'),
  p(null, state('todos.remaining'), ' left'),
  each('todos.items', 'id', p({ id: 'todo' }, item('title'))),
);
```

- `id` is the element's address in the spec; `domId` is the HTML `id`. Give anything a test or another agent addresses an explicit, unique `id`.
- `each(source, key, template)` needs a key that is unique across the whole list and never missing, also in lists built in `derive` or `initialState` and in a `when` branch that is not shown yet. `'.'` is the key for lists of strings or numbers.
- `when(condition, children, otherwise)` renders only one branch.
- A handler is `act('namespace.verb', args)`; a list runs in order, each logged. Keys are `'keydown.Enter'` and `'keydown.Control+Shift+k'`; options are `{ preventDefault, stopPropagation }`.
- Inputs, selects and textareas need `aria-label`; images need `alt`; buttons and links need text or a label; no `javascript:` URL is allowed. The validator checks these at mount.
- Dragging is pointer events calling actions. There is no `dragstart`, `drop` or `dataTransfer`; copy recipe `drag-reorder`, including its keyboard path and Escape.
- A link is a page load. `a({ href: '/about', soft: true }, 'About')` makes it faster inside a shell, and `route.go` does the same from a button; it only works when the target page has the same shell. A swap focuses the page region named by the new title; put `domId: 'agent-ui-announcer'` and `aria-live: 'polite'` on a live region in the shell if the site should also announce it politely.
- A dialog is a native `dialog` plus explicit open state; copy recipe `modal` for the focus trap, focus restore and `inert` background. The framework has no modal component.

## 6. Network and plugins

A `resources` entry belongs to the namespace that declares it, next to its `actions`:

```js
resources: [
  {
    watch: ['filter'],
    request: ({ filter }) => ({ url: `/api/todos?filter=${filter}` }),
    onStart: 'loading',
    onSuccess: 'loaded',
    onError: 'failed',
    owns: ['items', 'status'],
  },
]
```

The lifecycle actions are the only writers of the owned keys, and the response is in the action log, so `ui.replay(log)` reproduces the state without a network call. Change a watched key to restart the request (a retry flips a flag); `onIdle` clears owned state when `request` returns `null`.

A page rendered on the server already holds its resources' output. By default the browser loads it again on mount; add `revalidate: 'never'` (with `owns`) when that output is complete and fresh enough for the first paint, so the first mount trusts the document and a later watched change still loads. Do not combine it with `onTimeout: 'serve'`, whose state may be partial.

Everything else external is a plugin:

- It is `(environment) => (api) => void`, reads with `api.watch(keys, callback)` and writes with `api.dispatch(name, args)`.
- It checks `api.replaying` before it acts, and registers `api.onReplay` to drop a request or timer in flight.
- The server runs the page's plugins too, against a stand-in window. A plugin with a timer, a window listener, a request or a browser-only library starts with `if (isServerRendering) return;` (a field of the environment). Copy recipe `browser-only-plugin`.
- To draw into an element (a chart, an editor), call `mountElement(api, 'element-id', (element, { key }) => cleanup)` from `@ehtb/agent-ui/mount-element`. The element has an explicit `id` and no children in the spec; events go back through `api.dispatch`. Copy recipe `draw-into-element`.
- Never write state from a plugin callback, a binding or an event handler, and never read state from the DOM.

## 7. Verify

`agent-ui check` validates every page's finished spec, every literal link and the data the page loads, without a browser. It reports a duplicate or missing list key anywhere in the spec. Run it before you finish.

In a test, use the agent API:

```js
ui.dispatch('todos.add', { title: 'milk' });
await ui.settle();
assert.deepEqual(ui.derived().todos.remaining, 1);
assertNoErrors(ui);
```

- `ui.state()`, `ui.derived()`, `ui.outline()`, `ui.tree()`, `ui.log`, `ui.errors` and `ui.replaying` are JSON or plain values.
- `await ui.settle()` before asserting on the DOM or `outline()`. `flushAsync(ui)` when a fetch is involved.
- `assertNoErrors(ui)` after `await ui.settle()` and after the step that opens a branch: a list inside a branch the first render did not show is checked at mount only on the data it has then.
- `assertRepeatable(ui, action, args)` on idempotent user actions such as selection, filters and form lookup.
- Replay reproduces state from the action log, including the answers resources wrote. It does not replay plugin or DOM side effects (an editor's content, a chart's drawing); test those in a browser with `@ehtb/agent-ui/testing/browser.mjs`.
- Keep a bug as a regression test: record the actions in `ui.log` and replay them with `ui.replay(log)`.

## 8. The mistakes that cost the most

- A list without a key, a duplicate key, or a key that changes when the item is edited. The row is reused by key.
- State mutation in place (`items.push(...)`) instead of a replacement (`[...items, item]`).
- Writing another namespace directly instead of through `calls`, or doing `fetch`/timers inside an action instead of a resource or plugin.
- A handler invented on the spot: declare the action and its arguments first.
- A literal `href` that starts with `/` and is not a page, a file in `publicDir` or an API path. `agent-ui check` reports it.
- `export *`, re-exports or default imports/exports in your own files, which the bundler does not support. Use named imports and relative paths with the extension. A package written with `export *` (zod, Tiptap) is imported by name and, for the browser, given a one-file esbuild build through `replaceModules` (BUILD.md, "Vendor files").
- Editing `dist/` or `.agent-ui/`: both are generated. Change the source and rebuild.
- A session token in state: the state is in the document and reaches the browser. Keep it in an `HttpOnly` cookie set by the API or a form, and put only public data in `initialStateFor`.
- Forgetting that a page is server-rendered: a plugin with a timer, a listener or a request runs on the server too, against a stand-in window, so guard it with `isServerRendering`; a library that touches `window` when it is imported fails on the server, so import it dynamically.

## 9. What is deliberately not here

- No client-side router. Following a link is a page load; `soft: true` inside a shell makes it faster.
- No browser storage. Durable state lives on the server and is loaded with `resources`.
- No component-local state; per-row state is `rowState`. No scoped CSS.
- No virtualization, undo/redo, streaming SSR or partial hydration.
- No modal/popover component with a focus trap (copy recipe `modal`), no file-upload parser or `multipart` body, and no SSE or WebSocket endpoint. Receive uploads and long-lived connections in the host server.
- No built-in internationalization, locale-aware URLs or right-to-left layout. Text and `dir` are ordinary state and attributes; the project owns the catalogue.
- No scroll restoration on back/forward, and no base path below `/`.
- No TypeScript compile step. The package ships hand-written `.d.ts` files, so `// @ts-check` gives editor checking without a build; `examples/with-typescript` is a checked app.
- No session store, auth flow or CSP policy. The render server passes the request to `initialStateFor` and `transformResponse`; keep the session token in an `HttpOnly` cookie set by the API or a form, and write the policy in your server.

## 10. Work on the framework itself

Changing the runtime, the validator, the bundler, the docs or the cookbook is a different job. Read the `AGENTS.md` at the root of the framework repository, which states the layout, the code style and the rules for changing the grammar.

<!-- agent-ui:project-block:start -->
## agent-ui
This project builds its UI with agent-ui: the UI is a JSON spec, state is plain data in namespaces, and behavior goes through named, typed actions.
Before you write or change a page, read `node_modules/{package}/docs/AGENT-RULES.md` (the short rules) and `node_modules/{package}/docs/GUIDE.md` (how pages, URLs and endpoints fit).
- Run `agent-ui explain` and copy the closest recipe; `agent-ui explain <recipe or topic>` prints its files or the one valid form.
- Every list (`each`) has a `key` that is unique across the whole list and never missing: also in lists built in `derive` or `initialState`, and inside `when` branches that are not shown at first. A duplicate drops the later item.
- State changes only through actions, and an action writes only its own namespace (anything else goes through `calls`). Declare every action argument.
- Give an explicit, unique `id` to anything a test or another agent addresses.
- A page cannot set response headers. The render server's `initialStateFor`, `stateForBrowser` and `transformResponse` hooks supply public session state, choose what the state script carries, and set response headers or a body rewrite. Keep a session token in an `HttpOnly` cookie set by the API or a form, never in state; the framework has no session store or CSP policy of its own. A page whose state depends on `initialStateFor` gets `vary: cookie` or `cache-control: private` from `transformResponse`.
- A page rendered on the server already holds its resources' output. Add `revalidate: 'never'` with `owns` when the browser should trust it instead of loading it again on mount.
- Run `agent-ui check` before you finish and fix every line it prints. In tests, call `assertNoErrors(ui)` after `await ui.settle()` and after the step that opens a branch.
- Dragging a row is pointer events calling actions; there is no drag-and-drop API (`dragstart`, `drop`, `dataTransfer`). Copy recipe `drag-reorder` (`agent-ui explain drag-reorder`), including its keyboard path and Escape.
- A dialog is a native `dialog` plus explicit open state; copy recipe `modal` for the focus trap, focus restore and `inert` background. A soft link focuses the page region named by the new title; put `domId: 'agent-ui-announcer'` and `aria-live: 'polite'` on a live region in the shell for a polite announcement too.
- The server runs the plugins of a page too, against a stand-in window. A plugin with a timer, a window listener, a request or a browser-only library starts with `if (isServerRendering) return;` (a field of the plugin's environment); copy recipe `browser-only-plugin`.
- Never edit `dist/`; change the source and rebuild.
<!-- agent-ui:project-block:end -->
