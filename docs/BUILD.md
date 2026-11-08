# Build pipeline

A build turns the folders below `pages/` into a site in `dist/` that any static host can serve. You get separate, readable JavaScript and CSS files, the agent-ui runtime as its own cacheable chunk, and one HTML page per page. Which pages exist is not configured: a folder with a `page.js` is a page and its path is its URL (GUIDE.md, section 1).

```
agent-ui build        production: hashed file names, comments and indentation stripped, spec validator left out
agent-ui build --dev  development: stable names, readable output, validator included
agent-ui dev          development server with hot reload at http://127.0.0.1:8080
agent-ui serve        the built site, rendered per request, at http://127.0.0.1:8080 (development and test only)
```

The command treats the current directory as the project root, reads `build.config.mjs` there and looks for the pages in `pages/`. `--config=<file>` names another file. Every example in this repository has its own `build.config.mjs` to copy from.

Three things to know up front:

- **Names are never mangled.** Production strips comments and indentation only. A real minifier can be plugged in through the `transform` option (`examples/events` shows esbuild), or run over `dist/assets/` afterwards.
- **The pipeline has no dependencies.** It needs Node 22 and nothing else, so it runs where npm installs are blocked.
- **Pages are served over HTTP.** A built site is served by a server, never opened from a file: `agent-ui serve` for development and tests, or your own server with `createSsrHandler` in production (see "Production checklist").

## Entry points of the package

The package is split so that each part can be imported, bundled and dropped on its own:

| Import | Part | Reaches |
|---|---|---|
| `agent-ui` | the runtime | the validator and three small shared modules (`src/spec-core.js`, `src/messages.js`, `src/namespaces.js`) |
| `@ehtb/agent-ui/shell`, `/navigation` | a shell's definition and the soft navigation plugin | `shell` reaches the runtime and `syncApps`; `navigation` reaches the pages module: only pages that list a shell download them |
| `@ehtb/agent-ui/pages` | `definePage` and `startPage`, what every page runs | the runtime, hydration, the URL patterns and the server-only and development halves that production builds replace by stubs; the debug panel only through a dynamic `import()` |
| `@ehtb/agent-ui/resources`, `/url-pattern` | a plugin and the URL pattern matcher | nothing from the runtime (`resources` reaches only `src/messages.js`) |
| `@ehtb/agent-ui/window-events`, `/components`, `/spec-tools`, `/memoize` | plugins and tools | the shared modules, plus the validator for `spec-tools` |
| `@ehtb/agent-ui/spec` | spec builders | the shared modules; in development also the call-site checks (`src/spec-checks.js`) and the validator's grammar, in production a stub replaces the checks |
| `@ehtb/agent-ui/devtools` | the debug console | nothing; an app made with `debug: true` fetches it on demand |
| `@ehtb/agent-ui/build`, `@ehtb/agent-ui/build/build.mjs`, `/build/config.mjs`, `/build/presets.mjs`, `/build/prerender.mjs`, `@ehtb/agent-ui/server/*.mjs`, `@ehtb/agent-ui/cli/ssr-server.mjs`, `/cli/static-handler.mjs` | the build pipeline, the render handler and the development server | Node only; nothing in the browser entries can reach them |

`test/chunkability.test.mjs` builds the module graph of every browser-side entry and asserts exactly what it reaches, so a plugin that starts importing another plugin, or an entry that reaches the build or the devtools, fails there. `package.json` declares `"sideEffects": ["**/*.css"]`: no JavaScript module does anything when it is imported, so a bundler such as esbuild or Rollup may drop whatever a project does not use. agent-ui's own bundler works per module (no tree shaking inside a module, see "Limits"), which is why the entries are small modules.

## What gets built

```
dist/
  index.html                    the page "/" (a page is <name>.html; "/" is index.html)
  about.html, event-id.html     one page per folder: stylesheet <link>s, modulepreload hints, one <script type="module">
  about/index.html              the page rendered at build time, with `--static` only (see "Static site")
  data.json                     copied from public/ as it is (see publicDir)
  manifest.json                 pages, chunks, sizes, which chunk loads when (for agents and deploy scripts)
  assets/
    agent-ui.<hash>.js          the core runtime (src/ui.js), loaded by every page
    agent-ui-<names>.<hash>.js  the rest of the framework the pages <names> use (pages, hydration, resources, shell, ...)
    vendor-<package>.<hash>.js  an npm package, in a file of its own
    shared-<names>.<hash>.js    the app's code several pages import (shared namespaces, shared components, global CSS)
    about.<hash>.js             the page's own code and its finished spec (data)
    about.<hash>.css            its stylesheet (page.css)
    <chunk>.<hash>.js.map       with sourceMaps: true, the source map of each chunk (see "Source maps")
    devtools.<hash>.js          lazy chunk, fetched only by an app made with debug: true
```

A page's file name is its URL with `/` replaced by `-` and the parameter marks removed: `/` is `index`, `/event/:id` is `event-id`. Two URLs that would give the same name are an error that names both. Pages contain no inline JavaScript or CSS. Asset URLs are root-absolute, so the site is served from the root of its domain. Hashed assets can be cached forever, and the dev server sends `immutable` headers for them. Changing a page changes only that page's chunk name. The runtime chunk, the framework's other chunks and every package's chunk keep their names and stay cached: an edit to the app's code never changes them. Tests cover this.

Next to the build output the project gets `.agent-ui/`, generated on every build and read again by `check` and `serve`: for each page a browser entry (`main.js`), a server module (`app.js`) and the page's finished spec (`spec.js`), generated from the folders, and for each shell (`docs/API.md`, section 13) its finished content once (`shells/<name>.js`, which the entries of its pages import, so it lands in a shared chunk). CSS entry points also get browser-only style modules (`styles/<name>.js`), one per file in the `@import` graph; they are the only modules that import CSS. A generated file is written only when its text changed, so a second load leaves an unchanged tree untouched; what a previous load wrote and this one did not (the folder of a deleted page, a shell no page uses, the files of a production build after a development one) is removed. `app.js` imports `view.js` and builds the spec in Node; `main.js` imports `spec.js`, the spec as data, so the browser never downloads the view. With `--dev` the browser entry imports `view.js` and builds the spec itself, because `agent-ui dev` never evaluates a page in Node and a page module imported there would go stale between rebuilds. `.agent-ui/` ignores itself (it holds its own `.gitignore`); never edit it.

### The finished spec

A production build evaluates each page once in Node and ships its finished spec (view, pending view and layout) as data in `spec.js`. Before writing it, the build checks it with the validator, so the message names the page and a production browser bundle does not need the validator. The browser builds its DOM from that spec exactly as it did when it built the spec itself; what changed is only that the code that assembles the spec (the builders, components and layouts) stays in Node. A page whose `view.js` throws, or whose spec is not valid, fails the build with the page's name and the fix. A `view.js` that exports a name other than `view`, `layout` or `pending` fails the same way, with the nearest valid name. Node keeps modules for the life of a process: a second build in the same process (a test or a script, not the `agent-ui` command) evaluates an edited `page.js` or `view.js` again, but not the modules those import, so start a new process for a change deeper down.

## The four stages

Each stage is a plain function in `build/`, usable and testable on its own inside the repository; the package exports `@ehtb/agent-ui/build` and the stages `build`, `config`, `presets` and `prerender`. `build/build.mjs` wires them together. In front of the stages, `build/pages.mjs` (run by `loadConfig`) finds the pages in the folders, checks them, writes the generated entries to `.agent-ui/` and hands the bundler a list of entries (`{ name, path, url }`); `build()` also accepts such a list written by hand, which is how the tests and scripts use the stages alone.

| Stage | File | Job |
|---|---|---|
| 1. Module graph | `parse-module.mjs`, `module-graph.mjs` | Parse every module reachable from the entries (the dialect is listed below), resolve imports, order modules dependencies first, detect cycles. Dynamic `import()` targets become extra roots. |
| 2. Chunk plan | `assign-chunks.mjs` | Decide which modules are bundled together (rules below). |
| 3. Generation | `generate-chunks.mjs` | Emit one readable ES module per chunk and one CSS file per chunk that has styles. Chunks are generated in dependency order, so a content hash can include the file names of the chunks it imports. |
| 4. Output | `write-site.mjs` | Write assets, HTML pages and `manifest.json`. Format the build report. |

## How chunks are chosen

1. **Manual chunks win.** `manualChunks` in `build.config.mjs` maps a chunk name to path patterns. `frameworkBuildOptions`, from `@ehtb/agent-ui/build/presets.mjs`, puts the core runtime in a chunk named `agent-ui`, so every page loads it as a separate, cached file. Plugins such as `resources.js` and `window-events.js` are deliberately not listed. They are chunked by use, so a page only downloads the plugins it imports. Patterns support `*` within a directory and `**` across directories.
2. **Everything else is grouped by who needs it and whose code it is.** Each module is tagged with the set of roots that reach it (roots are the pages and dynamic `import()` targets) and with its layer: the framework (agent-ui's own `src/`), one npm package, or the app (everything else, including `.agent-ui/`). Modules with the same set and the same layer share a chunk:
   - the app's code of one page: a chunk named after it, such as `index` or `event-id`; of one lazy root: a lazy chunk named after the file, such as `devtools`;
   - the app's code of several roots: a `shared-<names>` chunk, downloaded once and cached;
   - the framework's code outside the core: `agent-ui-<names>`, such as `agent-ui-checkout-index-product-id` (pages, hydration, resources, the shell);
   - a package: `vendor-<package>`, such as `vendor-chart.js` or `vendor-kurkle-color` for `@kurkle/color`. When pages use different parts of one package, each part is `vendor-<package>-<names>`. Two packages that import each other cannot be two files: their code of the same pages is one `vendor-<names>` chunk.

   `<names>` is the list of roots, or its hash when the list is longer than 48 characters. The point of the layers is caching: the framework and the packages change when you upgrade them, the app's code on every deploy, and a file that holds both would be downloaded again for either.
3. **Small chunks are folded together.** Grouping by the exact set of pages and the layer makes up to one chunk per combination, which on a site of many pages would be dozens of tiny files. A chunk that is not a root's own and is below `minSharedChunkBytes` (default 4096 bytes of JavaScript and CSS source; `0` turns it off) joins a chunk whose pages include all of its own: one of the same layer when there is one, otherwise one of the app's, never a framework chunk or a package's chunk of the other layers. Among those it picks the one with the fewest pages, then the biggest. The chunk says so in its `reason`. The pages that did not need that code download it too: a few kilobytes in exchange for one request fewer. A fold that would make two chunks import each other is skipped.
4. **A page loads its entry chunk and that chunk's static dependencies.** Dependencies come first and are listed as `modulepreload` hints. Lazy chunks are fetched by `import()` when needed. The CSS of eager chunks is linked in the page: global CSS first, then imported/shared CSS, then the page's own `page.css`. The CSS of a lazy chunk is injected by the chunk when it loads.
5. **The chunk graph must be acyclic.** Automatic grouping guarantees it. A bad manual split is reported as `chunk cycle: x -> main -> x` with the advice to adjust `manualChunks`.

### Pages and chunks

Splitting is by page, and it is automatic: every page is an entry, so a page downloads the code it imports and the code its pages share, and nothing else. What to do with it:

- **Import what a page uses, from the module that defines it.** Whole modules are included (no tree shaking), so write one component per module and import it by path. A file that re-exports many components (`index.js`) would put every component in every page, and re-exports are a build error in this dialect.
- **Put what several pages use in a module they all import** (a layout, a shared namespace, shared components). It lands in a `shared-` chunk that is downloaded once and cached.
- **List a namespace only on the pages that need it.** Its `resources` run on every page that lists it, and its code ships in that page's chunks.
- **List the plugins a page needs** (`plugins: [withResources]`): a page without data does not download the resources code.
- **Page styles** go in `page.css` next to the page; styles of every page go in `pages/style.css`. Both may `@import` other `.css` files: a file imported by two pages is one shared stylesheet linked only to those pages, and one imported by every page comes through `pages/style.css`. See "CSS imports" below.
- **Keep the builders out of `page.js`.** `@ehtb/agent-ui/spec` and `defineElement` build the spec in Node, for `view.js`. When a module that `page.js` imports reaches them, a production build still works but prints `warning: src/spec.js is in a browser bundle (the chain of imports)`; move what imports them into a module that only `view.js` imports. A `--dev` build is not checked (its entries import `view.js` on purpose).
- **The manifest lists the size of every module** in each chunk (`moduleSizes`, bytes of source) and the CSS files that make up a chunk (`stylesheetSources`), so you can see what a file costs and what a page pulls in. Each page also lists its stylesheet URLs in order (`stylesheets`) and their total size (`stylesheetsSize`).

`examples/shop` is the model: three pages, a shared layout, cart and components, a cart on the server, and `build.test.mjs` asserting what each page loads. Its README has the measured sizes of every chunk (plain, gzip, esbuild, esbuild + gzip), what is downloaded once and what per page, how the split works step by step, and the limits.

No module is ever duplicated, so module state such as singletons behaves exactly as in the source.

### CSS imports

`page.css` and `pages/style.css` are CSS entry points. They may start with relative imports:

```css
/* pages/checkout/page.css */
@import "../../ui/alert.css";
@import "../../shared/forms.css";

#checkout-form { ... }
```

The build resolves every import at build time, removes the `@import` statements from the CSS it ships, and writes a browser-only style module for each file. The module imports its own imports first and the file's CSS last, so dependencies come before the rules that use them. The page entry imports the `page.css` module; `global.js` imports the `pages/style.css` module. No `page.js`, `view.js` or component module imports CSS.

A CSS file imported by pages A and B is reached by both entries, so the existing chunk plan puts it in one shared stylesheet for those two pages. A file imported from `pages/style.css` is loaded by every page. A file imported by one page stays in that page's chunk. `minSharedChunkBytes` counts CSS bytes, so a large shared stylesheet is not folded into an all-pages chunk merely because its generated module is small. A tiny shared file may still be folded into a bigger shared chunk, exactly as small JavaScript chunks are.

The accepted form is one statement per import, at the top of the file, before rules and other at-rules:

```css
@import "./file.css";
```

- The path is relative and ends in `.css`; a URL, a package name, `url(...)`, and `layer`, `supports` or a media query on the import are refused with a fix. Put a media query inside the imported file.
- Imported files may import further files. Cycles are refused with the chain.
- `@import` after another rule is refused; the build does not leave it for the browser to fetch.
- Order is global CSS first, imported files before their importer, and `page.css` last, so a page rule can override a shared component rule. For unrelated shared files whose order matters, use `@layer` or keep them in one importer.
- CSS stays global: importing a component's stylesheet includes it in the pages that import it; it does not scope its selectors. Use a naming convention such as `ui-alert`.

A page that uses only shared CSS can have a `page.css` with only `@import` statements. `agent-ui check` reports a missing file, a late import and a cycle when it loads the page folders; a production build does the same before it writes the site.

## Output format

Each source module becomes a function scope inside its chunk. Names never collide and nothing is renamed:

```js
import { module_ui } from "./agent-ui.de07cf78.js";
import { module_plugins } from "./shared-blog-catalog-home.5b2e0a47.js";

// ---- pages/home/page.js ----
const module_home_page = (() => {
const { definePage } = module_ui;
...original code without import/export keywords...
return { page };
})();
```

Variable names are `module_<file>`. Directory names are added on a clash, giving `module_home_page` and `module_blog_page`.

## Supported source dialect

The bundler has no JavaScript parser. It accepts the subset below, and each statement must start at the beginning of a line.

| Allowed | Notes |
|---|---|
| `import './file.js';` | Side-effect import. The extension is required. |
| `import './file.css';` | Stylesheet, extracted per chunk and concatenated in module order. In `page.css` and `pages/style.css`, a top-level `@import "./file.css";` is resolved by the build (see "CSS imports"); JavaScript never imports a page's CSS. |
| `import { a, b as c } from './file.js';` | May span lines. |
| `import * as ns from './file.js';` | |
| `import('./file.js')` | String literal only. Creates a lazy chunk. |
| `import { a } from 'package'`, `'package/subpath'` | Resolved through `node_modules`, or the package importing itself, and the package's `exports` map with the `import` and `default` conditions and one `*` wildcard. The target must be an ES module `.js`, `.mjs` or `.css` file. This is how `agent-ui` itself is imported. |
| `export const|function|class name`, `export { a, b as c };` | Exports must not be reassigned elsewhere, because imports are bound once. |
| `import name from 'x'`, `import name, { a } from 'x'`, `import name, * as ns from 'x'`, `export default ...` | **In files of a package only**, so code you cannot change can be bundled: the file a package import (`'package'`, `'package/subpath'`) resolves to, including a linked, `file:` or workspace package whose real path is outside `node_modules`, and the files it imports by relative path (the project importing itself by its own package name is not a package). The default export is the key `default` of the module's exports (`import { default as name }` and `export { name as default }` are the same thing). A named function or class declaration keeps its name; any other `export default` value is assigned to a local called `moduleDefault` (`moduleDefault2`, ... if the file already uses that name). The project's own files keep one form: named exports only. |

These are build errors that name the file and the line (`lib.js:12: ...`): default imports and exports in the project's own files (they are accepted in a package), `export * from`, re-exports (also in a package), the same export name twice, an `import` or `export` that does not start its line, `export let` and `export var`, destructuring exports, bare specifiers that name no installed package or no exported path, `node:` built-ins, imports of other file types, missing files, and import cycles. `agent-ui check` reads the modules the same way and reports them too, so they are found before a build or `agent-ui dev` refuses them.

Statements are found in code only: an `import` or `export` written in a comment, a string or a template literal is not a dependency and not an error. Regular expression literals are skipped where one can start after an operator, `(`, `,` or `return`; after `)` or `]` a `/` is read as a division.

Not detected: top-level `await`. Module bodies are wrapped in a synchronous function, so it would fail when the chunk loads.

### Vendor files: a package the dialect cannot read

Some packages (zod, Tiptap, ProseMirror) are written with `export *` and re-exports, which the bundler rejects. Your source still imports the package by name (`import * as z from 'zod/mini'`; Node and `tsc` read the real package). Only the **browser bundle** gets a one-file build of it, through `replaceModules`. The recipe, as `examples/with-typescript` does it for zod:

1. `vendor/zod-entry.js` is the only file the tool reads. It names exactly what the app uses: `export { array, enum, nullable, number, object, string } from 'zod/mini';`. Name the exports, never `export *`: the tool then leaves the rest of the package out (`export *` put all of zod, 420 kB, in the file; the names above give 32 kB).
2. A `vendor` script of the project writes `vendor/zod.js` with esbuild, a `devDependency` of the project: `esbuild vendor/zod-entry.js --bundle --format=esm --outfile=vendor/zod.js`. Do not pass `--minify`: the bundler finds an `import` or `export` only at the start of a line, so a one-line file fails with `unsupported import/export syntax` (the build option `transform` minifies the finished chunks). The output is generated: do not commit it (`.gitignore`), and let the project's `build` and `test` scripts run `vendor` first.
3. `build.config.mjs` maps the package's file to the generated one: `replaceModules: { ...options.replaceModules, 'node_modules/zod/mini/index.js': 'vendor/zod.js' }` (the key is the file the import resolves to; the chunk report lists it). Keep `vendor/` beside `pages/`, not in it.
4. A new function from the package means a new name in the entry, and running the script again. TypeScript needs nothing: it reads the package's own types.

The generated file is third-party code: the framework imports nothing from it, and the project owns the version it bundles.

## Configuration (`build.config.mjs`)

| Key | Meaning |
|---|---|
| `manualChunks` | `{ chunkName: [patterns] }`. |
| `minSharedChunkBytes` | Chunks that are not a page's own and are smaller than this many bytes of JavaScript and CSS source are folded into a bigger chunk (default `4096`; `0` keeps one chunk per combination of pages and layer). See "How chunks are chosen". |
| `outDir`, `assetsDir` | Output locations, default `dist` and `assets`. Files below `assetsDir` are served with immutable caching, and `manifest.json` records the name. |
| `hash` | Content hashes in file names, default `true`. |
| `sourceMaps` | `true` writes a `<chunk>.js.map` next to every chunk and ends the chunk with `//# sourceMappingURL=...`; the manifest lists it as `sourceMap`. Default `false`. See "Source maps". `agent-ui build --source-maps` turns it on for one build. With `transform`, the transform returns its own map (below). |
| `minify` | Strip comments and layout whitespace from JavaScript and CSS. Names are never changed, so the output stays greppable and stack traces readable. Off in `--dev`. |
| `transform` | `(code, { file, kind, sourceMap }) => result`, run after `minify` on every chunk. `kind` is `'javascript'` or `'css'`, `file` the chunk's name. `sourceMap` is `true` for a JavaScript chunk when `sourceMaps` is on: the transform then returns `{ code, map }`, its code and its own source map (an object or its JSON); otherwise it returns the code as a string. Any other result is a build error with the fix. Plug a real minifier in here, for example esbuild's `transformSync(code, { minify: true, format: 'esm' }).code`. `examples/events/build.config.mjs` does this for production builds only, with source maps (`transform: dev ? undefined : ...`, with `loader: 'css'` for stylesheets): the runtime chunk goes from 48.1 KB to 25.2 KB (gzip 13.0 to 10.3 KB). Names of exports and imports between chunks are kept, so chunks still load each other. The minifier is the project's own `devDependency`; the framework imports nothing. |
| `replaceModules` | `{ 'src/validate.js': 'build/stubs/validate-omitted.js' }`: use another file's source for a module. This is how the validator, the runtime's own message checks (`src/runtime-checks.js`), the builders' checks, the page checks and the checks of shells and `syncApps` are left out of production builds, and the server-only half of pages (`src/pages-server.js`) out of every browser bundle. |
| `api` | Path of a Node module exporting `createApi({ root })`: the project's JSON endpoints and form handlers. Used by `agent-ui serve` for the HTTP endpoints. It does not answer the page's own data requests while rendering; `fetchFunction` does. |
| `fetchFunction` | `(url, init) => Promise<response>`: answers the data requests a page makes while it is rendered on the server (`agent-ui build --static`, `agent-ui check`, `agent-ui serve`). There is no default source of data; a page that fetches while rendering needs one (files, an in-process API, a running server). See "Data while rendering". |
| `renderTimeoutMs` | How long a page that declares `ready` may take to become ready while it is rendered. Default `2000`. A static build fails on timeout; `createSsrHandler` answers 503 unless its own `onTimeout` says otherwise. |
| `stateForBrowser` | `(state, request) => state`: which state the document's state script carries after the page rendered. Keep the page's namespaces and keys; remove a server-only key. The markup is rendered from the full state, and a declared default is in the browser bundle. The request is `null` during a static build and `agent-ui check`. |
| `basePath` | The path the site is served below, for example `'/shop'` (default: the root). Specs, page folders, `route.path`, resources and the API keep the site's own paths; the build, the runtime, the render server and soft navigation add or remove the base on the wire. See "A site below a base path". |
| `budgets` | `{ pageGzipBytes?, stateBytes?, elements?, listRows? }`: limits that turn a page over them into an error. `pageGzipBytes` fails the build; the others are `agent-ui check` problems. See "Budgets". |
| `publicDir` | Directory copied as it is to the output root (a symbolic link in it is refused: it would publish what it points to), so `public/data.json` becomes `/data.json`. Use it for data files and images that pages fetch by URL. |

**The configuration is checked before anything runs.** An option that is not in this table fails with the list of allowed options and, for a near miss, `Did you mean "outDir"?`. A value of the wrong kind says what to write. The build deletes its output directory first, so it refuses an `outDir` that is the project root, that lies outside it, or that contains the pages, a `publicDir` or a `package.json`.

The pages are not in this table because nothing configures them: the folders below `pages/` are the pages. Optional files next to the pages: `pages/style.css` (styles of every page); beside a `page.js`, its `view.js` (the content) and `page.css` (that page's styles). Both CSS files may `@import` shared CSS files (see "CSS imports").

**Command line options are checked too.** Every command lists the options it accepts:

| Command | Options |
|---|---|
| `agent-ui build` | `--config=<file>`, `--dev`, `--validator=include\|omit`, `--out=<directory>`, `--source-maps`, `--static` (also write every page as a file; see "Static site") |
| `agent-ui dev` | `--config=<file>`, `--port=<number>`, `--host=<address>` |
| `agent-ui serve` | `--config=<file>`, `--out=<directory>`, `--port=<number>`, `--host=<address>` |
| `agent-ui check` | `--config=<file>` |
| `agent-ui schema [outputFile]` | none |
| `agent-ui explain [name]` | none; one optional name of a recipe or topic |
| `agent-ui init` | none |

`serve` and `dev` listen on `127.0.0.1` (this machine) unless `--host` says otherwise: `--host=0.0.0.0` is the explicit choice to serve the network. A server on this machine answers only to its own names (`localhost`, `127.0.0.1`, `[::1]`) in the Host header and refuses any other with 421, so a web page cannot read the project through a rebound DNS name (`hosts` option of `createStaticHandler` and `createSsrHandler`; `null`, the default, answers to any). A 500 tells the visitor `internal server error` and nothing else; the error goes to the server's `onError` (default `console.error`), and every answer carries `x-content-type-options: nosniff`.

A misspelt or unknown option, a missing value, a port that is not a number, or a value outside the choices stops the command with exit code 2 and one line that names the option and the fix.

## Production vs development builds

`build.config.mjs` exports a function of the mode. `build/presets.mjs` exports `frameworkBuildOptions({ dev, validator })`, which returns the runtime chunk, the validator handling, and the `minify` and `hash` settings for both modes. Spread it into your config and add `publicDir` and the rest.

| Mode | What you get |
|---|---|
| Production: `agent-ui build` | Comments and indentation stripped, about a quarter of the runtime's bytes. `src/validate.js` is replaced by a stub, so specs are not validated at mount; each page's finished spec is validated at build time instead (`build/pages.mjs`), and `grammar` is empty. The runtime chunk is about 40 KB raw and 11 KB gzipped (`README.md` has the sentence a test keeps true). |
| Development: `agent-ui build --dev`, `agent-ui dev`, all tests | Readable output with stable names. The validator is kept as a chunk of its own, named `validator`. |

Validation exists to catch mistakes while writing specs, so ship without it. The exception is an app that generates specs at runtime in the browser: build it with `agent-ui build --validator=include`.

The stripper, `build/strip.mjs`, is a small scanner that understands strings, template literals, regex literals and comments. It keeps newlines, so automatic semicolon insertion is unchanged. Unit tests cover it.

### Source maps

`sourceMaps: true` (or `agent-ui build --source-maps`) writes `<chunk>.js.map` next to every chunk, so a stack trace or a breakpoint in a production bundle points at the source file and line. How they are made, because it decides what they can do:

- The bundler keeps the **lines** of every module: an import or export statement that is taken out leaves its lines behind, empty, and the stripper keeps empty lines (it drops them only when `sourceMaps` is off). The map therefore says, for each output line, which line of which file it is. There are no columns: nothing is renamed or reflowed, and the line is what a debugger needs. The stripped output is a little larger with maps on (empty lines), by the number of comment-only lines.
- `sources` names the files as the build read them (a module replaced by a stub is named by the stub), and `sourcesContent` embeds their text, so a map works without serving the sources. The consequence: **a map contains your readable source.** Serve it only where that is fine, or keep it out of the public output.
- The `//# sourceMappingURL=` comment is added after the file name is fixed, so a map never changes a hash.
- **With a minifier.** A minifier plugged in with `transform` rewrites the lines this build wrote, so the build's own map no longer fits. With `sourceMaps` on, the transform is called with `sourceMap: true` for every JavaScript chunk and returns `{ code, map }`: the minifier's map goes from what it wrote to the chunk it was given, and the build follows every position of it through its own lines to the source file, then writes the result as the chunk's map. A position keeps its column in the minified file (where a line holds many statements) and its name; in the source it points at the start of the line, because the bundler takes `export` and indentation out of a line. The map must be version 3 with one source (its input), and the code must not carry its own `//# sourceMappingURL=` comment: the build adds the one for the file it writes, after the hash. With esbuild:

  ```js
  sourceMaps: !dev,
  transform: dev
    ? undefined
    : (code, { kind, sourceMap }) => {
        const result = transformSync(code, { minify: true, format: 'esm', loader: kind === 'css' ? 'css' : 'js', sourcemap: sourceMap ? 'external' : false });
        return sourceMap ? { code: result.code, map: result.map } : result.code;
      },
  ```

  Stylesheets get no map: a chunk's CSS is the project's files concatenated in order, with a `/* path */` comment before each.
- A construct the bundler does not understand is reported with the file **and the line** (`lib.js:12: default exports are not supported in the project's own files ...`), whether or not maps are on.

## Rendering on the server per request (`agent-ui serve`)

`agent-ui build && agent-ui serve` serves `dist/` at http://127.0.0.1:8080. `serve` renders from the project's sources, so it needs them (and `build.config.mjs`) next to the build, and it refuses a build that is older than the sources (`manifest.json` records a hash of what the build read): run `agent-ui build` again. It cannot serve someone else's `dist/`. A request whose path matches a page's URL is rendered **for the requested URL** with the page's own `create()`: a request for `/blog/post/2` arrives with that post in the HTML and its state embedded, and the browser app takes over from there. The page's `ready(state)` says when it has its data and `status(state)` the HTTP status, for example 404 for an item that does not exist. The built page is the template. Markup sits between `<!--ssr:start-->` and `<!--ssr:end-->`, and the state script is replaced on every request, so the static prerender and the per-request render share one path. Data requests the page makes, such as `/articles.json`, are answered by `fetchFunction`.

A page that declares `ready` gets `renderTimeoutMs` (default 2000) to become ready. `createSsrHandler` answers 503 when the deadline passes, because a half-loaded page must not be mistaken for a finished one; it logs the timeout through `log`. Pass `onTimeout: 'serve'` only when a partial page is acceptable, or raise `renderTimeoutMs` in `build.config.mjs` (or `timeoutMs` per handler). `agent-ui build --static` fails instead of writing a page that never became ready. A client that disconnects aborts the render: its resources and data requests are stopped, and no response or error is written to the closed socket. The request context carries that `AbortSignal` as `signal`.

### The request, the hooks and response headers

`createSsrHandler` is a request adapter for the host's server: it renders pages, and its optional `api` is a bridge for JSON endpoints and no-JavaScript form posts, because a form's outcome is a rendered page. It is not an application server: leave `api` out and the host's own routes answer the endpoints. It will not grow uploads, sessions, SSE or WebSockets; those are the host's (`SECURITY.md`).

Every page, API and form answer of `createSsrHandler` starts from one request context: `{ method, pathname, search, query, headers, cookies, signal }`. The page's render, `api.handle`, `api.handleForm`, `initialStateFor`, `stateForBrowser`, `transformResponse` and the page's data requests (`fetchFunction(url, init, request)`) all read that request data; `cookies` are raw values, not percent-decoded. `signal` aborts when the client closes the connection, and the render passes it to the resources and their data requests, so a visitor who leaves does not keep a query running. A rendered form outcome gives the page render, `initialStateFor`, `stateForBrowser`, `transformResponse`, its resources and data requests the outcome page's path and query with the POST's method, headers and cookies (`docs/API.md`, section 12).

Three options are hooks, not features. The framework ships no session store, login flow or CSP policy; the project decides, and the hook supplies the request data or the value:

```js
import { randomBytes } from 'node:crypto';
// session.mjs verifies the cookie and returns the display name; see API.md section 12 or the server-hooks recipe.
import { readSession } from './session.mjs';
import { createSsrHandler } from '@ehtb/agent-ui/server/ssr-handler.mjs';

const handler = await createSsrHandler({
  config,
  root,
  initialStateFor: (request) => ({ session: { user: readSession(request.cookies.session) } }),
  // Leave a server-only key out of the state script. The markup is still rendered from the full state.
  stateForBrowser: (state) => ({ ...state, session: { user: state.session.user } }),
  transformResponse: (request, { headers, body }) => {
    const html = String(headers['content-type'] ?? '').startsWith('text/html');
    if (!html) return { headers: { 'strict-transport-security': 'max-age=31536000; includeSubDomains' } };
    const nonce = randomBytes(16).toString('base64');
    return {
      headers: {
        'strict-transport-security': 'max-age=31536000; includeSubDomains',
        'content-security-policy': `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self'`,
      },
      body: body.replace(/<script(?=[\s>])(?![^>]*\bsrc\s*=)/g, `<script nonce="${nonce}"`),
    };
  },
});
```

- `initialStateFor(request)` returns public state in the shape of `ui.state()`, written into the document. Keep a session token in an `HttpOnly` cookie, never in that state: the state is in the HTML and reaches the browser. Check the cookie, the `Origin` header or a CSRF token in the API or form handler that changes state.
- `stateForBrowser(state, request)` returns the state the document's state script carries after the page rendered. Use it to leave out a key that only the server's own code reads, or to replace an internal value. It can remove a namespace or key but cannot add one, because the browser app would not have it declared. It is not a secret store: the markup was rendered from the full state, and a value in the page's declared default is in the browser bundle. Put server-only state in `initialStateFor` (and declare the key with an empty or neutral default) and leave it out here. During a static build the request is `null`.
- `transformResponse(request, { status, headers, body })` runs for every answer this handler writes once a request context exists: pages, API answers, form outcomes, its 404 and 500, and the 400 for a body it cannot read. It returns `{ headers?, body? }` or null. Return only the headers to add or replace: the headers passed in contain the framework's own headers (for example `content-type` on a page or API answer) and its security header, and those names are refused in a returned object, so read them and do not spread them. A returned header replaces the existing one; `set-cookie` values add up; the framework's security header is merged last.
- The body is a string and the hook returns the whole replacement. Add a CSP nonce to every inline `script` tag there, as above; the state-script reader and soft navigation accept attributes in any order, so hydration and soft links still work. A page's module script is external and covered by `'self'`. A page's CSS is an external stylesheet covered by `style-src 'self'`; a page that emits inline `style` needs a hash, a nonce or `'unsafe-inline'`, which the host decides. A soft navigation copies the next page's head and body scripts; an inline script that differs is created and runs, but the fetched document's nonce belongs to that response, not to the CSP of the document that stays. Keep page behavior in its module entry or a plugin when a soft link is used; do not rely on an inline script there. The state script is data, not code. The body may be HTML, JSON or plain text: check `headers['content-type']` before rewriting it.
- Because the transform runs last, it can set a page's cache policy or CSP. Set a site policy unconditionally in the transform to make it a floor. It runs after the API or form outcome headers and the framework's cache default.
- The hook does not run for a request that goes to `next()`, nor for the 421 and 400 answered before a request context exists. If it throws, the visitor gets a 500 and the hook is not run again on that answer.
- A page GET is `no-cache` unless the transform sets a cache header; an API answer is `no-store` unless the endpoint or the transform sets one; the framework sets `no-store` on a form response and on the 4xx and 5xx answers the handler writes itself (a page's own `status` is a page answer), and a transform can replace that too (do not make a form response cacheable). A page whose state depends on the visitor should have the host send `vary: cookie` or `cache-control: private` from `transformResponse` for every answer.
- Headers are checked in one place: names are lower case, a name given twice is an error, `set-cookie` is the only list, a line break, a control character other than a tab, or a non-ASCII character is refused, and the framework's own headers (`content-type`, `content-length`, `content-encoding`, `x-content-type-options`, the hop-by-hop headers) cannot be set. A page cannot set response headers. A host server or plugin that writes its own response can use the same checks with `checkResponseHeaders` and `mergeResponseHeaders` from `@ehtb/agent-ui/http-headers` (API.md section 12).

The reference app is `examples/hydration`. View its page source to see the difference.

This is a demo server. It has no compression, no streaming, no file-upload or `multipart` parsing, no SSE or WebSocket endpoints, and no error pages beyond a 500 with the message; `transformResponse` can set a cache policy, but the demo server itself does not cache. A real deployment puts those concerns in the host server.

## Static files, forms and APIs

**A static site is not served by the framework.** `createStaticHandler` sends files and the shell of a page for `agent-ui dev`; it does not map `/about` to `about/index.html`. Put the output of `agent-ui build --static` on a file host (nginx, a CDN, `express.static`), which does that itself.

**Static files.** Anything in `public/` is copied as it is, so `public/terms.html` is served at `/terms.html`. A link to such a file is not a page, and `agent-ui check` accepts it because the file exists.

**APIs and form posts.** The config key `api` names a Node module exporting `createApi({ root })`. The object it returns has the members below. This is the plug-in point for a server side: any object with these members works. `examples/events/compose-api.js` builds one from per-page endpoint tables; `examples/shop/api.js` is a plain object; `examples/with-express` and `examples/with-fastify` leave the API to their host server.

- `apiBase`, optional: the path below which `handle` answers GET requests (default `'/api'`). Any POST goes to `handle`, then to `handleForm`.
- `handle({ method, pathname, search, query, headers, cookies, signal, body })` for JSON endpoints. It returns `{ status, body, headers? }` or `{ status, body, headers?, raw: true }` for bytes it produced itself, or null. An API answer is `cache-control: no-store` unless it sets one, and it may set a cookie. With `composeApi`, a path that exists for other methods answers 405 with an `allow` header.
- `handleForm({ method, pathname, search, query, headers, cookies, form })`, optional. It turns a plain HTML form post into `{ status, url, initialState?, headers? }` or `{ redirect, headers? }`. The first renders the page at `url` (a local path starting with `/`, not `//`, with no backslash or encoded separator at the start) with that state, so forms work without JavaScript. The second answers 303 with `location` and `cache-control: no-store` (post/redirect/get), so a reload does not post again; the redirect follows the same path rule, and its `headers` cannot set `location` or `cache-control`. A form response is `no-store` unless `transformResponse` replaces the cache policy. A POST to a path that is a page but that neither `handle` nor `handleForm` answers is a 404.

The API and the form handler receive the same request context as the page, and their headers follow the rules above. While a form outcome page is rendered, `initialStateFor`, `stateForBrowser`, `transformResponse`, its resources and `fetchFunction` see the outcome page's `pathname`, `search` and `query`; the method, headers and cookies remain those of the POST. A session token belongs in an `HttpOnly` cookie that one of them sets; the page only reads public state from `initialStateFor`. See API.md section 12 for the context, the header checks and the session hooks.

Request bodies are JSON or urlencoded, with a 100 KB limit. A body with no content type or another type (including `multipart/form-data`), or a compressed one (`content-encoding`), is answered 415, a body over the limit 413, and a malformed body 400; an empty body is `{}`. A host framework that parsed the body may pass it as `request.body`. An endpoint may answer `{ status, body, headers?, raw: true }` to send bytes it produced itself (CSV, XML, a file); a raw answer must set its own `content-type` unless the body is empty. `transformResponse` runs for raw answers too (so site-wide headers still apply); it may rewrite a string body, but a binary body is sent unchanged and returning a body for it is refused. This is a demo server, and in-memory state is fine for a demo; it is not a production back end. A static host has no API: the generated pages still work, but a form needs JavaScript and a server to receive it.

## Data while rendering

A page that loads data (a `resources` entry) asks its `fetchFunction` for it, in the browser and while it is rendered on the server. In the browser that is `fetch`. On the server, the framework does not decide where the data comes from: `fetchFunction` in `build.config.mjs` does, and it is used by `prerender`, `agent-ui check` and `agent-ui serve`. It receives the same `(url, init)` as `fetch` and returns anything with `ok`, `status`, `json()` and `text()`; a `Response` works.

When a page is rendered for a request, `fetchFunction` receives the request context as its third argument (`fetchFunction(url, init, request)`), so it can forward the visitor's cookie or authorization header to the data source. `prerender` and `agent-ui check` have no request: the third argument is `undefined` there. A page whose data depends on the visitor is therefore not a page for a static build.

```js
// build.config.mjs
export default () => ({
  fetchFunction: (url, init) => fetch(`http://localhost:4000${url}`, init), // a running API
  // ...
});
```

- With no `fetchFunction`, the first data request while rendering fails with `render: the page requested "<url>" but no fetchFunction is configured. Add ...`, unless the URL is absolute (`https://...`), which goes to the real `fetch`. A page without resources never asks.
- A host whose data is in its own process hands the handler a config with that function: `createSsrHandler({ config: { ...config, fetchFunction } })` (`examples/with-express`, `examples/with-fastify`). The config is the only place a `fetchFunction` is given.
- Files and in-process APIs are the project's own code. `examples/directory/server-fetch.mjs` reads `public/` (the bytes the static host serves); `examples/events/server-fetch.mjs` also answers `/api/` from the project's `api` module, in process.

## Static site, hosting and the dev server

**A static site** is `agent-ui build --static`: after the build every page is rendered with `server/render-page.js` from the page's generated module (the same `create(env)` the browser entry uses) and written to `<path>/index.html` (the page `/` to `index.html`), with its markup inside `<div id="app">`, followed by the state script, before the module script. A plain file host then serves finished pages with no server. It is for a site that names every page.

- A page whose path has parameters (`/event/:id`, `/docs/*path`) is written once for every URL its `view.js` lists in `paths`: `export const paths = ['/event/1', '/event/2']`, or an async function that returns them (view.js runs only in Node, so it may read files or a database). Each URL must be a URL of the page, plain (letters, digits and `. _ ~ -` in its segments), and listed once. A page with parameters that lists none stops the build before it renders anything, naming the pages and the fix. `agent-ui check` renders the same URLs, so what is checked is what is written.
- Data requests are answered by the `fetchFunction` of the config (see "Data while rendering"). Without one, the first request fails with the fix.
- The page's `ready` says when its data is there. A page that never becomes ready fails the build instead of shipping a loading state.
- A page whose data comes from a server that is not running during the build is not a page for a static site: build without `--static`.

**Hosting.** Asset URLs are root-absolute, below `basePath` when the config has one. There is always a server: `agent-ui serve`, or your own with `createSsrHandler` (API.md section 12), renders every URL that matches a page (for `GET` and `HEAD`), including the ones that were never generated.

**Serving and checking.**

- `agent-ui serve` renders the pages per request (see "Rendering on the server"); a path that matches no page and no file is a 404. There is no catch-all page: a URL that should work is a page folder. (A page with a dot in the last segment, such as `/user/jane.doe`, is a page; only a known file extension makes a path a file.)
- `agent-ui dev` swaps the edited page in place (hot reload, keeping its state) and rebuilds on change (API.md section 12). Pages render in the browser from their shells.
- `agent-ui check --config=<file>` renders every page in development mode (a page with parameters at the URLs its view.js lists in `paths`) and lists problems without building (API.md section 13). It reads the modules the entries reach the way the bundler does, once, and reports every source problem a build would refuse (`agent-ui build` stops at the first). It renders a few URLs at a time (a small fixed bound), so pages that wait on data do not wait for each other; the report stays in page and URL order, and a page that never becomes ready costs one wait of `renderTimeoutMs` per batch instead of one per page. A `fetchFunction` that keeps mutable state therefore sees requests interleaved, as it would on a server that answers visitors at the same time. It prints what every page it rendered costs: the elements it shows, the rows of its largest list and the bytes of its state script; `budgets` turn a page over a limit into a problem. Requests to `/api/` are answered by the project's `api` module, so a resource whose URL no endpoint answers is reported with the page that made it (each render keeps its own misses). It checks every link in a page's spec: a literal `href` that starts with `/` must be a page, a file in `publicDir` or an API path; a message lists ten pages at most, so one broken link on a site with a thousand pages stays readable.
- `agent-ui init` writes the rules for agents into `AGENTS.md` of the project root, between `<!-- agent-ui:start -->` and `<!-- agent-ui:end -->`: the file is created when it does not exist, and when it does the block is added (or its own block replaced) and the rest is kept. The text is the block of the package's `docs/AGENT-RULES.md` (the root `AGENTS.md` is for work on the framework and is not published), so an agent that only reads the project's own file still learns the rules (the file in `node_modules` is not loaded by one). Run it again after an upgrade to refresh the block. `agent-ui check` prints a note when `AGENTS.md` does not mention agent-ui.
- `agent-ui schema [file]` writes the JSON Schema of the spec grammar. The default is `./spec.schema.json` in the current directory. In this repository `npm run schema` regenerates `docs/spec.schema.json`.

## A site below a base path

`basePath: '/shop'` serves the site at `https://example.com/shop/`. Inside the app nothing changes: a page folder is still `pages/product/[id]/`, a spec still writes `a({ href: '/product/3' })`, `route.path` is `/product/3`, a resource asks for `/api/cart`, and the project's API and `fetchFunction` see `/api/cart`. The base exists only on the wire:

- the build writes the asset URLs below it (`/shop/assets/...`) and writes it into every browser entry;
- the runtime writes it before every root-absolute URL it puts in the page (`href`, `src`, `action`, `formaction`, `cite`, each URL of `ping` and of `srcset`, and the same attributes in the head; a `srcset` URL that holds a comma is not supported), and the browser's fetch adds it to a resource's URL; a URL that is not root-absolute (`https://...`, `//cdn...`, `#top`, `about`) is left alone;
- `createSsrHandler` answers only below the base (a request outside goes to `next()`), takes it off the path before it looks for the page, and adds it to a form's redirect; `agent-ui serve` and `agent-ui dev` serve the files below it;
- soft navigation fetches the site's path, pushes the address with the base, and leaves a link outside the base to the browser.

CSS is not rewritten: a `url()` in a stylesheet is relative to the stylesheet (`url(../images/a.png)`), or carries the base itself.

## Budgets

`budgets` in `build.config.mjs` say how much a page may cost. Each is optional:

| Limit | Measured by | What it counts |
|---|---|---|
| `pageGzipBytes` | `agent-ui build` | The JavaScript and CSS a first visit downloads before the page runs, each file gzipped (`startupSize` of the page in `manifest.json`, and the page table of the build report). Over it, the build fails after writing the site, naming the pages and their startup chunks. |
| `stateBytes` | `agent-ui check` | The bytes of the state script a rendered page carries. |
| `elements` | `agent-ui check` | The elements a rendered page shows, its shell's included. |
| `listRows` | `agent-ui check` | The rows of the largest list of a rendered page. Every row is rendered: there is no virtualization, so a long list is a page of the data at a time. |

Without budgets the numbers are still printed: the build report has a table of pages with their startup size, and `agent-ui check` a table of every URL it rendered. What one action costs is measured in tests with `measureAction` and `assertCost` (API.md, "Testing").

## Production checklist

A build is not a deployment. Before a real site goes out:

- **Minify.** `agent-ui build` strips comments and indentation and keeps names readable, so a stack trace in a production bundle still points at a function you can find. Plug a real minifier into `transform` for production only: `examples/events/build.config.mjs` does, and its runtime chunk goes from 48.1 KB raw / 13.0 KB gzip to 25.2 KB / 10.3 KB. Names of imports and exports between chunks are kept, so the site still loads. For stack traces that point at your files, turn `sourceMaps` on and have the transform return the minifier's map (see "Source maps"); the maps hold your source, so serve them only where that is fine, or upload them to your error tracker and keep them out of the public output.
- **Compress.** Neither `agent-ui serve` nor `createStaticHandler` sets `content-encoding`: they are development and test servers. Put nginx (gzip or brotli), a CDN or the host's compression middleware in front, and check the transfer size of the largest chunk, not its size on disk.
- **Cache.** Files below `assetsDir` have content hashes in their names and the framework's handlers serve them as immutable. HTML is `no-cache` unless `transformResponse` says otherwise; an API answer is `no-store` unless the endpoint or `transformResponse` says otherwise; the framework sets `no-store` on a form response and on the 4xx and 5xx answers the handler writes itself (a page's own `status` is a page answer), and a transform can override it (do not make a form response cacheable). A page whose state depends on the visitor should have the host send `vary: cookie` or `cache-control: private` from `transformResponse`: `no-cache` alone does not separate visitors in a shared cache. `manifest.json` names every chunk and the page that loads it.
- **Serve with the host.** A deployed site is served by the host's own server (`createSsrHandler` in Express, Fastify or Node, or a static host for a `--static` build), not by `agent-ui serve`: the host owns TLS, compression, caching, logging and error pages. `examples/production-server/server.mjs` is a dependency-free model: the built files from memory, `createSsrHandler` for every page, security and cache headers, `/healthz` and graceful shutdown.
- **Set headers and a session at the host.** `createSsrHandler` gives the request to `initialStateFor`, `stateForBrowser` and `transformResponse`; use them for a CSP, HSTS, a site-wide cookie and the public part of a session. Keep the session token in an `HttpOnly` cookie set by the API or a form, not in the state the document carries, and check it in the handler that changes state. A key only the server reads belongs in state added by `initialStateFor` with a neutral declared default, and is removed by `stateForBrowser`; that keeps it out of the state script but not out of markup the page renders. The framework writes no CSP, session store or CSRF policy. Set `maxBodyBytes` to the largest form or JSON body the host accepts (default 100 KB), and `timeoutMs` (or `renderTimeoutMs` in the config) to a budget the page's data can meet; the default 503 on timeout is deliberate.
- **Accept only the bodies you parse.** The handler reads JSON and URL-encoded bodies, uncompressed; it answers 415 for another content type, including `multipart/form-data`, and for a compressed body (decode it in the host's body parser), 413 for a body over `maxBodyBytes`, and 400 for a body it cannot parse. A file upload belongs in a route of the host server, which passes the parsed value as `request.body`; the framework has no upload parser. The handler has no streaming, SSE or WebSocket endpoint: serve those from the host as well.
- **Do not edit `dist/`.** Change the source and rebuild.

## Adding things

- **A new page:** create `pages/<url>/page.js` exporting `page` and `pages/<url>/view.js` exporting `view` (GUIDE.md, section 3). It is picked up automatically; nothing else changes.
- **A lazy feature:** import it dynamically, `import('./devtools.js').then(...)`, from any module. It becomes its own chunk, and its CSS loads with it. Do not list it in `manualChunks`, or it becomes eager.
- **Shared app code:** import the same file from several pages. It lands in a `shared-...` chunk automatically (small ones are folded together, see "How chunks are chosen").

## Limits

The pipeline leaves these out on purpose, to stay dependency free:

- no tree shaking: whole modules are included;
- source maps are opt-in (`sourceMaps: true`), one per JavaScript chunk, precise to the source line (not the column); with `transform`, the minifier supplies its map;
- no identifier mangling: comments and whitespace only, use `transform` for a real minifier;
- no CSS processing beyond resolving `page.css`/`pages/style.css` `@import`s and concatenating the files of a chunk: no URL rewriting, no scoping, no nesting, no autoprefixing;
- no in-place patching of a module: the dev server swaps the whole edited page, with its state (API.md section 12);
- no JSON imports, CommonJS packages or `imports` maps.

If you need them, use a full bundler and keep the same source layout.
