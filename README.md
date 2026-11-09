# agent-ui

[![CI](https://github.com/ehtb/agent-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/ehtb/agent-ui/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@ehtb/agent-ui.svg)](https://www.npmjs.com/package/@ehtb/agent-ui)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node 22+](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)

**A zero-dependency UI library with server rendering, built for agents to write, check and maintain.**

Modern UI frameworks optimize for human ergonomics: implicit conventions, flexible APIs, and multiple ways to express the same component. For an LLM coding agent forty turns into a session, that flexibility is a trap. As context decays, agents hallucinate non-existent props, mix framework idioms, and introduce subtle state bugs that require a real browser to catch.

`agent-ui` inverts this design. It gives agents a closed, declarative JSON grammar authored through typed JavaScript builders, paired with strict, transactional state namespaces. There is exactly one valid shape for every construct. If an agent makes a mistake, the runtime rejects it immediately with an error message that gives the exact syntax fix. And because the entire UI, state tree, and interactive surface are plain data, an agent can render, inspect, and test every page headlessly in Node in milliseconds.

Strictness for the machine does not compromise the output for humans. Pages map to real URLs, render on the server, and mount in the browser with a 13 KB gzipped runtime, zero virtual DOM overhead, progressive enhancement for forms, and built-in accessibility checks.

---

## Why This Exists

An LLM agent is fast and tireless, but its context decays: it produces confident near-misses—React conventions in a non-React codebase, hallucinated options, or subtle state mutations—and it cannot see the browser unless you wire up heavy headless tooling.

`agent-ui` keeps what a UI framework must do—keeping the DOM in sync with state quickly and predictably—and wraps it in a closed grammar that a machine can verify without a browser.

### Core Guarantees

- **Closed Grammar & Builder Syntax:** The UI is a pure JSON specification. You author it using thin builders (`div(...)`, `button(...)`, `state(...)`) that look like standard markup functions and return plain JSON. Because the UI is data, it can be validated, diffed, patched and generated.
- **One Valid Form for Everything:** A page, an endpoint, and a build option each have one fixed shape. There is no shorthand or overloading. Unknown keys are rejected immediately, and typos return actionable "Did you mean?" suggestions.
- **Errors the agent can fix on the next turn:** Every validation error names the exact path, the violation, and the valid fix. When an agent makes a mistake, the error message in its terminal gives it the exact syntax needed to self-correct on the next turn.
- **Isolated, Transactional State:** State lives in flat, JSON-serializable namespaces and is mutated only by named, typed actions. Cross-namespace updates go through declared `calls`. If any part of an action chain throws, the entire transaction rolls back. Every action is logged for deterministic replay.
- **Headless verification & cost budgets:** State, derived values, the interactive surface, and the rendered DOM tree are inspectable as JSON in Node. `measureAction` and `assertCost` count exact DOM writes, effect runs, and state changes. Build budgets turn pages that exceed size or node limits into hard CI errors.
- **Zero Dependencies:** The runtime, compiler, dev server, SSR engine, and test runner use only Node's standard library and native browser APIs. `package.json` has zero `dependencies` or `devDependencies`.

---

## A Taste of the Code

```javascript
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

There is no inline logic in the view spec, and no way to mutate state except through `counter.add`.

If an agent hallucinates a React convention in the builder, it fails at the call site with the exact fix:

```text
button({ onClick: ... }) -> button(...): "onClick" is another convention. Events go in "on": on: { click: act('namespace.verb', {}) }

```

The builders return plain JSON—the exact wire format seen by the validator, the SSR renderer, the browser, and the action log:

```json
{
  "tag": "button",
  "on": { "click": ["counter.add", { "by": 1 }] },
  "children": ["Clicked ", { "state": "counter.count" }, " times"]
}
```

If an agent generates or patches raw JSON and misspells a key, the app refuses to mount and prints the schema rule:

```text
$: unknown key chilren (allowed: tag, props, children, id, classes, on, transition). Did you mean "children"?

```

---

## Performance & Footprint

Design priorities, in strict order: performance, accuracy, size.

- **No Virtual DOM:** One state binding compiles to one effect that writes to one DOM property. There is no VDOM diffing overhead. Toggling a row in a list costs exactly three DOM mutations at any list size.
- **13 KB gzipped:** The production runtime is about 47 KB, 13 KB gzipped, with readable symbols—only comments and whitespace are stripped. A real minifier plugs into `transform`, and source maps (`sourceMaps`) work with or without it: the minifier's map is followed back to your files. Framework code, each npm package and your app's code are separate chunks, so a deploy of your app leaves the rest cached. See `docs/BUILD.md`.
- **Declared List Shapes:** Lists declare their item schema up front. Typos in `{item}` bindings fail at mount, malformed writes fail in development, and a `validate` hook lets external validators like Zod verify items at runtime.

---

## Two Ways to Adopt

You can drop `agent-ui` into an existing backend as isolated islands, or let it manage page routing and SSR.

1. **As a Library (Islands):** Keep your existing server, router, and build pipeline. `renderPage()` renders a spec on the server, `stateScriptHtml()` serializes the state, and `readServerState()` + `app()` mount it in the browser. See `examples/islands` for a plain `node:http` server running two interactive islands with no build step.
1. **With the Page Model:** A folder under `pages/` maps 1:1 to a URL (`pages/event/[id]/page.js` serves `/event/:id`). `agent-ui build` bundles each page as an independent entry point so clients only download what that route imports. `createSsrHandler` renders pages per request inside your host server.

> **What it is not:** A web server or a monolithic application framework. Sessions, authentication, file uploads, WebSockets, compression, and caching belong to your host server (`SECURITY.md`).

---

## Architecture: The Six Building Blocks

Everything an application does fits into six primitives:

| You Need                                        | Primitive                 | What It Gives You                                                                                                           |
| ----------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| State and behavior for a UI domain              | Namespace (inside an App) | Owns plain JSON state, pure derive functions and synchronous actions.                                                       |
| Network IO, timers, DOM events, 3rd-party libs  | Plugin                    | (api) => void run once after mount. Reads via api.watch, writes via api.dispatch so all side effects become logged actions. |
| A routable URL                                  | Page                      | A folder under pages/ containing page.js (behavior, plugins, status, head) and view.js (the spec).                          |
| Persistent layout across page navigations       | Shell                     | A second app (defineShell) wrapping a page (e.g. header with cart badge, audio player). Reads page state one-way via reads. |
| An interactive widget in a server-rendered page | Island                    | A standalone app() mounted into a host DOM element without the pages/ router.                                               |
| Cross-app communication                         | syncApps                  | Watches keys in one app and dispatches an action in another. Unidirectional, validated at setup and logged on the receiver. |

### Built-in Plugins

Plugins are optional: a page lists the factories it needs in `page.js` and downloads only those modules. None is loaded for it.

| Plugin         | Import                       | Use It When                                                              |
| -------------- | ---------------------------- | ------------------------------------------------------------------------ |
| withResources  | @ehtb/agent-ui/resources     | A namespace fetches async data (resources)                               |
| windowEvents   | @ehtb/agent-ui/window-events | An action responds to window/document events (resize, keydown.Control+k) |
| withHead       | @ehtb/agent-ui/head          | Document <head> is derived from state                                    |
| withFollow     | @ehtb/agent-ui/follow        | Spec uses follow (e.g. dragged row tracks pointer)                       |
| withMoves      | @ehtb/agent-ui/moves         | Reordered list rows use FLIP layout transitions                          |
| withNavigation | @ehtb/agent-ui/navigation    | A shell uses soft: true links for client transitions                     |

Custom plugins use the exact same `(api) => void` signature. For imperative DOM rendering (like canvas charts), `@ehtb/agent-ui/mount-element` provides a dedicated lifecycle helper.

---

## State Management & Data Flow

State flows strictly one way. The UI cannot mutate state directly, and state only reaches the DOM through explicit bindings.

```text
state (signals, plain JSON) ──derive──> derived values ──bindings──> 1 DOM property each
  ^
actions (typed, atomic writers) <── DOM events (spec on: [actionName, args])

```

- **Strict Encapsulation:** Inside a namespace, actions read their own keys directly (`store.get('draft')`) and read other namespaces via qualified names (`get('search.query')`). Under the hood, each qualified key is a signal. State is immutable; development builds `Object.freeze` state trees so accidental in-place mutations throw immediately.
- **Memoized Derivations:** `derive` holds pure functions of state. Results that are structurally equal to their previous evaluation preserve object references, preventing downstream re-renders.
- **Atomic Cross-Namespace Calls:** When an action needs to update another namespace, it declares the target in `calls` and invokes `call('search.clear', {})`. If any step throws, all state changes across all namespaces in that dispatch are rolled back.
- **Deterministic Replay & Batched Timing:** Every completed outer action is recorded in the action log, enabling `ui.replay(log)` for session reproduction, headless regression tests, and state preservation across hot reloads. State updates are synchronous after `dispatch`; `derived()`, `outline()`, and DOM mutations batch into a single microtask resolved via `await ui.settle()`.

### Known Architectural Constraints

To keep the mental model small for agents and the runtime fast, several boundaries are enforced by design:

- **Flat Namespaces:** Namespaces are one level deep (`namespace.key`), and `calls` only go one level deep (a called action cannot call another namespace). Heavy cross-calling is a signal to restructure your state or use `derive`.
- **No Hidden Component State:** Ephemeral UI state (like an edit-mode toggle or input draft) lives in the store. Per-row UI state (`open`, `selected`) is declared once on the namespace via `rowState` and read via `rowState('namespace.field')`.
- **Full List Derivation (No Virtualization):** Derived lists recompute in full when inputs change, and `{item}` bindings read the innermost loop (outer loops are aliased with `as` and read via `row('name.field')`). This performs well up to thousands of rows, but will bottleneck at tens of thousands.
- **No Template Formatting Syntax:** Numbers, dates, and currencies are formatted in `derive` using standard `Intl` APIs and `memoizeItem`, keeping the view grammar closed.
- **Synchronous, Serializable State:** State must be pure JSON (no `Date`, `Map`, or class instances). Actions are strictly synchronous; all async work happens in plugins.
- **Destructive Hydration:** On mount, the client replaces the server-rendered DOM tree rather than adopting nodes. Pre-mount user input and focus state are preserved via `data-id`, but scroll offsets inside nested containers and running CSS animations reset on mount.
- **Strict Bundler Dialect:** To keep the built-in bundler zero-dependency and fast, source files must use relative imports with file extensions, named exports only, no circular dependencies, and no `export *`. Third-party packages that violate this (e.g., `zod`, `Tiptap`) are imported via a pre-bundled vendor file (`docs/BUILD.md`).

---

## Getting Started & Agent Tooling

```bash
npm install @ehtb/agent-ui

```

Add the CLI scripts to `package.json` and create a minimal `build.config.mjs`:

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

```javascript
// build.config.mjs
import { frameworkBuildOptions } from "@ehtb/agent-ui/build/presets.mjs";

export default ({ dev = false, validator } = {}) => ({
  ...frameworkBuildOptions({ dev, validator }),
});
```

### Setting Up Your Coding Agent

When using Claude Code, Cursor, OpenCode, or another coding agent in a project with `agent-ui`:

1. Run `npx agent-ui init` once. This injects the core syntax rules directly into your repository's root `AGENTS.md` so the agent loads them automatically (since agents rarely crawl `node_modules` unprompted).
1. Point the agent to `node_modules/@ehtb/agent-ui/docs/AGENT-RULES.md` and `GUIDE.md`.
1. Let the agent use `npx agent-ui explain [topic]` and `npx agent-ui check` in its tool loop. Every recipe in `cookbook/` (dialogs, comboboxes, drag-reorder lists, async resources, SVG icons) is executable and printable directly in the terminal via `agent-ui explain`.

### CLI Reference

| Command                 | Description                                                                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| agent-ui build          | Builds production assets to dist/ (hashed filenames, comments stripped, validator omitted). Pass --dev to retain the validator, or --static to pre-render static HTML files. |
| agent-ui dev            | Starts the dev server with hot-reload (swaps edited pages in place while replaying action logs to preserve state).                                                           |
| agent-ui serve          | Starts a local test server (http://localhost:8080) for SSR pages, JSON APIs, and form posts. Not intended for production exposure—deploy behind your host server or CDN.     |
| agent-ui check          | Renders every page in development mode headlessly, verifying all specs, links, data shapes, and size budgets at once.                                                        |
| agent-ui explain [name] | Prints the canonical implementation for a cookbook recipe or grammar rule directly to stdout. Lists all available topics if called without arguments.                        |
| agent-ui schema         | Emits the complete JSON Schema for the UI spec grammar.                                                                                                                      |
| agent-ui init           | Writes the condensed agent instructions into the host project's AGENTS.md.                                                                                                   |

`agent-ui --help` prints the command list; `agent-ui --version` prints the package version.

---

## Type Safety Without a Build Step

The framework's source code in `src/` is plain, untranspiled JavaScript so that when an agent inspects `node_modules/@ehtb/agent-ui/src`, what it reads is 1:1 with what runs.

Alongside every JavaScript module, the package ships hand-written `.d.ts` and `.d.mts` declarations (`ui.d.ts`, `pages.d.ts`, `build/config.d.mts`).

- **Zero-Config Editor Support:** Plain JS projects get full autocomplete and type checking simply by adding `// @ts-check`. TypeScript projects get full type resolution without needing a framework compile step.
- **Readable Contracts:** `pages.d.ts` fits on a single screen and states the exact shape a caller may pass, free of internal implementation noise.
- **Docs tested against the code:** Type definitions are tested via `test/types/check.js`, and documentation comments are tested against the codebase—every file path, CLI flag, and import name mentioned in the docs is asserted by the test suite.

---

## Browser Support, Stability & Maturity

- **Runtime Targets:** Requires Node 22+ on the server and modern evergreen browsers (Chrome/Edge 93+, Firefox 92+, Safari 15.4+ — any environment supporting `Object.hasOwn`). Code is shipped as modern ES modules without transpilation bloat.
- **Versioning:** Currently `0.x`. Minor releases may adjust the grammar or APIs, with migration paths documented in `CHANGELOG.md`. Starting at `1.0.0`, the spec grammar, exported APIs, CLI flags, build config keys, and error codes (`AUI` + 4 digits) will follow strict Semantic Versioning.
- **Maturity:** This is young software. The architectural thesis—that a closed, self-explaining grammar measurably reduces agent error rates over long sessions—is a hypothesis documented in `docs/DESIGN.md`. Because LLMs have not seen `agent-ui` in pre-training, the design compensates with a minimal surface area, `agent-ui init`, and runtime error messages that teach the syntax on the fly.

---

## Documentation & Repository Guide

| Document / Path                     | Purpose                                                                                                               |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| docs/AGENT-RULES.md                 | Condensed rules for coding agents building apps with agent-ui. Start here.                                            |
| docs/GUIDE.md                       | Architectural guide covering pages, routing, endpoints, and progressive forms.                                        |
| docs/API.md                         | Complete reference: spec grammar, state semantics, minimal app examples, and test helpers.                            |
| docs/BUILD.md                       | Bundler dialect rules, vendor file configuration, and deployment setups.                                              |
| docs/CONVERTING.md                  | Step-by-step guide for porting React components (e.g., shadcn/ui) to agent-ui with parity tests.                      |
| skills/migrate-to-agent-ui/SKILL.md | Agent skill for migrating full applications from other frameworks, including concept maps and inventory templates.    |
| docs/DESIGN.md                      | First-principles rationale, trade-offs, and what is intentionally omitted.                                            |
| docs/RELEASING.md                   | How a release is cut, tested and published.                                                                           |
| cookbook/                           | Canonical, tested implementations of common UI patterns (accessible via agent-ui explain).                            |
| examples/README.md                  | Runnable example apps, including examples/shop (code-splitting & bundle budgets), examples/islands (library mode) and examples/production-server (a dependency-free host). |

### Contributing & Running Framework Tests

```bash
npm test                        # Run core framework tests (test/) and zero-dependency examples
npm run test:framework          # Run framework unit/integration tests only (uses test/fixtures)
npm run test:examples           # Run all examples, cookbook recipes, and migration skills
npm run example -- events       # Build and start a specific example app (see examples/README.md)
npm run example -- events test  # Run a specific script (build, dev, serve, test) inside an example
npm run typecheck               # Verify hand-written .d.ts files against test/types/check.js (requires tsc)
npm run schema                  # Regenerate docs/spec.schema.json

```

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). The framework guide for contributors (and agents) is [AGENTS.md](https://github.com/ehtb/agent-ui/blob/main/AGENTS.md); it is for work on the framework and is not part of the published package.

## Security

Report a vulnerability privately as described in [SECURITY.md](SECURITY.md).

## Support

Questions, bugs and feature requests: [SUPPORT.md](SUPPORT.md) and the [issue tracker](https://github.com/ehtb/agent-ui/issues).

## License

MIT — see [LICENSE](LICENSE).
