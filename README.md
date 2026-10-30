# agent-ui

**A frontend framework built for agents to write, check and maintain.**

agent-ui is designed for a particular kind of author: a model that writes the code, forgets what it read forty turns ago, and needs the code itself to say what is valid. The result is still for people to use. Pages have real URLs, are rendered on the server and taken over in the browser, forms work without JavaScript, and the validator checks accessibility basics.

## The idea

An agent is fast and tireless, but its context decays. It produces confident near misses, such as an API that looks right and does not exist. It cannot see the browser unless you wire that up. It does better with exactness than with shorthand. Conventions that a person learns once and then remembers are exactly what an agent gets subtly wrong later in a long session.

agent-ui keeps what a UI framework has to do, which is keeping the page in sync with the state quickly and correctly. Around that it puts structure that a machine can check:

- **The UI is a JSON spec** with a closed grammar. It is data, so it can be validated, diffed, patched and generated. You write it with builders (`@ehtb/agent-ui/spec`: `div(...)`, `button(...)`, `state(...)`), which look like the markup models know best and return exactly that JSON; the JSON is the wire format, not the way you write.
- **One valid form for everything.** A page, an endpoint and a build option each have one fixed shape. Unknown keys are rejected, and typos get a "Did you mean" suggestion.
- **Errors say where, what and how.** Every message names the place, the problem and the fix.
- **Declared item shapes.** A list can declare what one item looks like; typos in `{item}` bindings fail at mount and malformed writes in development, and a `validate` hook lets a type checker such as zod judge items.
- **State in namespaces, written only by named, typed actions.** Every state key, derived value and action belongs to one namespace, an action writes only its own, and a change in another namespace goes through a declared `calls`. Every action is logged and can be replayed.
- **No browser needed to look.** State, derived values, the interactive surface and the rendered structure are available as JSON. Tests run headless in Node.
- **A cookbook that is run.** `cookbook/` has one canonical page for each common task (a list you edit, a form with validation, an async list, a dialog, a combobox, a drag-reorder list, a header that stays, nested rows, per-row state, formatted values, a chart drawn by a plugin). `agent-ui check` renders every one of them and the tests drive them. `agent-ui explain <name>` prints a recipe, or the one valid form of a part of the grammar.
- **Zero dependencies.**
- **A page is a URL, and a URL is a folder.** `pages/event/[id]/page.js` is `/event/:id`; nothing else says which pages exist. The most specific URL wins, and every page is its own entry in the build, so a page downloads only what it imports (`examples/shop` shows the split and its sizes).
- **Docs that cannot drift.** Documentation and code comments are tested against the repository: every path, script, command and import name they mention must exist.

## A taste

```js
import { app } from "@ehtb/agent-ui";
import { button, state, act } from "@ehtb/agent-ui/spec";

app({
  namespaces: {
    counter: {
      state: { count: 0 },
      actions: {
        add: {
          args: { by: "number" },
          run: (store, { by }) => store.set("count", store.get("count") + by),
        },
      },
    },
  },
  spec: button(
    { on: { click: act("counter.add", { by: 1 }) } },
    "Clicked ",
    state("counter.count"),
    " times",
  ),
  root: document.getElementById("app"),
  dev: true,
});
```

There is no logic in the spec and no way to write state except through `counter.add`, which can write only the namespace `counter`. A wrong call to a builder fails at the line that made it, with the fix in the message:

```
button({ onClick: ... })  ->  button(...): "onClick" is another convention. Events go in "on": on: { click: act('namespace.verb', {}) }
```

The builders return plain JSON, which is what the validator, the server renderer, the browser and the action log see. This is the same spec as the data it becomes:

```js
{
  tag: "button",
  on: { click: ["counter.add", { by: 1 }] },
  children: ["Clicked ", { state: "counter.count" }, " times"],
}
```

Misspell a key in the JSON form and the app refuses to mount, with the path and the fix in the message:

```
$: unknown key chilren (allowed: tag, props, children, id, classes, on, transition). Did you mean "children"?
```

## What it holds itself to

**No external dependencies.** The framework, the build pipeline, the dev and render servers and the tests use only Node's standard library and the browser's native APIs. `package.json` has no `dependencies` or `devDependencies`, and none may be added. A project that wants a minifier or a type checker plugs it in from outside, through the build's `transform` hook or by running `tsc` separately.

**Accuracy over interpretation.** Whatever an agent has to write has exactly one valid form, and the code says what it is. The grammar is closed. A page is a folder that holds two files — `page.js` (its behavior, fixed keys) and `view.js` (its content) — and the folder's path is its URL. API tables and build options are data that is checked before anything runs. Every mistake fails early with a message in three parts, for example:

```
page "/event/:id": unknown key "hedd". Did you mean "head"? Allowed keys: head, namespaces, plugins, ready, status, shell, debug
```

Typos get a suggestion, name clashes name both owners, and nothing is guessed or silently ignored. `agent-ui check` renders every page in development mode and reports everything at once. A feature is not finished until its wrong uses produce such a message and a test asserts the message.

## Where it stands

Priorities, in order: performance, accuracy, size.

- One binding is one effect that writes one DOM property. There is no virtual DOM and no diffing. Toggling a row in a list costs three DOM mutations at any list size on the test DOM.
- The production runtime is about 46 KB, 13 KB gzipped, with readable names. Only comments and indentation are stripped. Source maps are an option (`sourceMaps`, `docs/BUILD.md`).

This is young software. The claims about agents are hypotheses until measured: the experiment is written down in `docs/DESIGN.md`, most tests run on a hand-written DOM (a few drive real Chrome and compare it with that DOM, `@ehtb/agent-ui/testing/browser.mjs`), and models have not seen this grammar in training. The mitigations are in the design: a small surface, a validator that explains itself, and `docs/AGENT-RULES.md` and the rest of the docs shipped inside the package.

## Use it in a project

```
npm install @ehtb/agent-ui
```

```js
import { app } from "@ehtb/agent-ui"; // the runtime
import { withResources } from "@ehtb/agent-ui/resources"; // plugins and tools are separate imports: a page downloads only what it imports
```

Add scripts to your `package.json` and a `build.config.mjs`. The `agent-ui` command is installed with the package.

```json
{
  "scripts": {
    "build": "agent-ui build",
    "dev": "agent-ui dev",
    "serve": "agent-ui serve",
    "check": "agent-ui check"
  }
}
```

```js
// build.config.mjs
import { frameworkBuildOptions } from "@ehtb/agent-ui/build/presets.mjs";
export default ({ dev = false, validator } = {}) => ({
  ...frameworkBuildOptions({ dev, validator }), // the pages are the folders below pages/: nothing else to list
});
```

The source is JavaScript, and the package ships hand-written `.d.ts` files for every public module. A plain JavaScript project gets editor checking by adding `// @ts-check`; a TypeScript project imports the same types without a framework build step. `examples/with-typescript` is an app checked that way, including a zod check of a resource's response.

| Command                   | What it does                                                                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent-ui build`          | Production site in `dist/`: hashed file names, comments stripped, spec validator left out. `--dev` gives a readable build with the validator; `--static` also writes every page as a file. |
| `agent-ui dev`            | Dev server with hot reload (the edited page is swapped in place) and rebuild on change.                                                                                                                   |
| `agent-ui serve`          | Development and test server for the built site at http://localhost:8080 (this machine only; `--host` changes it): every page is rendered on the server for the URL asked for, plus the project's JSON API and form posts. It sends no compression and is not a production server; deploy behind your host or a CDN (`docs/BUILD.md`). |
| `agent-ui check`          | Renders every page in development mode and reports problems in specs, links and data.                                                                                |
| `agent-ui schema`         | Writes the JSON Schema of the spec grammar.                                                                                                                          |
| `agent-ui init`           | Writes the short rules for agents into the project's `AGENTS.md`, so an agent that only reads that file learns them. The full rules are in `docs/AGENT-RULES.md`. Run it once in a project, and again after an upgrade. |
| `agent-ui explain [name]` | Prints the one valid form for a recipe of the cookbook or a part of the grammar. Without a name, lists them.                                                         |

**For agents working in a project that uses agent-ui:** run `agent-ui init` once (it puts the short rules into your own `AGENTS.md`, which an agent loads, unlike the files in `node_modules`), then read `node_modules/@ehtb/agent-ui/docs/AGENT-RULES.md` (the short manual) and `node_modules/@ehtb/agent-ui/docs/GUIDE.md`. Use `docs/API.md` as the reference. The code comments and `.d.ts` files in the package say the same things in place. The package's root `AGENTS.md` is for working on the framework itself and is not published.

## Documentation

| Read                                  | For                                                                                                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/AGENT-RULES.md`                 | The short rules for an agent building an app with agent-ui. Read this first.                                                                                |
| `docs/GUIDE.md`                       | How pages, routing, APIs and forms fit together. Read it before touching a page, a URL or an endpoint.                                                      |
| `docs/API.md`                         | The reference: grammar, semantics, a complete minimal app, recipes, testing helpers.                                                                        |
| `docs/BUILD.md`                       | Bundling and shipping.                                                                                                                                      |
| `docs/CONVERTING.md`                  | How to convert a React component (for example a shadcn/ui one), step by step, with the tests that prove parity.                                             |
| `skills/migrate-to-agent-ui/SKILL.md` | An agent skill: migrate a whole existing app (any framework) to agent-ui, with a concept map and an inventory template.                                     |
| `docs/DESIGN.md`                      | Why it is built this way, the evidence so far, and what is deliberately not built.                                                                          |
| `AGENTS.md` (repository only)         | Working on the framework itself: layout, code style and the rules for changing the grammar. Not published; app authors read `docs/AGENT-RULES.md`.                |
| `cookbook/`                           | One canonical page per common task, run by `agent-ui check` and the tests. `agent-ui explain <name>` prints one.                                            |
| `examples/README.md`                  | Runnable example apps. They depend on the framework; the framework never depends on them. `examples/shop` is the one that shows code splitting, with sizes. |

## Work on this repository

```
npm test                            framework tests (test/) and the examples that need no registry (examples/)
npm run test:framework              framework tests only (they use test/fixtures, never examples/ or cookbook/)
npm run test:examples               examples, cookbook recipes and skill, and every example app
npm run example -- events           install, build and start one example (list and URLs: examples/README.md)
npm run example -- events test      run any other script of an example (build, dev, serve, test)
npm run typecheck                   check the .d.ts files (needs tsc, run separately; the package itself has no dependencies)
npm run schema                      regenerate docs/spec.schema.json
```

## Why there are `.d.ts` files next to the JavaScript in `src/`

The source is plain JavaScript on purpose. What an agent reads in `node_modules/@ehtb/agent-ui/src` is exactly what runs, with no compile step between. The `.d.ts` files beside it, such as `ui.d.ts`, `pages.d.ts` and `resources.d.ts`, are hand-written type declarations. The Node-side modules a project imports have `.d.mts` files (`@ehtb/agent-ui/build/presets.mjs`, `@ehtb/agent-ui/build/config.mjs` with a `BuildConfig` type, the server handlers, the testing helpers), so `build.config.mjs`, your server and your tests are checked too. They do three jobs:

- **Editor and tool feedback without a build.** A plain JavaScript project gets completion and argument checking by adding `// @ts-check` to a file. TypeScript projects get types for `import { app } from '@ehtb/agent-ui'`. The `exports` map in `package.json` points tools to them, and no TypeScript dependency is needed for that.
- **The shortest accurate description of each API.** `pages.d.ts` fits on one screen and states the exact shape of a page, the allowed keys and which ones are optional.
- **They are tested, not trusted.** `npm run typecheck` compiles `test/types/check.js`, which must accept real usage and reject known mistakes. The runtime validator remains the authority on meaning, such as action names and argument types, because types cannot see those.

They are written by hand rather than generated so the JavaScript stays the single readable source, and so each declaration says what a caller may do, not how it is implemented.

## State management

State flows one way. The UI never writes state, and state never reaches the page except through bindings.

```
state (signals, plain JSON) --derive--> derived values --bindings--> one DOM property each
   ^
actions (typed, the only writers) <-- DOM events (spec `on`: [actionName, args])
```

**Where state lives.** State is declared in namespaces: `namespaces: { todos: { state, derive, actions }, search: { ... } }`. Every state key, derived value and action belongs to exactly one namespace and is written with it outside that namespace: `{state: 'todos.draft'}`, `'todos.add'`. Inside the code of a namespace (its actions and derived values) its own keys are written plain (`store.get('draft')`) and other namespaces' keys, for reading only, with the namespace (`get('search.query')`). Under the hood each qualified key is one signal and a write replaces the whole key. State is JSON-serializable and immutable: values are replaced, never mutated, and development builds deep-freeze them so an in-place change fails loudly. `derive` holds pure functions of state, such as `todos.visible`. Each is recomputed when its inputs change. A result that is structurally equal to the previous one keeps the old reference, so nothing downstream re-runs. `ui.state()` and `ui.derived()` have the shape `{ namespace: { key: value } }`.

**State to page.** A spec binding such as `{state: 'search.query'}` or `{item: 'title'}` becomes one effect that writes one DOM property or text node. `each` rows are keyed and reused, and a row's `{item}` bindings re-run only when that row's item changes. A binding cannot write state.

**Page to state.** Event handlers in the spec are data, for example `['search.set', { value: { event: 'target.value' } }]`, with no logic (a list of handlers runs several actions from one event). An action is `{ args, calls?, run(store, args, call) }`. The runtime checks argument types, and `run` is the only code that calls `store.set`, on its own namespace only. When a user action has to change another namespace, it lists that namespace's action in `calls` and runs it with `call('search.clear', {})`; the called action writes its own keys, and everything the outer action did is undone if any part throws. Every successful action is appended to a log (the outer action; its calls are part of it). The log gives deterministic replay with `ui.replay(log)`, regression tests from recorded sessions, and the state a page keeps across a hot update in the dev server.

**Timing.** Updates are batched into one microtask. After `dispatch`, `state()` is current immediately. `derived()`, `outline()` and the DOM are current after `await ui.settle()`.

**The outside world** reaches state only through plugins, using `api.watch` for state going out and `api.dispatch` for events coming in. The built-in plugins are `resources` for the network and `windowEvents`; a page lists the ones it needs, so it downloads only those. There is no storage plugin and no client-side router: durable data and state live on the server, and following a link is a page load, which a link marked `soft` makes faster inside a shell that stays (a header, a footer; `docs/GUIDE.md`). A resource is declared as a start, a success and a failure action, so responses end up in the log. On the server, `renderPage` returns the state it rendered from, and the browser app starts from it.

### Limits of the current state model

- **Namespaces are one level deep.** `namespace.key`, then any path inside the value. There are no nested namespaces, and a namespace cannot write another: it calls one of its actions (one level of `calls`; a called action cannot call further). If you find yourself calling a lot, the state is probably in the wrong namespace, or should be derived.
- **No local state.** Ephemeral UI state, such as a row in edit mode or an unsent draft, lives in a namespace of the store, addressed by id. State that every row of a list has (open, selected, a note) is declared once as the namespace's `rowState` and read in the row with `rowState('namespace.field')` (`docs/API.md`, "Per-row state"); it is still plain data in the store, changed by logged actions.
- **Derived lists are recomputed in full** when their inputs change. This is fine to thousands of rows and slow at tens of thousands. There is no virtualization.
- **`{item}` reads the innermost row.** To read an outer row from a nested `each`, name the outer one with `as` and read it with `row('name.field')`; nothing is copied into the inner items.
- **No formatting operators, on purpose.** Numbers, dates and money are formatted in `derive` with `Intl`, per item with `memoizeItem` (`docs/API.md`, "Formatting values").
- **No undo or redo built in.** The action log would support it; nothing implements it.
- **State must be JSON-serializable.** No functions, Dates, Maps or class instances. This is what makes replay and state transfer to the browser work.
- **Actions are synchronous.** Network and timers live in plugins, never in `run`.
- **Hydration replaces the server markup** instead of adopting it. Text typed and the focus before the app loads are carried over by `data-id`; scroll positions inside scrolling containers and running animations are not.
