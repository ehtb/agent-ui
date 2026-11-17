# agent-ui

[![CI](https://github.com/ehtb/agent-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/ehtb/agent-ui/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@ehtb/agent-ui.svg)](https://www.npmjs.com/package/@ehtb/agent-ui)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node 22+](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)

_a UI library with server rendering, built for agents to write, check and maintain_

## Introduction

agent-ui describes a UI as plain JSON, written with small typed builders. State is plain data in namespaces, and every change goes through a named, typed action. There is one valid shape for each construct, so a mistake is rejected on the spot, with a message that says how to fix it.

Because the page, its state and everything it can do are data, an agent can render, inspect and test a page in Node, in milliseconds, without a browser.

agent-ui is small (about 53 KB, 14 KB gzipped), [dependency-free](package.json) and [extendable](#built-in-plugins).

## Motivation

- Why should a button take `onClick`, `on:click` or `@click`, when the agent has to guess which one this codebase wants?
- Why should a typo in a prop be ignored, when the page then looks fine and does nothing?
- Why should an error say what is wrong, but not what to write instead?
- Why should an agent need a browser to find out whether a page works?

By removing the room for near-misses, agent-ui turns each one into an error the agent can fix on its next turn.

## Quick start

A page is a folder under `pages/` with two files: `page.js` for behavior and `view.js` for content. This one is a counter at `/`.

```javascript
// pages/page.js
const counter = {
  state: { count: 0 },
  actions: {
    increment: {
      args: {},
      run: (store) => store.set("count", store.get("count") + 1),
    },
  },
};

export const page = {
  head: { title: "Counter" },
  namespaces: { counter },
};

// pages/view.js
import { act, button, main, p, state } from "@ehtb/agent-ui/spec";

export const view = main(
  null,
  p(null, "Clicked ", state("counter.count"), " times"),
  button({ on: { click: act("counter.increment") } }, "Click me"),
);
```

State lives in a namespace (`counter`). The only way to change it is an action (`counter.increment`). The view has no logic: it shows `counter.count` and says which action a click runs.

`agent-ui build` bundles the page, `createSsrHandler` renders it on the server, and the browser takes over the markup instead of building it again.

### Checking it without a browser

The page runs in Node, on a test DOM, so an agent can use it and read the result:

```javascript
import { definePage } from "@ehtb/agent-ui/pages";
import { createRoot } from "@ehtb/agent-ui/testing/dom-shim.mjs";
import { page } from "./pages/page.js";
import { view } from "./pages/view.js";

const ui = definePage(page, { path: "/", view }).create({
  root: createRoot(),
  dev: true,
});
ui.dispatch("counter.increment");
await ui.settle();

ui.state().counter.count; // 1
ui.errors; // []
```

### What a mistake looks like

If `increment` writes `"cnt"` instead of `"count"`, the state does not change, and the error says what to write:

```text
counter.increment: store.set("cnt"): namespace "counter" has no state key or derived value "cnt". Did you mean "count"? It has: count
```

A typo in a spec key, an input without an `aria-label` and a list without a `key` are refused the same way, with the path and the fix.

## State management

State goes one way: from state to derived values, to a binding, to one DOM property. Events go back only as a call to an action.

```text
state (signals, plain JSON) ──derive──> derived values ──bindings──> 1 DOM property each
  ^
actions (typed, atomic writers) <── DOM events (spec on: [actionName, args])
```

State is plain JSON, replaced and never changed in place. Every action is logged, and `ui.replay(log)` reproduces a session. A derived list is computed in full when its inputs change: in Chrome (`examples/bench`), toggling one row of 20,000 costs 4.7 ms and three DOM writes.

## Built-in plugins

Plugins are optional: a page lists the ones it needs in `page.js` and downloads only those. A plugin of your own is `(api) => void`, and talks to the app through `api.watch` and `api.dispatch`.

| Plugin             | Import                         | Use it when                                                           |
| ------------------ | ------------------------------ | --------------------------------------------------------------------- |
| withResources      | @ehtb/agent-ui/resources       | A namespace fetches async data                                        |
| windowEvents       | @ehtb/agent-ui/window-events   | An action answers a window or document event                          |
| withHead           | @ehtb/agent-ui/head            | The document's `<head>` depends on state                              |
| withFollow         | @ehtb/agent-ui/follow          | A dragged row follows the pointer                                     |
| withMoves          | @ehtb/agent-ui/moves           | Reordered rows slide to their place                                   |
| withNavigation     | @ehtb/agent-ui/navigation      | A shell has `soft: true` links that swap the page without a full load |
| withPrefetch       | @ehtb/agent-ui/prefetch        | A shell fetches a soft link's page when the visitor hovers it         |
| withViewTransition | @ehtb/agent-ui/view-transition | A shell animates the swap of a soft navigation                        |

## Installing

```bash
npm install @ehtb/agent-ui
```

```javascript
// build.config.mjs
import { frameworkBuildOptions } from "@ehtb/agent-ui/build/presets.mjs";

export default ({ dev = false, validator } = {}) => ({
  ...frameworkBuildOptions({ dev, validator }),
});
```

```text
agent-ui build         write dist/ (--dev keeps the validator, --static renders every page to a file)
agent-ui dev           serve with hot reload: the edited page is swapped in place and keeps its state
agent-ui serve         serve the build on localhost:8080, rendering pages (for trying, not for production)
agent-ui check         render every page headlessly and report spec, link, data and size problems
agent-ui explain       print the one valid form of a recipe or a part of the grammar
agent-ui schema        write the JSON Schema of the spec
agent-ui init          write the rules for agents into the project's AGENTS.md
```

To set up a coding agent, run `npx agent-ui init` once, point it to `node_modules/@ehtb/agent-ui/docs/AGENT-RULES.md`, and let it use `agent-ui explain` and `agent-ui check` in its loop. Every recipe in `cookbook/` is a page that `check` renders and a test drives, so copying one is safe.

## Website & docs

- <https://ehtb.github.io/agent-ui/>
- docs/AGENT-RULES.md (start here), docs/GUIDE.md, docs/API.md, docs/BUILD.md, docs/DESIGN.md
- cookbook/ and examples/README.md

## Browser Support, Stability & Maturity

- **Targets:** Node 22+ on the server, and evergreen browsers (Chrome and Edge 93+, Firefox 92+, Safari 15.4+).
- **Versioning:** `0.x`. A minor release may change the grammar, an API or a message, and `CHANGELOG.md` says how to move. From `1.0.0` it follows semantic versioning.
- **Maturity:** young software. The thesis, that a closed grammar with messages that teach it lowers an agent's error rate, is a hypothesis recorded in `docs/DESIGN.md`.

## Contributing

Want to contribute? Read [CONTRIBUTING.md](CONTRIBUTING.md). The guide for work on the framework is [AGENTS.md](https://github.com/ehtb/agent-ui/blob/main/AGENTS.md).

### Hacking guide

There is nothing to install: the framework has no dependencies. You need Node 22.

```bash
npm test                  # the framework's tests and the examples
npm run test:framework    # the framework only
npm run typecheck         # check the .d.ts files (needs tsc)
```

Change something in `src/`, then add a test in `test/`. The docs are tested against the code, so change them in the same commit.

Report a vulnerability as described in [SECURITY.md](SECURITY.md). Questions and bugs: [SUPPORT.md](SUPPORT.md). License: MIT, see [LICENSE](LICENSE).
