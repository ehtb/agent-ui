# Changelog

The project follows [semantic versioning](https://semver.org/) from 1.0.0. Until then a minor version (0.x.0) may change the grammar, an API or a message, and the entry says how to move. What counts as the public surface is in `README.md`, "Browser Support, Stability & Maturity".

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
