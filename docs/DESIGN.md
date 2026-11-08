# agent-ui: design, evidence, and open questions

Reader: an agent or human deciding whether and how to extend this. Working rules for an app author are in `AGENT-RULES.md` (in this folder), exact semantics in `API.md`, bundling in `BUILD.md`. Claims marked **[hypothesis]** are untested. Everything under "Evidence" was run in this repository.

## 1. Thesis

A UI framework does three things. It keeps the page in sync with the state. It offers aids for the person writing the code, such as components, template syntax, tooling and conventions. And it comes with an ecosystem. An agent needs the first, partly needs the third, and mostly does not need the second. agent-ui keeps the first small and explicit, and replaces the second with aids a machine can use: a closed grammar, a static validator, JSON introspection, typed actions, and deterministic replay.

The binding constraint in long agentic sessions is **context decay**. The agent forgets earlier decisions and edits code it has only partly read. So the design minimizes what must be remembered to make a correct edit.

Source is written in plain English names and is never minified by us. Minification is a separate, later process over the build output. It does not belong in the source or in the toolchain that agents read.

## 2. Principles

1. **UI is data, not code.** A JSON spec can be validated, diffed, patched and generated. There is no template syntax and there are no closures in the view layer.
2. **Closed grammar, one way to say each thing.** The node kinds are text, binding, element, `each` and `when`. Anything else is a validator error, not a new idiom.
3. **Fail statically, locally, specifically.** Defects the validator can see are reported as `specPath: problem` before mount. Runtime failures become data in `errors`.
4. **Single source of truth, plain data.** State is JSON in signals, updated immutably and frozen in development. Derived values are pure functions. There is no hidden state in closures, the DOM or instances.
5. **One writer path.** Only typed, named actions write state, and handlers hold no logic. That choke point gives logging, replay, validation, testing and exposure to external agents for free.
6. **Determinism.** The same initial state plus the same action log gives the same state and DOM. Ids and counters live in state. There are no clocks and no randomness in actions.
7. **Fine-grained updates, no diffing.** One effect per binding writes one DOM property. Keyed rows are reused. Events are delegated.
8. **Observable by construction.** State, derived values, action schemas, the log, errors and the interactive surface (`tree()`) are all JSON.
9. **Stable addressing.** `data-id` (explicit or spec path) and `data-key` (row key) identify elements in tests, logs and patches.
10. **Native platform first, small enough to read.** An agent that has read the runtime reasons from source, not from remembered semantics.
11. **Constraint over flexibility.** Add a feature only if it removes a class of errors or is unavoidable. Each addition in section 4 has a concrete need behind it.
12. **Ship runtime and app separately.** Pages load the runtime as a separately cached chunk plus their own small chunks and CSS files (section 3 and `BUILD.md`).
13. **Accuracy over interpretation.** The code states what to write and rejects everything else. Each shape is fixed: pages, API tables, build options. Unknown keys are errors with a suggestion, and every error says where, what, and the fix. An agent that follows the messages converges on the one valid form. `agent-ui check` runs all of it without a browser.

## 3. Evidence (what exists today)

**Build pipeline** (`build/`, no dependencies). The runtime is its own chunk, each page has its own entry chunk and CSS file, a lazy `devtools` chunk loads only for an app made with `debug: true`, and shared code is split by owner: the app's in `shared-*` chunks, the rest of the framework in `agent-ui-*` chunks, each npm package in `vendor-*` chunks. Tests cover the chunking rules, cache behaviour (changing app code leaves the runtime, framework and package file names unchanged), readable output, running built chunks including a lazy chunk and its injected CSS, a catalogue of unsupported-syntax errors, and the development and production presets.

**Tests.** Everything runs headless with `npm test`: the framework tests in `test/` and the example apps in `examples/`, which add conformance and end-to-end tests from the outside (`examples/README.md`). A mutation sanity check caught 11 of 11 deliberate runtime bugs.

**Size.** Production output has comments and indentation stripped, identifiers untouched and the validator omitted.

| Build | Runtime chunk | Validator chunk |
|---|---|---|
| Production | 46.3 KB raw, 12.6 KB gzip | omitted |
| Development | 149.2 KB raw, 43.9 KB gzip | 74.1 KB raw, 21.6 KB gzip |

In development the runtime chunk holds all of the framework's own modules (`src/**`), so that the hot swap of a page never evaluates `src/pages.js` twice; those modules used to sit in each page's chunk, so what a development page downloads is the same (227 KB for `examples/basic` when it was measured, 4 KB of it the page). The runtime size sentence is measured with `agent-ui build` on `test/fixtures/shell-site`; `test/docs.test.mjs` fails when the sentence in the README drifts more than 1 KB from a real build. The production runtime grew by about 2 KB raw (0.5 KB gzip) with the fixes of the review that followed (derived values are recomputed before anything reads them, a loop between them is found when it forms, a replay plays no transitions and no events; it was 44.0 KB raw, 12.1 KB gzip), by about 1.5 KB raw (0.3 KB gzip) when `destroy()` and the `soft` attribute were added for soft navigation (it was 34.2 KB raw, 9.7 KB gzip), and by about 4 KB raw (1 KB gzip) when `rowState`, `as` / `row` and the element observers were added (it was 35.7 KB raw, 10.0 KB gzip). Of that, the message text of the checks and of the runtime's errors is not in it (`src/runtime-checks.js` and `src/error-messages.js` are stubs in production, and an error there is a code and its details), and `mountElement` is not in it either: it is a module only the plugins that import it carry. Error codes with `onError` / `report`, the `debug` option and the console is turned on by `debug: true` only (a cookie used to do it) and added about 1.5 KB raw (0.4 KB gzip) in total (it was 41.2 KB raw, 11.4 KB gzip), and the fixes of the review that followed (empty option values, rows that leave with a transition, `watch` after a rolled back action, radios) a little more, to the figure in the table. The development chunks also carry the comments of the source. The build report lists every chunk, so re-measure after a change. A page loads only the plugins it imports. A real minifier through the `transform` hook is expected to shrink it further; this is not measured because none is installed in this environment.

**Update cost.** On the shim DOM, with the benchmark in `examples/todomvc`, toggling one list item costs 3.1 DOM mutations at every list size. Latency grows linearly with rows because derived lists are recomputed in full. These are shim numbers, not browser numbers (details in `examples/todomvc/README.md`).

**Fresh-agent usability tests.** Two were run before the second pass, each with a subagent that had only the agent guide and the docs. The first built a contact list. The second built a Kanban board with async load, error and reload, nested lists, forms, search, window shortcuts, route params and an offline banner, and finished with 95 passing tests after about 4 edit-and-test cycles in 304 app lines. Misspelled keys, wrong action arguments and a missing `aria-label` were caught at mount with usable messages. The weakest spots it found: `{item: field}` is not checked against the list's shape, so an outer-row field read inside a nested list is silent until the action fails with "got undefined"; validator paths are long; and three doc statements were wrong or unclear (fixed in `API.md`).

**Agent surface.** Typed argument rejection, deterministic replay with identical state and DOM, dev-mode frozen state that catches in-place mutation inside actions, and `tree()` exposing ids, row keys, bound actions and live input values.

**Component library conversion.** Seven shadcn/ui components (button, badge, card with seven parts, alert, label, input and checkbox) were converted in `examples/react-converted-components`, from the real current sources, which are quoted in the top comment of each converted file. `parity.test.mjs` reads the quote and checks the conversion against it (exports, variants, sizes, defaults, element per `data-slot`), with the deliberate differences listed in one table. shadcn/ui ships no component tests, so the behaviour tests are ours. The procedure is `docs/CONVERTING.md`. Four interactive primitives whose behaviour React takes from a library were added on the same example's `/primitives` page: a popover with a focus trap and an outside-click backdrop (Radix), a combobox (Popover + cmdk's Command), a month-grid date picker (react-day-picker) and a drag-and-drop list (dnd-kit). Each is a namespace — the library's internal state (open, active option, displayed month, dragging item) is state, the render-time values are `derive`, and every interaction is an action — with a component in `ui/` binding to it, exactly as the fields bind to a feature. What is **not** reproduced, and is said so in each header: a portal (content renders in place; CSS positions it), library-grade positioning, and true DOM focus trapping (a focus index plus the `focus` prop stands in). The drag list uses the pointer events added for it (below); the keyboard moves a picked-up row too. Three gaps showed up and were closed with tests: params needed defaults, variants and optional props; a state key with a dot could be declared but never read (now an error); and a derived value read inside an action was stale. Not measured: how an agent fares converting components it has not seen.

**Findings from building real apps.** A todo app from the published TodoMVC specification and a large server-rendered app with forms and end-to-end tests are documented next to the apps, in `examples/todomvc/README.md` and `examples/events/README.md`. Each addition in section 4 exists because one of them needed it. Two framework faults were found that way: a nested `when` or `each` inside a `when` branch could not be removed, and effects of nested branches were not disposed with the enclosing branch. Both are fixed with regression tests.

**The shim against a real browser.** `@ehtb/agent-ui/testing/browser.mjs` drives headless Chrome over the DevTools protocol (no dependency), and two tests use it. `examples/shop/browser.test.mjs` runs soft navigation (history, focus, the document that stays, the stylesheets). `examples/todomvc/browser.test.mjs` runs one user session twice, in the shim and in Chrome, with real mouse, keyboard and text input, and compares `state()`, `derived()` and `outline()` after each of its 12 steps: typing and Enter, a blank entry, a native checkbox, filters, a double click that opens an edit field which takes the focus, Enter that saves, Escape that cancels (a field that is removed while it has the focus), mark all, clear completed. The two agree on every step. The only difference the first run found was `route.hydrated`, which the browser entry sets and a bare `create` does not. That is one session of one app; it is a parity check, not a proof.

**Not done, and why it matters.** No run of the official TodoMVC browser test suite (the npm registry was blocked in the sandbox), no real minifier measured (the `transform` hook takes one, and `examples/events` does), and no controlled comparison: the usability tests had no control group doing the same task with another tool. All performance claims and all "fewer bugs for agents" claims remain **[hypothesis]** until section 6 is run. The DOM shim is hand-written: where it and a browser could differ (IME composition, autofill, pointer capture, layout) nothing has compared them yet.

## 4. Additions, and what is deliberately not built

### Built because an app needed it

Grammar and runtime features exist because an app needed them, not speculatively. The table of what required each is in `examples/todomvc/README.md`.

- `when`, `classes`, `equals` and `not`.
- `dblclick` and `focusout` events. `focusout` exists because `blur` does not bubble and events are delegated.
- The `focus` prop.
- Plugins and `api.watch`. Plugins touch the outside only through `watch` out and `dispatch` in, so the log stays complete.
- Dev-mode deep freeze. In-place mutation is silent otherwise. Already-frozen objects are skipped, so the cost is proportional to what changed.
- `aria-*` boolean handling, so `aria-pressed=false` stays `"false"`.
- A lazy `devtools` chunk.

Added later, to close gaps found by review. Each is a plugin or a closed grammar addition with validator rules and tests:

- Declared async `resources`: three logged actions, last request wins, quiet on replay.
- URL `:params` (now the patterns of the page folders).
- `windowEvents` for resize, keyboard shortcuts, online and offline.
- `patchSpec` by id.
- The `length`, `greaterThan`, `lessThan`, `and`, `or` and `join` operators.
- `{event}` arguments.
- Structural equality on derived values.
- Strict validation of unknown keys, argument names and accessibility.
- `publicDir`.
- The `notes` example, generated from `API.md`.
- Param declarations for components (`default`, `options` for variants, `optional`) and constant folding of `join`, so a shadcn-style library converts without a second mechanism.
- Reusable state logic, the counterpart of custom hooks. First as `combineFeatures` (functions from a name to `{ state, derive, actions }`), then, with namespaces, as a namespace defined once and mounted under several names, which needs no name splicing and cannot collide.
- A derived value read inside an action, or through `derived()`, reflects writes made just before it. Found by the components example, where a submit action read a derived validity flag.
- The six bubbling pointer events (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`, `pointerover`, `pointerout`), so a component can track a pointer drag (a mouse drag; a touch pointer is implicitly captured by the element that received `pointerdown`, so it is the keyboard gesture there). `pointerenter` and `pointerleave` are left out because they do not bubble and events are delegated; `{event: "pointerType"}` distinguishes the input. Added for the drag list in the components example, which had only the keyboard gesture before.
- The `follow` prop (`docs/API.md` "Following the pointer"): while true, the runtime sets `--follow-x`/`--follow-y` from the pointer on that element and CSS applies them. Pointer motion is presentation, so it lives in the runtime like the move animation and never enters the state or the log; the drag list uses it as its drag overlay.

### Patterns that worked

- Idempotent actions. A duplicate browser event, such as `focusout` after an unmount, is a guard clause in the action, not a lifecycle concern.
- `derive` instead of per-row computation, which keeps the spec free of logic.
- Row identity from references, so `each` reuses rows and only changed bindings re-run.
- English names, which cost nothing at runtime.

### Second pass: what the person using the app needs

The first pass deferred several features as "human ergonomics". That was too coarse. The better test is what a feature is for. If it exists because a human typing code finds something tedious, skip it. If it exists because a human using the product needs it, such as real URLs, first paint, crawlers, motion, or reuse that keeps the UI consistent, it stays required. Built in this pass, each reusing existing mechanisms instead of adding a second execution model:

| Feature | Why it is required | How, and what it deliberately is not |
|---|---|---|
| Real URLs | Shareable, crawlable URLs, a normal back button, no `#` | A page is a URL and a URL is a folder (see "Pages and data" below). Following a link is a page load, so the back button, the address bar and crawlers need nothing from the framework; a link marked `soft` makes that load faster without changing what it is ("Soft navigation and the shell" below). This replaced a client-side router (hash and history modes) that the framework used to have. |
| Server rendering and hydration | First paint, search engines, content without JavaScript, link previews | The same `create(env)` runs against a small server DOM (`src/server-dom.js`), so there is one render path. State travels in a JSON script. Hydration is replacement plus restore of focus and typed input by `data-id`, not node adoption: adoption needs a second path kept in lockstep. Data requests while rendering go to the `fetchFunction` of the build config: the framework has no default source of data (files, an API and a running server are all the project's choice, see `docs/BUILD.md`, "Data while rendering"). |
| Transitions | Motion for state changes users need to perceive, such as items appearing and leaving | `transition: ms` sets `data-transition` and delays removal; CSS animates. A keyed row with `transition` that changes position slides to its new place (FLIP through `Element.animate`, `docs/API.md` "Moves"), skipped for replay and reduced motion. State is final immediately, so replay and tests are unaffected. There is no JavaScript animation engine: the browser's does the work. |
| Components | Reuse without copy-paste drift, the typical agent error after context loss | `expandComponents`: a macro pass producing plain spec before validation. No instances, state or lifecycle. Params are checked, and duplicate ids from reuse are caught by the validator. |
| Types and schema | Editor and tool feedback; constrained generation of specs | Hand-written `.d.ts` files checked by `tsc` in a test (types accept real usage and reject four mistakes), and a JSON Schema generated from `grammar` and tested against every spec in the repository. |
| Dev loop | Fast feedback for the human reviewing the UI | `agent-ui dev`: rebuild on change, then the running page is swapped for the edited one and starts from the state the old one had (state is plain data), the stylesheets swap without a reload, and a reload is the fallback. It is a swap of a whole page, not a patch of a module. |

### Still not built, and why

- **Scoped CSS.** Hashing class names hides the real selector from grep and from the agent. Plain stylesheets with a naming convention are easier to audit. The cost is global cascade collisions in large apps; revisit with a build-time collision report.
- **A template language.** The spec is already the template language, and a second grammar needs its own validator.
- **Two-way binding sugar.** Implicit writes bypass the single writer path. An explicit one-line action keeps replay and logging whole.
- **Component instances with local state.** A second state model to remember. Reusable state logic is a feature function instead.
- **Refs in the view, and free-form effects.** An effect is either a `resources` entry or a plugin, so the action log stays complete. What was missing for rich elements (a chart, an editor, a map) was a sanctioned way for a plugin to own one element; it is now `mountElement` (below), bounded so that the one-way flow stays whole. Timers and observers still have no built-in plugin; the hooks table in `API.md` section 12 says where each hook went.
- **A client-side router, and lazy loading inside one page.** Removed after being built. A client router means two ways to say where a page lives (the route list and the entries), namespaces that must exist before the first navigation (so a route's code cannot be split off), a base path to keep in step in three places, and state that silently survives navigation in one tab and is lost in the next. One model replaced it: a page is a URL, a URL is a folder, and every page is its own entry, so splitting is exact, automatic and measured (`examples/shop`, with its sizes and limits in the README). The price is a page load between pages; prerendered HTML, hashed chunks and a shared chunk that is already cached keep it cheap, and anything that must outlive a page lives on the server. The faster hand-over (fetch the next page's document and swap the app, with the same semantics as a page load) was built afterwards without a second routing model: "Soft navigation and the shell" below. Lazy views inside one page were considered and rejected for the same reason as before: only the view could be lazy, its state, actions and resources must stay eager, and it would widen the closed grammar; when one feature of a page is heavy, load it with a plain `import()`.
- **Browser storage for state.** Removed. Durable data and state live on the server, loaded with `resources`: every device and tab sees the same thing, and a page can be rendered with it. The framework cannot tell durable state from transient state, so a storage plugin needed a declaration of what to save, wiring in two places, and validation of what an older version had saved; none of that is needed when the server is the one place. Examples that kept notes or todos in the browser keep them in memory and say so.
- **A session store, an auth flow, a CSP policy, a cache layer.** These are policies of a site, not of the UI model. The render server reads one request and exposes `initialStateFor`, `stateForBrowser` and `transformResponse`; the project owns the session store, the login route, the cookie format and the policy. A framework default would choose all of them for every app and duplicate what a host framework or a CDN already does.
- **Streaming responses.** `createSsrHandler` builds each answer body as one string before it writes it, and `transformResponse` returns the whole replacement. A streaming or incremental response would need a second body contract and a second transform shape; current page sizes are well within one string.
- **Node-adopting hydration and in-place module replacement.** Each is a second code path that must stay in lockstep with the first, for modest gain.

### Friction and honest costs

- The spec is verbose: deeply nested object literals. The validator catches structural errors, not misplaced but valid nodes. A text rendering of the spec tree with ids (**proposed**) would help review.
- Anything needing a comparison other than equality, or any formatting of a number or a date, is a `derive` (formatting: `derive` with `Intl`, per item with `memoizeItem`, `API.md`). The nested list over an outer row's field used to need one too; it is now `as` and `row` (below). If the derive workarounds multiply, the grammar needs more operators, which erodes the closed-grammar benefit; none is planned.
- Default `data-id`s are position-derived, so inserting a sibling renumbers the ones after it. Hence the explicit-id rule and the patch operations by id that build on it.
- The bundler only accepts a restricted module dialect (`BUILD.md`). That is the price of having no parser dependency. A full bundler would lift it and could replace `build/` if the source layout is kept.

### Pages and data: why this shape

Data is already declared through `resources`, and how a page is delivered follows from the page itself (`ready`, `status`). A second place saying "fetch at build time" would be a second source of truth, so there is none. What a page does need is **edit locality**: a change to one page should touch one folder. So a page is a `page.js` in the folder that is its URL, holding its state, derive, actions, resources and head, with `view.js` beside it for its content and `api.js` for its server side. Only the server and the build import `view.js`: the build evaluates `layout(view)` in Node and ships the finished spec as data, so a browser downloads the page's behavior and the spec, never the builders that assemble it. The folders are the list of pages: nothing is registered, so nothing can be forgotten or disagree with the path (`pages/event/[id]/page.js` is `/event/:id`, and a clash of two folders names both).

A page also says when it is `ready`, so the render server waits for it and the HTML is finished. It says what to show while it is not, through `pending`, which is plain spec data that the validator checks like everything else. And it says which `status` it answers. That is one declaration next to the page, instead of an app-wide `until` and a status function in the build config that name routes by hand. Loading is state, and `ready` is a function of state. There are no boundaries, no thrown promises and no streaming. Layouts are plain functions that pages import, so pages can differ completely, and pages that import the same layout share one copy of it in the build.

A page names the plugins it needs (`plugins: [withResources]`) and the namespaces it uses, so the build can give it exactly the code it imports: the cost of a page is what it lists. Within a set of pages, code is also split by owner (the framework, each npm package, the app), because they change at different times: the framework and a package on an upgrade, the app on every deploy. One file holding both would be downloaded again for either; in the shop a one-line change to the cart costs a returning visitor 1.1 KB instead of about 11 KB (esbuild + gzip), for one request more on the first visit. Small chunks are folded together (`minSharedChunkBytes`), because grouping by the exact set of pages would make one file per combination of pages; a fold goes into a chunk of the same owner or the app's, never into the framework's or a package's, so the split that caching depends on survives it.

Per-page APIs are tables such as `'POST /:id/signup'`, mounted below `/api/<name>/`, so one table cannot answer for another, and a missing or misspelled endpoint is a 404 in a test, not a silent fallthrough. Third-party tags for analytics or marketing are not a framework feature.

`agent-ui check` reads the links in every spec: a literal `href` that is no page, no file in `publicDir` and no API path is reported with a suggestion. With a link as a plain path and a page as a folder, "this link leads nowhere" is a fact the tooling can know.

Costs: a page load between pages (no in-memory state across them, the header is mounted again), a site below a path of its domain says so once (`basePath`, added on the wire by the build, the runtime and the servers, so a spec, a folder and the API keep the site's own paths), and the pages that share a namespace each list it. A namespace that reads another one needs that one listed too; the page fails at start with the name of the missing one.

## 5. What it is judged on

The criteria are what limits an agent, not a human. For each, what agent-ui offers today:

| Criterion | agent-ui |
|---|---|
| Static error detection | A closed grammar, one validator, and errors addressed by spec path. |
| Typical bug sources | In-place mutation (caught in development), a missing `key`, a resource whose URL nothing answers. |
| State visibility | One JSON snapshot, plus derived values, plus the action schemas. |
| Verification without a browser | `dispatch` plus `state()` and `tree()`; the DOM is optional. |
| Reproducibility | Action log replay. |
| Edit locality | One named action or one spec node; one folder per page. |
| Update cost | Fine-grained: 3 mutations per row toggle on the shim. |
| Delivery | A zero-dependency pipeline, the runtime as a separately cached chunk, per-request rendering, and an optional static build. |
| Runtime size | 13 KB gzip (47 KB raw) with identifiers unmangled, before any minifier (the table in section 3). |
| Training prior | None. Models have not seen this grammar. |

Mechanisms that should favour agents **[hypothesis]**:

1. **A smaller error space.** A closed grammar plus typed actions removes whole classes of bugs that come from arbitrary code in the view layer.
2. **Cheaper feedback.** Validation and action-level tests need no rendering. The loop is edit, validate, assert on JSON.
3. **Robustness to context loss.** After forgetting, `actions()`, `state()`, `tree()` and `validate()` re-establish the facts without re-reading files.
4. **The whole runtime fits in context.** It can be read in one or two calls.
5. **One writer path** means logging, replay, audit and exposing the app to other agents are not extra features.

Risks that cut the other way:

- **No training prior** is the biggest. Models write other UI code fluently and have never seen this grammar. The mitigations are built, none of them a proof: the spec is written with builders (`@ehtb/agent-ui/spec`), which look like the markup models know best and return the JSON; a cookbook (`cookbook/`) has one canonical, tested page for each common task, copied rather than recalled; `agent-ui explain` prints a recipe or the one valid form of a part of the grammar; the validator names the fix of every mistake. Whether they close the gap is what section 6 measures.
- **Ecosystem gap.** There is no accessible component library and no visual devtools beyond the debug console. Server rendering is replacement-based hydration only.
- **Expressiveness ceiling.** See "Friction and honest costs" above.
- **Human oversight.** Readable code and readable build output help, and `actions()`, `tree()` and spec data are the audit surface, but spec trees are not pretty.

## 5b. State management

The model, in full in the README: a JSON store of signals, one per `namespace.key`, immutable values, pure `derive`, one-way bindings, typed actions as the only writers, and a log of successful actions. Why: a single writer path makes every change loggable and replayable, which is the main thing an agent can verify without a browser, and plain data in a flat table of signals is cheap to serialize for persistence, devtools and server-to-browser transfer.

Namespaces were built from the ground up, not added as a feature: every state key, derived value and action belongs to one, an action writes only its own, and a change in another namespace goes through `calls`. Why: the main accuracy problem for an agent in a flat store was that any action could write any key, so a change needed the whole store in mind, and names were kept apart only by convention (`noun.verb`, prefixed keys) that nothing checked. With namespaces the unit of work is "edit this namespace", a name clash is impossible by construction, a write outside the namespace fails at once with the fix, and the same structure maps to the route folders and to reusable logic (a namespace mounted under several names replaces the name-splicing of the first features design).

Options considered for writing across namespaces, and why this one: (1) several handlers on one event is kept, for wiring in the view, but the view must then know every consequence and it only works from events; (2) a `writes` declaration would dilute ownership: "who can change this?" becomes "anyone who declared it"; (3) **`calls`**, chosen: the owner of the state does its own writes, the dependency is declared and checked at mount, it works from any trigger (resources, the router), it runs in one transaction (one flush, one log entry, undone together on failure), and one level only so what an action can cause stays readable from the action; (4) events and subscriptions are the most decoupled but make control flow implicit, the opposite of one valid form visible from where you are; (5) the design rule before any of them: most cross-writes mean the state is in the wrong namespace or should be derived. Transactions are not specific to `calls`: every action that throws leaves no write behind, which retired the old advice "validate first, write last".

What it costs: spec bindings and handler names are always qualified (longer text, one form); two levels only (`namespace.key`, then any path in the value); a derived value or an action reading another namespace names it, which is also the dependency made visible; derived lists are recomputed in full; there is no undo.

Several apps on one page are possible (each `app()` is isolated); `syncApps` (`@ehtb/agent-ui/sync-apps`) is the one sanctioned way for them to talk: one way, declared as data, checked when made, logged on the receiving side. It is for independent widgets, not a substitute for dynamic namespaces. (It was called `link` first, and renamed because a link is an anchor element: it is nothing to do with navigation.) The shell below is its main user.

Item `shapes` (optional, by state key or derived name, with a `validate` hook for an external type checker) cover the main accuracy gap of lists: a typo inside an item is caught at mount, and a malformed write in development. They are deliberately plain data: the framework imports no validation library, and `validate` is where one plugs in.

**State that belongs to rows: `rowState`.** The N-instances problem: a list where every row has its own open/closed or draft text. Without a feature, an agent has to invent a keyed map and the code that reads it, and the invention is the risk. A namespace now declares `rowState: { open: false }`; the runtime owns one state key, `namespace.rowState`, `{ [rowKey]: { field: value } }`, only the rows that differ; actions write it with `store.setRow(id, ...)`; the view reads it with `rowState('namespace.field')`. It stays what the model requires: plain data in the global tree, changed by logged actions, replayable and sent from the server, written only by its namespace. What it is deliberately not: component-local state (nothing is created or destroyed with a row; a row's state stays until its owner forgets it, so a removed item calls `clearRow` through `calls`), and a second kind of namespace (a namespace with `rowState` is an ordinary namespace that also has this key). The name `keyedBy` was considered and dropped: the key is not a property of the namespace but of whichever `each` the row is in. Cost: each `rowState` binding keeps a small signal of its own, so a write to the map re-runs one cheap check per binding (O(rows), the same class as a derived list) and writes the DOM of the one row that changed; measured on the test DOM, about 0.1 ms per write at 1000 rows and 0.5 ms at 20000. The map is keyed by row key alone, so a namespace serves one list: the validator refuses a second list reading the same namespace, rather than let two lists share an entry. An outer row's state is read by name, `rowState('order.details.open')`, like `row('order.id')`.

**Reading the outer row: `as` and `row`.** `{item}` reads the innermost row, which made a nested list that needed an outer field copy that field into every inner item in `derive`. The outer `each` now says `as: 'order'`, and `{row: 'order.id'}` reads that row from any depth, in bindings and in handler arguments. It is one new key on `each` and one binding; the validator knows the names in scope (and the outer list's shape), so a wrong name is reported with "Did you mean" at mount. The alternative considered, a helper that flattens outer fields into inner items, was dropped: two ways to do one thing.

**Plugins that draw: `mountElement`.** A chart or an editor owns its DOM. The plugin claims an element by its explicit id, gets it once it is in the page (for each row of an `each`, again after a `when`), and a cleanup when it leaves. State goes out through `api.watch`, events come back through `api.dispatch`, so the log stays complete. It is a helper module (`@ehtb/agent-ui/mount-element`) on two small runtime members (`api.spec()`, `api.observeElements`), so a page that has no such plugin does not download it. Claiming an element with children is refused: the plugin would write into what the spec renders.

Not built, in order of expected value: declared reads for cross-namespace reads (today reads are open and writes are owned), and undo and redo over the action log. Each keeps one-way flow. Each needs runtime, validator, docs and tests in one change. Not planned: two-way binding, implicit reactivity on mutation, state held in closures or the DOM.

## 6. How to test the thesis

Give the same agent and model the same task set twice, once with agent-ui and once with a widely used component framework of the team's choice, with context resets between sessions. The tasks: a todo app from a published specification, then a form with validation, a sortable and filterable table at 5,000 rows, async data with loading and error states, and routing.

Measure: correct on first pass, iterations to green, regressions per 100 edits, tokens, bundle size, and interaction latency at 5,000 rows in a real browser. Run the official TodoMVC browser test suite against the served `dist/todomvc.html`; this needs a machine with npm access.

Decision rule: if agent-ui wins on regressions and iterations but loses on first-pass generation, the missing training prior dominates. The better design is then the same spec, validator and action layer on top of an existing renderer.

## Soft navigation and the shell

**The need.** A page load between pages remounts the header, loses what is only in the browser and re-parses what is cached. The earlier answer, a client-side router, was removed for good reasons (two ways to say where a page lives, namespaces that must exist before the first navigation, state that survives in one tab and not the next). The need that remained is narrower: some elements (a header with a cart count, a footer, a player) should stay while the page changes, and the change should not cost a document load.

**The decisions.**
- **It stays a page load.** A soft navigation fetches the same document a load would get and starts the page from the state that document carries. There is no route list, no second place that says what a URL shows, no client-side route state. Anything that is not a plain page (a status other than 200, a redirect, another shell, a failure anywhere) ends in a normal load of the URL, with the reason in the console. The one place that can differ from a load is the document that stays.
- **Soft is written on the link.** `a({ href, soft: true })` is explicit data in the spec, so `agent-ui check` can read it and prove the target has the same shell. Intercepting every link would have made the behavior implicit and the failure visible only when a visitor clicks. A button is not wrapped in an anchor (nested interactive content is invalid HTML): it calls the framework's action `route.go`, which is state (`route.destination`) that the shell follows, so it is logged and quiet during replay like every effect.
- **What stays is an app.** The first answer, one app whose layout keeps some namespaces while others are replaced, needs namespaces to be added and removed at runtime, which the model rules out. A shell is a second, ordinary app next to the page's app; it reads what it shows from the page with `syncApps`, one way, and the page never touches it. The page mounts in an element the shell's view holds (`pageSlot()`).
- **A page is destroyed, not hidden.** `app().destroy()` stops the effects, removes the listeners, aborts requests in flight and lets plugins release what they hold (`onDestroy`). Without it a replaced page keeps writing to a document it no longer owns. A late response to a destroyed app changes nothing.
- **Behavior and content stay split.** The shell has `shell.js` (behavior, in the browser bundle) and a content module (evaluated in Node; the build ships its result once as data, so the header is in one shared chunk, not in every page). Every page's entry registers itself under its own file's URL, which is how a soft navigation finds the page a fetched document names without a route table.

**What it costs.** About 1.4 KB more in the runtime that every page downloads (`destroy`, the nested-app guards, the `soft` attribute; 0.3 KB gzipped) and about 0.3 KB in `src/pages.js`; the shell, the navigation plugin and `syncApps` are downloaded only by pages that list a shell (`examples/shop/README.md` has the numbers). A page without a shell pays nothing else, and keeps the route namespace it always had.

**What it does not do.** Prefetch the next page, restore scroll positions inside scrolling containers, animate between pages, or keep a page's state across a swap. A page with a form half filled loses it, as on a load; what must survive lives in the shell or on the server. A shell that is wanted on some pages and not others is two shells; a soft link between them is a normal load.

## 7. Roadmap (by expected value)

1. More real-browser verification, and the official TodoMVC browser run. `@ehtb/agent-ui/testing/browser.mjs` is in place and two tests use it (soft navigation in `examples/shop`, a shim-against-Chrome session in `examples/todomvc`). Still to run in a browser: focus and typed-input restore after hydration, transitions and hot reload, the pointer drag of `examples/react-converted-components`, and the same session comparison for more apps.
2. Validate `{item: field}` against the shape of the iterated list where it is statically known, and name the missing field at runtime otherwise. Shorter validator paths using the nearest explicit ids.
3. A `reload` option for `resources` instead of the counter-in-state workaround.
4. Streaming render. (Multi-URL prerender is built: a page with parameters lists its URLs in `paths`, which `--static` writes and `agent-ui check` renders.) Error pages stay the host's.
5. A build-time CSS report: classes used by specs but undefined, selectors defined in more than one chunk.
6. Form schemas that reuse action argument types; a text rendering of the spec tree for review.
7. List virtualization, and more operators, only if row counts or derive workarounds demand them. (Row-sourced nested `each` is built: `as` and `row`.)
8. Expose `actions()` and `tree()` to external agents over a standard protocol.
9. Build: a full bundler if the restricted module dialect becomes a constraint. (Source maps are built: line-level, `BUILD.md`, and with a minifier in `transform` the minifier returns its own map, which the build follows back to the source; errors in the dialect name the line.)

## Release review (October 2026)

A review against an open-source release, with the line that the framework is a UI library with server rendering and not an application server, added what a host cannot supply itself and nothing it can:

- **Base path** (`basePath`): the site's own paths everywhere inside the app and the API, the base only on the wire. A host cannot fix root-absolute asset URLs and page patterns from outside without rewriting responses.
- **`paths` in view.js**: one list of URLs for a page with parameters, used by both `agent-ui check` and `--static`, so a checked page is a page that can be generated. view.js runs only in Node, so the list may come from data.
- **A closed SVG subset**: inline icons are in almost every UI, and `img` and `mountElement` were the only ways out. The subset is for icons and simple drawings with placement and labelling rules the validator checks; charts stay with a library drawn by a plugin.
- **Cost as counts, not times**: `measureAction`/`assertCost` (DOM writes, effect runs, values changed), the page table of `agent-ui check` and the build, and `budgets`. Counts are the same on every machine, so an agent can assert them; wall time is noisy and was left out. The effect counter is a few bytes in the runtime; the rest lives in the testing helpers and the tools.
- **Scroll restoration** of the window on back and forward, which only the navigation plugin can do (it swaps the page after the browser would have scrolled).
- `createSsrHandler` answers 413 for a body over its limit and 415 for a compressed one, and is described as a request adapter with an opt-in API and form bridge. Uploads, sessions, SSE, WebSockets, compression and caching stay the host's (`SECURITY.md`).

`follow` and the sliding of reordered rows moved out of the runtime into the plugins `withFollow` and `withMoves`, behind two hooks (`api.onReorder`, `api.handleProperty`): only pages that drag or slide download them. The saving is small (0.7 KB raw, 0.26 KB gzip, every other page), so the price had to be small too: a page that uses `follow` without its plugin fails at mount naming the import, rows that would have slid jump with a development warning naming it, and `agent-ui explain plugins` lists every plugin. The enter and leave markers stayed in the runtime, because they decide when a node leaves the DOM.

`syncApps` was kept after asking whether the shell made it redundant: the shell's `reads` are built on it, and two apps on a page the host owns (`examples/islands`) is the library use it exists for.

## Deliberate tightenings (October 2026 drift review)

These closed gaps in "unknown input is rejected" and can break an app that relied on the gap: a prop must be an attribute of HTML, `data-*`, `aria-*`, `follow`, `soft` or `focus` (`ATTRIBUTES` in `src/grammar.js`; a real attribute that is missing is added to the list); `windowEvents` accepts only the events of `WINDOW_EVENTS`; `patchSpec` refuses unknown operation keys and unknown `changes` fields; `resources` needs a fetch function and a numeric `delayMs` at install. Production builds trade sentences for size: an error there is its code and details (`AUI0103 {...}`, `src/error-messages.js` is a stub), which `decodeError` turns back into the sentence where the error is read (`docs/GUIDE.md`, "Reporting errors").
