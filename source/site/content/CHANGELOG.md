# Changelog

The project follows [semantic versioning](https://semver.org/) from 1.0.0. Until then a minor version (0.x.0) may change the grammar, an API or a message, and the entry says how to move. What counts as the public surface is in `README.md`, "Browser Support, Stability & Maturity".

## 0.7.0 - 2026-11-21

Packed locally as `0.7.0-pre.N`. Nothing here is removed; the one entry under Changed says how to move.

### Added

- **Tree shaking, opt-in: `treeShake` in `build.config.mjs`, with `esbuildTreeShake(esbuild)` (`@ehtb/agent-ui/build/tree-shake.mjs`).** Without it a module is included whole. With it the build leaves out the exports no page imports and the declarations nothing uses, through the project's own esbuild (the framework still has no dependencies). The bundler decides which names are used (the names a module's importers bind, everything for an entry, a namespace import and an `import()` target, repeated until nothing changes, so a module that only the dead code needed leaves the graph with its chunk, and an `import()` whose call was left out is not built); esbuild decides what in a module is dead and keeps what it cannot show to be harmless, such as a call at the top level (`/* @__PURE__ */` or `pure: [...]` says it is). With `sourceMaps` the map follows esbuild's back to the source lines. A tool that throws, returns the wrong shape or returns code with an import or export statement is a build error naming the module. Measured: `examples/events` 2.3% to 2.7% less JavaScript to download at startup, the editor page of the largest app tried 0.8% (its weight is a vendor file that was already bundled). `examples/events` turns it on for production and has a Chrome test of the shaken site. `docs/BUILD.md`, "Tree shaking".
- **`markMadeBy(name, node, passedIn?)`** (`@ehtb/agent-ui/components`) for a component written as a plain function, which `expandComponents` never reads: it records `name` as the author of the nodes the function writes, except the nodes the page passed in, so a project check (`forbidTags`) tells a raw `button` of a page from the one inside the component. `expandComponents` now keeps the author of a node it copies. `docs/API.md`, "Components".
- **Project checks: the project's own rules over every finished spec.** `checks` in `build.config.mjs` takes `{ name, node }` rules and `forbidTags` (`@ehtb/agent-ui/checks`). `agent-ui check` and a production build run them over each page's and shell's finished spec; a finding is `{ problem, fix }` and is reported as `where: problem. fix (check "name")`. A rule such as "a button comes from `ui/button.js`" has to tell the raw `button` of a page from the one inside the Button component, which the expanded spec no longer shows, so `expandComponents` records which component's definition wrote each node (`madeBy`, `@ehtb/agent-ui/components`), beside the spec and not in it: the JSON is unchanged. `docs/BUILD.md`.
- **Performance checks.** `withPerformance` (`@ehtb/agent-ui/performance`) is a development-only plugin that reports what costs Lighthouse points: render-blocking head scripts, unsized or lazy LCP images, server-side resource waterfalls, unused namespaces, DOM size, unvirtualized and unmemoized lists, slow recompute of derived values, unused CSS, LCP, CLS and long tasks. `agent-ui check --performance` runs the static checks and reports unused module exports, and `budgets.stylesheetsGzipBytes` fails a build whose page loads too much CSS. A production build swaps the module for a stub that accepts `withPerformance` and `withPerformance({ ... })`, so listing it costs nothing there.
- **The SVG elements that draw, paint, filter and animate, with text.** The grammar held ten SVG tags for icons and refused text, so a chart needed a plugin for its labels. It now holds `text`, `tspan`, `textPath`, `title`, `desc`, gradients, `pattern`, `clipPath`, `mask`, `marker`, `filter` and its `fe*` primitives, the animation elements, `image`, `symbol`, `defs`, `foreignObject` and the SVG `a`, with the standard's attribute names in their own case. The validator follows the standard's content model (text only in the text elements, a `stop` in a gradient, a filter primitive in a filter, HTML only inside a `foreignObject`); the tables are `grammar.svgHolds`, `grammar.svgParents` and `grammar.svgTextTags`. The runtime carries "inside an svg" through `when` and `each`, and the server DOM keeps the case of an SVG element's name. Recipe `svg-chart` (`agent-ui explain svg-chart`), tested in the shim and in Chrome.
- **Named re-exports.** `export { a, b as c } from './x.js'` is accepted in the project's own files and in packages. An importer of a re-exported name is written against the module that defines it, through any chain of re-exporting modules, so a page that imports `Button` from `ui/index.js` gets `button.js` and neither `index.js` nor the components it lists, and a barrel no longer makes an import cycle between the components that import from it. A module that is in the page because the page imports a namespace of it, its effect, a name of its own or loads it dynamically has every name it re-exports. `export *` stays an error, now with the fix: list the names. `docs/BUILD.md`.
- **`api.onLeave(handler)`.** A plugin that has to flush what it holds when the page is left (an autosave, a dismissed notice) used to listen for `pagehide` and also register an `onDestroy` cleanup, because a soft navigation destroys the page app and fires no `pagehide`. `handler({ reason })` runs with `'pagehide'` when the browser leaves the document (again at each leave, the back/forward cache included) and with `'destroy'` when the app is replaced or destroyed, before it stops, so `dispatch` still works. A handler that throws is reported and the others still run. `docs/API.md` gets a table of how a page ends (a load, the back/forward cache, a soft swap), what runs in each and what state outlives it.
- **`withPrefetch` options.** `pointerdown` (also fetch at the press, for a touch that has no hover), `viewport` (fetch a soft link once when it scrolls into view) and `maxAge` (how long a fetched document is used, 1000 to 600000 ms). All default to the 0.6.0 behavior; a wrong option fails where it is written.

### Changed

- **`withPerformance` adds up layout shifts as Lighthouse does.** The check looked at each shift alone, and a shift is rarely over 0.1 by itself (a late font or image gives several small ones), so it reported a page Lighthouse fails as fine. It now adds the shifts that follow no input in a session window (each less than a second after the one before, the window at most five seconds) and reports once, when a window passes 0.1, with how many shifts and which elements moved. The advice is to reserve the space: width and height on images, embeds and iframes, a `min-height` on a container that fills later, no content inserted above what is shown. The `details` of the finding are `{ value, shifts, ids }`.
- **`withPerformance` and `agent-ui check --performance` no longer report a namespace with `resources` on a page without `ready(state)`.** It was wrong where a page renders without its data on purpose. The finding for a page that has `ready` and a resource that refetches on mount (`revalidate: 'never'`) stays. To move: nothing.
- **`agent-ui check --performance` does not report an unused export when `treeShake` is on**, and its message otherwise names the option.
- **A soft link follows a redirect to another page of the site.** A soft link to an address that the server redirects to another page of the same site now shows the page the redirect ends at, in the shell that stays, and the address is that page's (the link's `#hash` stays), as a page load would end there. Before, any redirect was a normal page load, so the shell and the view transition were lost on exactly such a link. A redirect to another site, or to a page that cannot be shown in place, is still a normal page load, at the place the redirect ends. There is no redirect table in the framework: the server says where a URL leads. `withPrefetch` follows the redirect too. For a plugin that uses the hooks: `extendNavigation({ document })` may answer `{ text, key }` for a redirect, and `fetchPlainDocument` answers `{ text, key }` (it was `{ text }`) and takes `{ origin, basePath }` to read where a redirect led. To move: nothing, unless a plugin reads the answer of `fetchPlainDocument`; `key` is added to it.
- **`withViewTransition` fades only the page.** It named no element, so the whole page cross-faded, shell included, unless every shell element that should stay had its own `view-transition-name`, and a new shell element without one faded silently. The plugin now names the shell's slot while the transition runs (type `agent-ui-page`) and adds one adopted stylesheet that turns off the root's cross-fade for its own transitions only: the shell stays still without names, and a site's own transitions and a strict style CSP are unaffected. A browser without View Transition types gets the plain transition, as before. Verified in Chrome.

### Documentation

- The runtime is 54 KB (15 KB gzipped); `README.md`, `docs/DESIGN.md` and the shop example's measured tables are updated.

## 0.6.0 - 2026-11-17

### Added

- **A real-browser benchmark** (`examples/bench`, `npm run example -- bench benchmark`): the startup of a server-rendered page at 1,000 to 20,000 rows (largest contentful paint, long tasks, layout shift, and the DOM writes the take-over makes) and the cost of the actions one visitor causes on a list of that size (seed, toggle, add, clear). It builds the example, serves it, and drives headless Chrome over the DevTools protocol with no dependency; it needs Chrome and is not part of `npm test`. The method, the numbers and their limits are in the example's README.
- **`route.query`, and the actions that write it.** The URL's query is state of the framework's `route` namespace (`{ key: value }` of strings, read once when the page starts, server and browser): `route.setQuery` (args `{ key, value }`) sets one key, `route.clearQuery` (args `{ key }`) removes one, and in the browser the address is kept in step with `history.replaceState` (preserving the history state the site keeps), so a filter or a tab is copyable and survives a reload. The back button stays a page — replace, not push, on purpose. A server render renders the query the URL carries and the document carries that state to the browser; a page that takes query state is a page for a render server (a static build renders no query, and the browser makes the differing nodes again, `AUI0305`). The state holds one value per key; an address with a repeated key (`?tag=a&tag=b`) keeps every entry until the page writes that key, because the address is changed key by key. The address is not written while the log is replayed. `docs/API.md`, section 13; recipe `url-query`.
- **Two opt-in plugins make a soft navigation faster: `withPrefetch` and `withViewTransition`.** A shell lists them after `withNavigation` (`plugins: [withNavigation, withPrefetch, withViewTransition]`; `@ehtb/agent-ui/prefetch`, `@ehtb/agent-ui/view-transition`). `withPrefetch` fetches a soft link's document when a mouse hovers it (a touch pointer prefetches nothing) and hints the page's entry file to the browser (`modulepreload`); a document older than five seconds is not used, a failed hover is dropped silently, and every hover renders a page on the server, which is why it is a choice. `withViewTransition` runs the swap as one `document.startViewTransition` (skipped for reduced motion); the whole page cross-fades unless the shell's elements have a `view-transition-name`. They use two hooks the navigation plugin adds, `api.extendNavigation({ document, swap })` and `api.softLinkTarget(element)`; a navigation without them is what it was in 0.5.0. A swap whose navigation was overtaken by a newer one while it waited to be shown no longer swaps its page in. `docs/API.md`, section 13.

### Changed

- **The `route` namespace has a `query` key.** `ui.state().route` is now `{ ..., query: {} }` (and `ui.derived()` reads it the same way), so a test that compares the whole `route` state, or an `initialState` that lists every `route` key, needs `query: {}`. To move: add `query: {}` to the expected state; a page that does not use the query needs nothing else.

### Fixed

- **An adopted row is not written the key it already has.** `data-key` was set on every row of a list taken over from the server, and a real browser reports the same-value write as a DOM mutation (the test shim skips a write of the same value, so only the new browser benchmark saw it). One write per row less at startup. `test/adopt.test.mjs` now counts the `setAttribute` calls, not the changes, so the shim test sees what the browser sees.

## 0.5.0 - 2026-11-11

### Added

- **The browser takes over the markup the server wrote** instead of building the page again (`app({ adopt })`; `startPage` turns it on for the first page of a document and its shell). A playing video, an iframe, a scroll position and an animation survive, and the browser does about half the layout and style work at 1,000 to 5,000 rows (`docs/DESIGN.md`, "Taking over server markup", has the measurement and its limits). Where a node is not what the browser's own render makes, only that node is made again and `AUI0305` reports it once. `docs/API.md` section 12 has the rules.
- **`agent-ui check` compares each page with what a browser would render** from the state the document carries (`renderFirstPass`, `browserState` and `pageHtml` of the `renderPage` result): a page that differs from the server's markup, differs between two renders (random numbers, a counter), or changes with the time, the time zone or the locale is reported with what it depends on and where the markup first differs. A check renders each URL at least three more times.
- **The validator refuses nestings an HTML parser rewrites** (`src/nesting.js`): a block in a `p`, a `tr` straight in a `table`, a link in a link, an item in an item without a list, a form in a form, anything but options in a `select`, children in a `textarea`. Each message says what the browser does and what to write.
- **Testing helpers:** `parseHtml(html, root)` in `@ehtb/agent-ui/testing/dom-shim.mjs` reads server markup the way a browser does, and `browser.open(url, { beforeLoad })` runs a script before the page's own.

### Changed

- **The server writes `<!--|-->` between two neighbouring texts**, and a second newline after `<pre>` and `<textarea>` when the content starts with one, so a parser reads the markup back as it was written. To move: a test that matches exact markup of a page with a text next to a binding (`Cart: 0`) now matches `Cart: <!--|-->0`.
- **A spec the validator refused nothing about before may now fail** on one of the nestings above, in development and in `agent-ui check`. The `each` topic of `agent-ui explain` and some tests nested a `li` in a `li`. To move: put the nested items in their own `ul` or `ol`.
- **A `textarea` has no children** (its text is the prop `value`); `outline()` no longer reports a textarea's text, only its `value`.
- **The runtime is about 5 KB larger** (47 to 52 KB, 13 to 14 KB gzipped).

## 0.4.0 - 2026-11-09

### Added

- **`pageOf`, and page.js checked as a module.** `@ehtb/agent-ui/pages` exports `pageOf(pageModule, file)`, which a generated entry uses to read `page.js`. A `page.js` that exports no `page` (a misspelt `pages`) fails with the file and "Did you mean `page`?", and `paths` left in `page.js` is reported as belonging in `view.js`.
- **Plugin factories and plugins are told apart.** The package's page factories (`withResources`, `withHead`, `withFollow`, `withMoves`, `withNavigation`) are marked: one given to `app({ plugins })` fails with where it belongs instead of installing nothing. A page factory that throws (for example the plugin `follow` written in `page.js`) or returns something that is not a plugin is reported with the page, and `resources` given to a page is refused when it is installed. To move: list the `with...` factory in `page.js` and the plugin itself (`follow`, `moves`, `resources(fetchFunction)`, ...) in `app()`.
- **`agent-ui check` starts a page with parameters and no `paths`** at a sample URL (`/item/:id` as `/item/1`), without fetching data, so a missing plugin, a resource definition, a derive that throws or a shell read is found. It also reports a `route.go` whose target is not a page of the same shell.
- **`PORT`.** `agent-ui dev` and `agent-ui serve` use `--port`, then the `PORT` environment variable, then 8080. An empty `PORT` is unset; anything that is not a whole number from 1 to 65535 stops the command with exit code 2. To move: `--port=0` is refused (an operating-system port is a library call, `startDev({ port: 0 })`).
- **The API module is checked at startup.** `createSsrHandler` (and `agent-ui check`) verifies that `config.api` exports `createApi` and that its result has `handle` (with `handleForm` a function when present), before answering anything, with the member to add.
- The documentation site at https://ehtb.github.io/agent-ui/ is in the repository (not in the npm package) and is generated from these Markdown files.

### Changed

- **Answers with no body.** `api.handle` may leave `body` out for a 3xx redirect, 204 or 304, which are answered empty; a redirect used to become a 500. Any other status must say what it sends, `null` included.
- **`agent-ui build` reports every failure in one line**, `build failed: …`, with exit code 1: the configuration, a page folder, a generated module, the output directory and a transform included, not only the bundler's own errors.
- **`hosts` must be a list.** `createSsrHandler` and `createStaticHandler` refuse a string at startup; a string was compared as a substring ("localhost" accepted "host"). To move: pass `hostsFor(host)` or `['example.com']`.
- **`renderPage` refuses an unknown option**, with "Did you mean". The advice about the server window is now added only to an error from the page, its plugins or its shell, not to a `stateForBrowser` failure. To move: pass only the documented options.
- **The JSON Schema** allows a key chord only on `keydown` and `keyup` and requires `children` or `otherwise` on a `when`, as the validator always did. A spec the schema lets through is still checked by `validate()`.
- **The request body** is read in the encoding the host set on the stream (a latin1 chunk is not counted as UTF-8), and string chunks are accepted.
- **`agent-ui dev`** reports a taken port as one error naming the port and closes its watchers, instead of an unhandled error event.
- **Head elements** are inserted before the first `</head>`, so a body script containing the literal `</head>` cannot capture them.
- **Messages name `NaN` and `Infinity` as such**, instead of JSON's `"null"`, for a page's `status(state)` and for the handler's options.
- **TypeScript declarations** match the runtime: page and shell plugin environments (`isServerRendering`, `serverRendered`, `basePath`), `create`/`mount`/`describePage`/`currentPage`, `LoadedConfig.entries` (no `url`), `loadConfig({ readOnly })`, `cssOverrides`/`styleSources`, `prerender({ basePath })` and `assertStaticSite`'s result, `withNavigation` and `browserEnvironment` (`basePath`), `validate`'s optional context, and `app({ specChecked })`.
- **Every plugin is optional, and the docs say so** in each place a plugin is listed; `agent-ui explain plugins` says it in its first line.

### Fixed

- **A production page that imports its own `view.js` is warned about again**: the leak check turns itself off only for a development entry, and it names a module reached through `import()`.
- **Small chunks** that grew past `minSharedChunkBytes` by taking another in are no longer folded again, and a chunk folded more than once keeps every name in its reason.
- **Hot reload** versions an import whose chunk file name contains `~`.
- **The server DOM** matches `[attr="value"]`, refuses a selector it cannot match instead of silently returning nothing, and leaves a detached `replaceWith` alone; the test shim's events support `stopPropagation` and `preventDefault`.
- **A thrown string** from a page plugin or a page start is reported as what was thrown, not "threw undefined".

## 0.3.0 - 2026-11-08

### Added

- `loadConfig({ readOnly: true })` finds the pages without rewriting `.agent-ui/`, so a deployed server can run from code it cannot write.
- Example `production-server`: a production host with no dependencies. Node's `http` serves the built files from memory (ETags, immutable hashed assets), `createSsrHandler` renders every page per request, security and CDN cache headers go on every answer, plus `/healthz`, graceful shutdown and a Dockerfile.

### Changed

- `createSsrHandler` answers with `content-length` instead of a chunked body, on every answer except 204 and 304.
- A production page or shell checks its spec on the first app it makes, not on every server render; initial state from a caller (a form outcome, `initialStateFor`) is still checked each time. `specChecked` is the new `app()` option behind it.
- `agent-ui check` reads the source once and reports every problem in it, instead of reading it again for each entry after the first problem. A broken project costs a check what a good one costs.
- `agent-ui check` renders a few URLs at a time and keeps the report in page and URL order. Pages that wait on data no longer wait for each other, and a page that never becomes ready costs one `renderTimeoutMs` wait per batch. A `fetchFunction` that keeps mutable state now sees requests interleaved, as on a server.
- `agent-ui check` compiles each page's URL pattern once, lists at most ten pages in a link message, and does not repeat an identical link problem.
- `.agent-ui/` is no longer deleted and rewritten on every load: a generated file is written only when its text changed, and what the last load did not generate is removed. A second `check` on an unchanged project leaves the tree untouched.

### Fixed

- `agent-ui check` reads every module the pages reach as the bundler does and reports what a build or `agent-ui dev` would refuse: a re-export or `export *`, a default import or export in the project's own files, an import that does not resolve, an import cycle. Each is named once, with its file and line. Node imports such files, so `check` used to pass them.
- `agent-ui check` no longer reports a soft link to a page that could not be loaded as a link to a page without a shell; the page's own problem is the one reported.
- An app ignores an event whose target has left its root, so a button on a page inside a shell that removes itself when clicked (closing its dialog) no longer reaches the shell with the page's action.

## 0.2.0 - 2026-11-04

### Added

- **Base path.** `basePath: '/shop'` in `build.config.mjs` serves a site below a path of its domain. Specs, page folders, `route.path`, resources and the API keep the site's own paths; the runtime (in `href`, `src`, `action`, `formaction`, `cite`, `ping` and `srcset`), the build, the render server, soft navigation and `agent-ui serve`/`dev` add or remove the base on the wire (`src/base-path.js`).
- **`paths` in view.js.** A page with parameters lists the URLs to render (`export const paths = ['/event/1']`, or an async function). `agent-ui check` renders each of them, and `agent-ui build --static` writes each of them (`build/page-paths.mjs`). A listed URL that the server answers with another, more specific page is refused by both, before anything is written.
- **SVG.** A closed subset for icons and simple drawings: `svg`, `g`, `path`, `circle`, `ellipse`, `rect`, `line`, `polyline`, `polygon`, `use`, with their attributes. Shapes stand inside an `svg` only, an `svg` holds only shapes, and it says what it shows (`role: 'img'` and `aria-label`, both required) or is `aria-hidden`. Recipe `svg-icons`.
- **Cost, as numbers.** `measureAction` and `assertCost` (`@ehtb/agent-ui/testing/helpers.mjs`) count what an action costs: DOM writes, effect runs, state keys and derived values changed, elements shown. `agent-ui check` prints the elements, largest list and state size of every page it renders. `budgets` in `build.config.mjs` turn a page over a limit into a build error (`pageGzipBytes`) or a check problem (`stateBytes`, `elements`, `listRows`). The build report and the manifest give each page's startup size.
- **Scroll restoration.** Back and forward after a soft navigation return to the window's scroll position on that entry, also after a reload and a return through the back/forward cache.
- Example `islands`: agent-ui as a library inside a page the host owns, no `pages/` folder and no build, two apps connected with `syncApps`.

### Changed

- **`follow` and the sliding of reordered rows are plugins.** A page that uses the `follow` prop lists `withFollow` (`@ehtb/agent-ui/follow`), and a page whose rows with `transition` should slide when a list reorders lists `withMoves` (`@ehtb/agent-ui/moves`); for `app()` the plugins are `follow` and `moves`. To move: add them to `plugins` of the page (recipe `drag-reorder`). A spec that uses `follow` without its plugin fails at mount naming it; rows that would have slid jump, and development says so in the console. The enter and leave markers of `transition` stay in the runtime. Plugins get two hooks for this, `api.onReorder` and `api.handleProperty`. The runtime is 0.7 KB smaller (0.26 KB gzip) for every page that does neither.

- `createSsrHandler` answers a body over `maxBodyBytes` with 413 (was 400), refuses a compressed body (`content-encoding`) with 415, and refuses a declared `content-length` over the limit before reading.
- `agent-ui build --static` refuses a page with parameters only when its view.js lists no `paths`; the message says how to list them.
- **The package exports only the build stages that have declarations** (`@ehtb/agent-ui/build`, `/build/build.mjs`, `/build/config.mjs`, `/build/presets.mjs`, `/build/prerender.mjs`) and the two development servers (`/cli/ssr-server.mjs`, `/cli/static-handler.mjs`). The other stages remain internal modules of the repository. To move: import the pipeline from `@ehtb/agent-ui/build`, or the stage you need from the list.

### Fixed

- **The build entry points have type declarations.** `@ehtb/agent-ui/build` and `@ehtb/agent-ui/build/build.mjs` now resolve with `skipLibCheck: false`; `build/build.d.mts` declares the manifest and the stage, and `build/index.d.mts` re-exports it. A test checks that every `types` target in `exports` exists, including the files a wildcard covers.
- `agent-ui --help` and `agent-ui --version` print the command list and the package version; `agent-ui` with no command prints the same usage instead of a one-line error.

## 0.1.0

The first version: the spec grammar and its builders, namespaces and actions, resources, pages as folders, shells and soft navigation, server rendering and `createSsrHandler`, the bundler, `agent-ui build | dev | serve | check | schema | explain | init`, the cookbook and the examples.
