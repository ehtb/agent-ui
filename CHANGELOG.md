# Changelog

The project follows [semantic versioning](https://semver.org/) from 1.0.0. Until then a minor version (0.x.0) may change the grammar, an API or a message, and the entry says how to move. What counts as the public surface is in `README.md`, "Browser Support, Stability & Maturity".

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
