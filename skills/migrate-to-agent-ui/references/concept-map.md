# Concept map: what a construct of an old app becomes

Framework-neutral. Find the row that describes what the old code **does**, not what the old library calls it. Imports are by package name (`@ehtb/agent-ui/...`). The exact grammar is in `docs/API.md`; `agent-ui explain <topic>` prints the one valid form of a part.

## 1. Structure

| The old app has | In agent-ui |
|---|---|
| A route table, file-based routes or a router component | One folder per URL below `pages/`: `pages/about/page.js` + `view.js` is `/about`, `pages/event/[id]/page.js` is `/event/:id`, `[...path]` is a catch-all. Nothing lists the pages. |
| Route parameters, query string | `{ state: 'route.params.id' }` in the view, `get('route.params')` in `derive`. |
| A link that navigates without a page load | `a({ href: '/x' })` is a page load. `a({ href: '/x', soft: true })` inside a shell replaces only the page. A button: `act('route.go', { href: '/x' })`. |
| A redirect | Answered by the host or your own server (`_redirects`, the server in front). There is no client-side redirect; if it depends on state, put it on the decisions list. |
| A not-found route | `pages/[...path]/page.js` with `status: () => 404`, and `isNotFound` derived in pages with parameters. |
| A shared layout | `export const layout = (content) => spec` in `view.js`, imported from one module. |
| Chrome that must stay mounted (header with live state, a player) | A shell: `defineShell` from `@ehtb/agent-ui/shell`, `withNavigation`, `soft: true` links. Recipe `soft-shell`. |
| The document `<title>`, meta, `<html lang>` | `head` in `page.js`; a function of state needs `withHead` from `@ehtb/agent-ui/head`. |
| Server rendering, static export | Built in. `agent-ui build` pre-renders what it can; `agent-ui serve` or `createSsrHandler` renders per request. `ready`, `pending` and `status` on the page replace loading-state plumbing. |

## 2. Markup

| The old app has | In agent-ui |
|---|---|
| A template or element tree | Builders: `div({ id: 'box', class: 'card' }, 'text', child)`. First argument is the attributes or `null`. |
| Interpolated value | `state('namespace.key')`, `item('field')` in a list, `row('name.field')` for an outer row, `join(a, b, ...)` to build text. |
| Conditional | `when(condition, children, otherwise)`; conditions from `equals`, `not`, `and`, `or`, `greaterThan`, `length`. Anything over a whole list is a derived value. |
| A list render | `each(source, 'key', template, { as })`. The key is unique and stable (`'.'` for strings and numbers). |
| A class that depends on state | `classes: { done: item('done') }`, or `class: join(...)`. |
| Inline event handler | `on: { click: act('ns.verb', { arg: value }) }`. Event data: `event('target.value')`. Key chords: `'keydown.Enter'`. A list of handlers is allowed. No logic in the handler. |
| Two-way bound input | `value: state('ns.draft')` plus `on: { input: act('ns.setDraft', { value: event('target.value') }) }`. Two lines, on purpose. |
| Props, variants, default props | `defineElement(name, { params, spec })`; `param('x')`, `paramKey('variant')`, `slot()`. Variants are literals at the use. See `docs/CONVERTING.md`. |
| Children / slots | `slot()`; one slot. For more regions, pass nodes as `node` params. |
| Fragment | An array of children. |
| Raw HTML injection | Not available. Model the content as spec, or put it on the decisions list. |
| Refs to focus an element | Give it an `id`; `focus: true` focuses it. |
| Icons | Text, an inline image with `alt`, or a `children` node. SVG tags are not in the grammar: see section 6. |

## 3. State

| The old app has | In agent-ui |
|---|---|
| Component-local state (open, hover, draft, selected) | A `state` key of a namespace named for the concern (`editing.id`, `sidebar.open`). Per list row: `rowState: { open: false }` and `rowState('ns.open')` in the row; write with `store.setRow(id, {...})`. |
| Global store, context, signals shared across components | The same: namespaces, read by qualified key (`state('cart.count')`). There is no provider tree. |
| A reducer or a setter | An action: `{ args: { id: 'number' }, run: (store, { id }) => store.set('items', ...) }`. Replace, never mutate. |
| Selector, computed, memo | `derive: { remaining: (get) => get('items').filter(...).length }`. Pure and synchronous. `memoizeItem` for expensive per-item work. |
| A change that touches two stores | The action lists the other namespace's action in `calls` and runs `call('other.verb', {...})`. One level only. |
| The same logic used by several components (a hook, a mixin, a composable) | A namespace (or a function returning one from options) mounted under several names: `namespaces: { email: textField({ validate }), password: textField({ validate }) }`. |
| A server-state cache (fetch-and-cache library) | A `resources` entry in the namespace; its output is owned by lifecycle actions. See section 4. |
| State kept in the URL | `route.params`; anything else on the server. |
| State kept in browser storage | Server state loaded with `resources`. Decision needed (section 6). |
| Ids and counters generated with the clock or randomness | Counters live in state (`nextId`); ids that must be unique come from the server or from an event. |

Names: namespaces and keys are identifiers (letters and digits, lowercase first), no dots or dashes. State must be JSON: no `Date`, `Map`, `Set`, class instances or functions. Store timestamps as numbers or strings from the server.

## 4. Data and effects

| The old app has | In agent-ui |
|---|---|
| Fetch on mount or when inputs change | `resources: [{ watch: ['key'], owns: [...], request: (get) => ({ url }), onStart, onSuccess, onError }]` in the namespace, `plugins: [withResources]` on the page. Recipe `async-list`. |
| Retry | Change a watched key (`attempt + 1`). |
| Request that may be absent | `request` returns `null`; `onIdle` clears owned state. |
| A mutation (POST, PUT, DELETE) | A resource whose watched key is a queue or a flag; the lifecycle actions update state. A mutation must not be lost on double click: send the head of a list and remove it on success. |
| Loading and error UI | State (`status: 'idle' | 'loading' | 'ready' | 'failed'`) shown with `when`; on the page, `ready`, `pending`, `status`. |
| Optimistic update | An action that writes the expected state, and a failure action that restores it. Both are logged. |
| Timer, interval, debounce | A plugin: `(api) => { ...; api.dispatch('ns.tick', {}) }`. Quiet while `api.replaying`. |
| Window or document listeners (resize, keyboard shortcuts, online) | `windowEvents` from `@ehtb/agent-ui/window-events`. |
| Intersection or resize observers | A plugin using `api.watch` and `api.dispatch`. |
| A drawing library (chart, editor, map) | A plugin that calls `mountElement(api, 'element-id', (element, { key }) => cleanup)`; the element has an explicit id and no children in the spec. Recipe `draw-into-element`. |
| Analytics, error reporting | A plugin; `api.onError`. See `docs/GUIDE.md`, "Reporting errors". |
| Sockets, server-sent events | A plugin that dispatches actions for each message. Write it small and test it with a fake. |

## 5. Forms, server and styling

| The old app has | In agent-ui |
|---|---|
| Controlled form with validation | A field namespace (`value`, `touched`, derived `error`, `invalid`) and a form-level derived `canSubmit`. Recipe `form-validation`. Validation rules in one pure module imported by browser, endpoint and form handler. |
| Form that works without JavaScript | `form({ method: 'post', action: '/page/url' })`, named fields, a `forms` handler in the page's `api.js` returning `{ status, url, initialState }`. |
| API route or server handler | `api.js` next to the page: `{ endpoints: { 'POST /:id/x': ({ params, body }) => ({ status, body }) }, forms, reset }`, composed in the project's `api` module. Or keep the existing server and mount `createSsrHandler` after its own routes. |
| Sessions, authentication | Stay on the server. The page loads the current user with a resource; pages that need a user render a sign-in state when it is absent. Decision needed if the old app redirects on the client. |
| Stylesheets, preprocessors | Plain CSS: `pages/style.css` for all pages, `pages/<url>/page.css` per page. Keep the old class names where possible so the CSS ports unchanged. |
| Utility-class framework | Keep it as the project's own build step (see `examples/with-tailwind`), or write plain CSS. |
| CSS modules, CSS-in-JS, scoped styles | Not available. Rename to plain, greppable class names. |
| Images, fonts, static files | `public/` is copied to the site root. |
| Environment config | Read in `build.config.mjs` or on the server; never in a namespace. |
| i18n | Messages as data in a namespace or loaded by a resource; a `derive` picks the text. Format with `Intl` in `derive`. |

## 6. Not available (put on the decisions list)

| Old behavior | Why, and the options |
|---|---|
| Client-side routing without a page load | There is no client router. Options: accept page loads; use a shell with `soft: true` links (faster swap, same semantics). |
| Browser-stored state (cookies, local storage) as the source of truth | No browser storage. Options: move it to the server (a resource), or accept that it resets on each load. |
| Component instances with their own state and lifecycle | Not built. Options: a namespace addressed by id; `rowState` per row; a namespace mounted under several names. |
| Refs, imperative handles | Not built. Option: an `id` and `focus: true`; a plugin for libraries. |
| Portals, tooltips and popovers placed by a positioning library | Content renders in place; CSS positions it. Native `dialog` and `details` for overlays. Recipe `modal`. Say so in `MIGRATION.md`. |
| Virtualized lists | Not built; every row renders. Option: paginate in `derive`, or ask for the feature. |
| HTML5 drag and drop | Not in the grammar. Recipe `drag-reorder` (pointer events). |
| SVG, canvas, video, audio elements | Not in the grammar. Option: a plugin drawing into one element, or an `img` pointing at a file. |
| Raw HTML strings | Not available. Model as spec. |
| Scoped CSS, CSS-in-JS | Not available. |
| Template DSL, directives, two-way binding sugar | Not built, on purpose. |
| Undo and redo | Proposed, not built. Option: an action that restores a snapshot kept in state. |
| Time and randomness in logic | Not allowed in actions. Option: the value arrives as an argument (from a resource or an event) and is stored. |

When a row says "ask for the feature", stop and say so to the user; adding it means changing the runtime, validator, docs and tests together.

## 7. Worked example: local state plus an effect

Old behavior: a component keeps a list and a draft, loads the list when it appears, adds an item on submit, and shows a count.

```js
// pages/notes/page.js
import { withResources } from '@ehtb/agent-ui/resources';

const notes = {
  state: { items: [], status: 'idle', error: '', attempt: 0 },
  derive: { count: (get) => get('items').length },
  actions: {
    loading: { args: {}, run: (store) => { store.set('status', 'loading'); store.set('error', ''); } },
    loaded: { args: { data: 'json' }, run: (store, { data }) => { store.set('items', data); store.set('status', 'ready'); } },
    failed: { args: { message: 'string' }, run: (store, { message }) => { store.set('status', 'failed'); store.set('error', message); } },
  },
  resources: [{ watch: ['attempt'], owns: ['items', 'status', 'error'], request: () => ({ url: '/api/notes' }), onStart: 'loading', onSuccess: 'loaded', onError: 'failed' }],
};
const composer = { state: { draft: '' }, actions: { setDraft: { args: { value: 'string' }, run: (store, { value }) => store.set('draft', value) } } };

export const page = {
  head: { title: 'Notes' },
  namespaces: { notes, composer },
  plugins: [withResources],
  ready: (state) => state.notes.status === 'ready' || state.notes.status === 'failed',
};
```

The old component became two namespaces and a page, the effect became a resource, the count became `derive`, and the view reads them with `state('notes.count')` and `each('notes.items', 'id', ...)`. Adding an item that must persist is a mutation (section 4): the draft is cleared and the request sent through a resource, not a local write.
