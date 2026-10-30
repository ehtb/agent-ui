---
name: migrate-to-agent-ui
description: Migrate an existing JavaScript or TypeScript web application, whatever UI framework, router, state library or build tool it uses, to agent-ui (a JSON spec for the UI, state as plain data in namespaces, behavior only through named typed actions). Use when asked to port, convert, rewrite or move an app, a page or a component to agent-ui, or to estimate what such a move would take.
---

# Migrate an existing app to agent-ui

You are moving an application from some other way of building a UI to agent-ui. The source can be anything: a component framework, a server framework with templates, a router with file conventions, hand-written DOM code. This skill does not depend on which. It works from what the source app **does** (pages, state, data, events, markup) and rebuilds that in the one form agent-ui allows.

A migration is finished when the new app **behaves like the old one and `agent-ui check` and the tests pass**, not when the code looks right. Everything below exists to make that checkable.

## Ground rules

1. **Read the target first.** Before you design anything, read `node_modules/@ehtb/agent-ui/docs/AGENT-RULES.md`, then `docs/GUIDE.md` in the same folder (in the framework repository: `docs/AGENT-RULES.md`, `docs/GUIDE.md`). Run `agent-ui explain` and look at the recipes. Do not write agent-ui code from memory of other frameworks: the grammar is closed and every wrong form is rejected.
2. **Convert behavior, not syntax.** Do not translate line by line. Describe what the old code does as state, derived values, actions and markup, then write that. A line-by-line port produces the old structure in the new grammar, and most of it will not fit.
3. **Never invent a mapping.** If the old code uses something with no row in `references/concept-map.md`, stop and put it on the decisions list (step 4). `docs/AGENT-RULES.md` says the same: propose the change, do not hack around a limit.
4. **Old and new coexist until parity.** Do not delete the old code until the user says so (step 9).
5. **Add no dependencies to the new app** beyond `@ehtb/agent-ui`. A library the old app used for drawing (charts, editors, maps) stays a library, claimed by a plugin (`mountElement`); everything else becomes native.
6. **Keep a written record.** `MIGRATION.md` at the project root holds the inventory, the decisions and the progress (template: `references/inventory-template.md`). A migration spans many sessions; the file is the memory.

## Step 0: set up

1. Find the package manager and the Node version (`engines` in the package: agent-ui needs Node 22 or later). Install `@ehtb/agent-ui` if it is missing.
2. Run `agent-ui init` (it writes the rules for agents into the project's `AGENTS.md`).
3. Choose where the new app lives and write it in `MIGRATION.md`:
   - **Side by side (default):** the new app is a separate folder or workspace in the same repository (`agent-ui/` or `next/`), with its own `pages/` and `build.config.mjs`. The old app keeps running and keeps its tests.
   - **In place:** only when the old app is small enough to replace in one pass and the user wants that.
4. Record how to run the old app's tests and how to start it. You need them as the reference for behavior.

## Step 1: inventory the old app

Fill `MIGRATION.md` by reading the code, not by guessing from the framework's name. For each item write what it is, where it lives and which of its behaviors a user can see.

- **Routes and URLs:** every URL the app answers, its parameters, redirects, 404 handling, query strings.
- **Layouts and chrome:** what stays the same across routes (header, navigation, footer, a player).
- **Components:** every reusable piece, its props, its variants, its slots or children, its events. Mark each as *markup only*, *has state*, *has effects*, *wraps a library*.
- **State:** every place state lives. Separate: UI-only state (open/closed, selected, drafts), shared client state (a store, a context), server data (a cache of fetched records), state in the URL, state in browser storage.
- **Data and effects:** every request (method, URL, when it fires, what it depends on, how failure and retry work), every timer, subscription, observer, window or document listener, and every effect that touches the outside.
- **Forms:** fields, validation rules, submit path, what happens on success and on failure, whether it must work without JavaScript.
- **Server side:** endpoints, sessions, authentication, server-rendered or static output.
- **Document:** titles, descriptions, meta tags, language attributes.
- **Styling and assets:** stylesheets, utility classes, CSS modules, fonts, images, icons.
- **Libraries that draw or measure:** charts, editors, maps, drag and drop, virtual lists, animation.
- **Tests:** what exists, and what each one proves.

The inventory is complete when you could rebuild the app's observable behavior from it alone.

## Step 2: map every item

Use `references/concept-map.md`. For each inventory row write its target in `MIGRATION.md`: a page folder, a namespace, a `resources` entry, a plugin, a component definition, a spec fragment, a server endpoint, or *no mapping*.

The shape of the result is fixed:

- A URL becomes a folder with `page.js` (behavior) and `view.js` (content).
- State becomes namespaces; each concern gets one, named for the concern, addressed by id.
- Every change of state becomes an action of its namespace. Cross-namespace consequences go through `calls`.
- Server data becomes a `resources` entry; the page says when it is `ready`.
- The outside world (timers, observers, window events, drawing libraries) becomes a plugin that talks to the app only through `api.watch` and `api.dispatch`.
- Markup becomes builder calls from `@ehtb/agent-ui/spec`; reusable markup becomes `defineElement`.

## Step 3: reduce before you port

Smaller input makes a better migration. Before writing anything, note in `MIGRATION.md`:

- State that is derivable (a filtered list, a count, a formatted label) is not state: it becomes `derive`.
- State that mirrors the server (a cache the old framework kept for you) is not state you write: it is the owned output of a resource.
- Effects that only synchronise two pieces of state disappear: the derived value replaces them.
- Components that differ only by a prop collapse into one definition with variants.
- State that must survive a page load moves to the server. agent-ui has no browser storage and no client-side router, so "persist to local storage" and "keep state across routes" become server data.

## Step 4: decisions for the user

Some old behavior has no equivalent, and the choice changes the product. Collect these in `MIGRATION.md` under *Decisions* and **ask the user before you build around them**. Typical ones (details and options in `references/concept-map.md`, section "Not available"):

- Client-side navigation without a page load (becomes page loads, or soft links inside a shell).
- Browser-stored state (becomes server state).
- Component-local state that is not per list row (becomes a namespace keyed by id).
- Rows that are very long lists (no virtualization).
- Native drag and drop (becomes pointer events with the `drag-reorder` recipe).
- SVG, canvas and media elements (become a plugin that draws into one element).
- Portals and positioning libraries (content renders in place; CSS positions it).
- Animation libraries (become `transition` plus CSS).
- Randomness and the clock inside logic (become state set by an event or a resource).

Use a single question with concrete options for each, with your recommendation first. Do not ask about anything the concept map already settles.

## Step 5: port in this order

Work in slices that can each be checked. Finish and verify one slice before starting the next.

1. **Pure logic.** Validation, formatting, filtering, sorting, reducers, URL builders. Keep them as plain functions in their own modules and import them from namespaces. Copy the old unit tests next to them; they should pass unchanged. This is the cheapest proof that behavior is preserved.
2. **Namespaces.** Per concern: `state`, `derive`, `actions` with every argument declared, `resources` for server data, `shapes` for list items. Test them without any markup: dispatch actions, assert `ui.state()` and `ui.derived()`.
3. **Leaf components** (markup only). Spec fragments or `defineElement` definitions. For a component library, follow `docs/CONVERTING.md`: quote the original, decide each item, prove parity.
4. **One page**, the simplest route first. Copy the closest recipe (`agent-ui explain <recipe>`), then replace its content. Run `agent-ui check`.
5. **The remaining pages**, by route, in the order of the inventory. Reuse the namespaces and components you already have.
6. **Layout and chrome.** A shared `layout` function, or a shell with `soft` links when something must stay mounted (`docs/GUIDE.md`, "A header that stays, and soft links").
7. **Server side.** Endpoints as `api.js` tables, forms as `forms` handlers, or the existing server in front with `createSsrHandler`.
8. **Plugins** for what remains outside: drawing libraries (`mountElement`), timers, observers, window events.
9. **Styling.** Plain CSS: `pages/style.css` for everything, `page.css` per page. Keep class names greppable; do not port a CSS-in-JS runtime.
10. **Document head.** `head` on every page: title, description, attributes.

Rules for every slice:

- Every list has a unique stable `key`. Every element a test or another agent addresses has an explicit `id`.
- Inputs, selects and textareas need `aria-label`; images need `alt`; buttons and links need text or a label.
- Actions do not touch the DOM, the clock, random numbers, timers or the network.
- Do not copy outer row fields into inner items; use `as` and `row(...)`.
- Format numbers, dates and money in `derive` (recipe `format-values`).

## Step 6: prove behavior

For every slice:

1. `agent-ui check` prints nothing. Fix every line it prints.
2. Port the old tests. A test of the old app that clicked a button and expected text becomes: dispatch the action (or fire the event on the DOM shim), `await ui.settle()`, assert `ui.outline()` or `ui.state()`. Call `assertNoErrors(ui)` after the step that opens a branch. Run development-only behavior with `dev: false` as well.
3. For each user-visible flow in the inventory, write a **scenario**: the list of actions a user would take. Run the same scenario against the old app (its tests or by hand) and the new one, and compare the visible result. Keep the scenario as a regression test (`ui.replay(log)`).
4. For idempotent user actions (blur after Enter, double click on submit) use `assertRepeatable`.
5. Build both ways: `agent-ui build --dev` and `agent-ui build`. Read the chunk report. Compare the size of the old production bundle with the new one and record both in `MIGRATION.md`.
6. For what only a real browser shows (focus, layout, scroll, native controls), say so. The test DOM is not a browser. If `@ehtb/agent-ui/testing/browser.mjs` is usable, drive headless Chrome; otherwise list those flows for the user to check by hand.

## Step 7: leftovers check

Before you report:

- Search the new app for imports of the old framework, old router, old store and old CSS runtime. There must be none, except libraries kept on purpose behind a plugin.
- Search for `Date.now`, `Math.random`, `fetch`, `setTimeout`, `localStorage` and DOM access inside namespaces. There must be none.
- Every inventory row has a status: *ported and verified*, *ported, not verified* (say why), *decision pending*, or *not ported* (say why).
- Every divergence from the old behavior is written in `MIGRATION.md`, with the reason.

## Step 8: report

Reply with: what was migrated, what was verified and how, the divergences, the open decisions, the size comparison, and the exact commands to run the new app and its tests. Do not report as finished anything in the *not verified* or *pending* groups.

## Step 9: cut over (only when the user says so)

Switch the deployment target, remove the old app and its dependencies, update scripts and CI. This step changes the user's repository history and deployment; do not start it on your own.

## When the migration is large

Do it in rounds of one page or one namespace. After each round: update `MIGRATION.md`, run `agent-ui check` and the tests, and commit if the user asked you to commit. If you delegate to other agents, give each a slice, its rows in `MIGRATION.md`, the mapping, and the instruction to read this skill; keep one agent responsible for the shared namespaces and layout, because they are the files every page imports.

## References

- `references/concept-map.md`: what each common construct of an old app becomes, with code, and what has no equivalent.
- `references/inventory-template.md`: the `MIGRATION.md` to copy.
- `docs/CONVERTING.md`: converting a component library with parity tests.
- `docs/GUIDE.md`, `docs/API.md`, `docs/BUILD.md`: pages, grammar, bundling.
