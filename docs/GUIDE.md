# Pages, URLs and APIs: how it fits together

Read this before adding or changing a page, a URL or an endpoint. It connects the pieces. If you are an agent, read `AGENT-RULES.md` in this folder first: it is the short operating manual, and this guide is the map. The exact reference for each piece is in `API.md` (section 13 for pages) and `BUILD.md` (the build). The running examples are `examples/events` (many pages, forms, an API) and `examples/shop` (code splitting by page) in the framework repository. For a page that does a common thing (a list you edit, a form with validation, an async list, a dialog, a header that stays), start from the recipe: `agent-ui explain` lists them, `agent-ui explain <recipe>` prints its files, and the `cookbook/` folder of the package holds them as pages that `agent-ui check` renders.

## 1. The model

**A page is a URL, and a URL is a folder.** Every folder below `pages/` that holds a `page.js` is a page, and the folder's path is the page's URL. There is one way to say where a page lives, and nothing else is configured: no list of pages, no entry to name. A site served below a path says so once (`basePath` in `build.config.mjs`), and every URL in it is still written as if it were at the root.

| Folder | URL |
|---|---|
| `pages/page.js` | `/` |
| `pages/about/page.js` | `/about` |
| `pages/event/archived/page.js` | `/event/archived` |
| `pages/event/[id]/page.js` | `/event/:id` |
| `pages/event/[...path]/page.js` | `/event/*path` |

A parameter is written `[name]` and a rest segment `[...name]`, because `:` and `*` are not allowed in file names on every system. The rest segment must be the last folder. A `page.js` has its content in `view.js` beside it, and its own helpers (`api.js`, `signup.js`, `page.css`) there too. `page.css` may `@import` CSS shared with a few pages; `pages/style.css` does the same for every page (`BUILD.md`, "CSS imports"). Anything else in `pages/` that is not a `page.js` is yours (shared modules may live there or in a folder of their own).

**Following a link is a page load.** There is no client-side router. The links of a page are plain `<a href="/about">`, the server or the static host answers them with the next page, and the browser app starts again from that page's state. What must outlive a page lives on the server and is loaded with `resources`: a cart, a profile, the data. Anything kept only in the browser (a typed search text) is gone after a link, by design. A link written `soft: true` is the same page load made faster, for pages that share a header or a footer that should stay (section 4, "A header that stays, and soft links").

Each page is its own entry in the build, so a page downloads the code it imports and the code pages share, nothing else (`BUILD.md`, "Pages and chunks").

## 2. What happens to a URL

| Where | What happens |
|---|---|
| File host (`agent-ui build --static`) | Every page is rendered at build time and written to `<path>/index.html` (the page `/` is `index.html`). A static site names every page: a page with parameters is written once for every URL its `view.js` lists in `paths`, and one that lists none is an error. |
| Render server (`agent-ui serve`, or `createSsrHandler` inside your own server) | Every request whose path matches a page's URL pattern is rendered for that URL with the page's own `create()`. The HTML carries the rendered page and its state. The page's `ready(state)` says when its data is there, and the server waits for it; after `renderTimeoutMs` (default 2000) the handler answers 503 rather than serving a half-loaded page with 200. The page's `status(state)` sets the HTTP status, for example 404 for an unknown id. The handler's `initialStateFor`, `stateForBrowser` and `transformResponse` hooks add public session state, choose what the state script carries, and change an answer's headers or body (section 4, "A session, a CSP and response headers"). A client that disconnects aborts the render; `request.signal` says so. |
| Browser | The page starts from the state the server embedded and takes over the markup the server wrote (it keeps those nodes, `agent-ui check` finds what would make it write some again; `route.hydrated` turns true when it has taken over), reads the URL's parameters into `route.params`, and runs its resources. A resource declared `revalidate: 'never'` trusts the server's output on mount instead of loading it a second time (below, "A page that needs data"). |

When several pages match a path, **the most specific wins**: compared from the left, a literal segment beats `:name`, which beats `*name`. So `/event/archived` beats `/event/:id`, which beats `/event/*path`. Two folders with the same shape, such as `[id]` and `[slug]` at the same depth, are an error that names both. A path that matches no page is the host's to answer (404). A path whose last segment has a file extension (`/logo.png`, `/item/v1.2`) is treated as a file, never as a page, so a parameter value must not end in `.` plus letters or digits.

## 3. Anatomy of a page

```js
// pages/event/[id]/page.js — the page's behavior; this is the file the browser entry imports
export const page = {
  head: { title: (state) => ..., description: '...' },   // required; also html, body, tags, bodyTags (API.md, "Head")
  namespaces: { events, event: signup },                 // everything the page keeps in state, imported or written here
  plugins: [withResources],                              // what the page needs from outside its state, imported
  ready, status,                                         // loading and HTTP status
};

// pages/event/[id]/view.js — the page's content; only the server and the build import this file
export const view = article(...);   // required: the spec of the content (a value, not a function)
export const layout = pageLayout;  // (content) => spec: a shared layout, imported (optional)
export const pending = p({ id: 'loading' }, 'Loading…');   // what to show until `ready` is true (optional; needs `ready`)
```

- **`namespaces`** is the page's whole state: shared namespaces (imported from a module) next to the page's own. A namespace that reads another one (`get('events.list')`) needs that one on the page too; the page fails at start if it is missing. `route` is reserved: the framework provides `route.params` (the URL's parameters) and `route.hydrated`.
- **`plugins`** are imported by the page, so a page that has no data downloads none of the resources code. A page that declares `resources` in a namespace without `withResources` fails at start with the fix.
- **`view`, `layout` and `pending` live in `view.js`** next to `page.js`, because the browser entry imports `page.js`: only the server and the build import `view.js`, so a browser downloads the behavior and the finished spec as data, never the code that builds it. `layout` is a function from the page's content to the spec around it; pages that import the same function share one copy of it in the build.

## 4. Recipes

Every recipe ends with the same two checks: `agent-ui check`, which renders the pages and reports problems (including a link that leads nowhere), and the tests.

### A static page

No state, no data. Create `pages/about/page.js` exporting `page = { head: { title: '...' } }` and `pages/about/view.js` exporting `view = ...` (put a shared `layout` there too). `agent-ui serve` renders it per request; `agent-ui build --static` also writes it as a file.

### A page with a parameter

Name the folder `[id]`. Read the value with `{ state: 'route.params.id' }` in the spec and `get('route.params')` in `derive`. The page is rendered per request by `agent-ui serve`; a static site (`agent-ui build --static`) writes it once for every URL its `view.js` lists in `paths` (section 6, "Static generation").

A parameter that names nothing must still render something. Derive `isNotFound` (in the page's namespace), show a message, and return 404 from the page's own `status(state)`:

```js
status: (state) => (state.events.status === 'ready' && !found ? 404 : 200)
```

### A more specific page next to a parameter page

Create its folder, `pages/event/archived/page.js`. It wins for that URL. The parameter page keeps all the others.

### A wildcard page

Name the folder `[...path]`, as in `pages/event/[...path]/page.js`. It catches everything deeper and is usually a not-found page. Give it `status: () => 404`. It has parameters, so a static build needs the URLs in `paths`, and a 404 status stops `--static` (a file host answers every file with 200); `agent-ui check` lists it as a note when `paths` is missing.

### A page that needs data

The page declares three things:

| Key | Meaning | Example |
|---|---|---|
| `ready` | When the data has arrived. A failure counts as finished, so nothing waits for it. | `(state) => state.items.status === 'ready' \|\| state.items.status === 'failed'` |
| `pending` | What to show until then: a skeleton or "Loading...". A spec; give its elements ids of their own. | `p({ id: 'loading' }, 'Loading…')` |
| `status` | The HTTP status: 404 for an id that names nothing, 503 for a failed load. | `(state) => ...` |

One definition serves everyone:

- The render server waits for `ready` before it renders, so the HTML it sends is the finished page and `pending` never reaches it. The same goes for a static build (`--static`), which fails the build if a page never becomes ready.
- `agent-ui check` waits for it too.
- In the browser, `pending` stands in for the page while the resources load in the background. The page replaces it when `ready` turns true. Every page has the derived value `route.ready` (true for a page without `ready`), so a layout can show it.

A page without `ready` counts as ready at once. A page with `ready` but no `pending` shows its view as it is. `ready` and `status` read the plain snapshot of state, nested by namespace (`state.events.status`, `state.route.params`), not derived names.

**A refresh must not undo readiness.** By default the browser repeats the resources' requests after the server rendered the page. An `onStart` action that sets `status` to `'loading'` unconditionally would put a finished page back to `pending`. Write it as a guard:

```js
if (store.get('status') !== 'ready') store.set('status', 'loading');
```

(in the `loading` action of the namespace that owns the data). `with-express` and `examples/loading-states` do this.

A resource whose server result is complete and fresh for the first paint can skip that second load: add `revalidate: 'never'` and list its output keys in `owns`. The first run on mount then does nothing when the document carries a state script; a later change to a watched key still loads. Do not use it with `onTimeout: 'serve'` (the state script may be partial), on a resource whose data depends on the visitor in a way the render did not see, or without `owns` (the definition is refused).

### Data that belongs to one page

A namespace's `resources` run for every page that lists the namespace, so list a namespace only on the pages that need it. The checkout page of `examples/shop` lists `cart` and `checkout` but not `catalog`, so it never requests `/products.json`.

A resource's output is written only by its lifecycle actions (`onStart`, `onSuccess`, `onError`, `onCancel`, `onIdle`); list those keys in `owns` so dev mode refuses writes from other actions. To restart a resource, change a watched key (a retry flips a watched flag, as `lookup.ordersCancelled` does in `examples/orders`), and use `onIdle` to clear owned state when `request` returns `null`. A mutation that must not be lost when the visitor clicks twice is a queue: the resource sends the head of a list and the success action removes it (`shared/cart.js` in `examples/shop`); "latest wins" fits a search, not a purchase.

### State that belongs to one page

Write the namespace in the page file (or import it) and list it in the page's `namespaces`. Its name is the key you give it: `namespaces: { event: signup }` makes the key `values` `event.values` in bindings and its action `submit` `event.submit`, so pages and namespaces never collide. What two pages use goes into a module they both import, once. When a page has to change what a shared namespace holds, its action lists the shared namespace's action in `calls` instead of writing it (`checkout.succeeded` calls `cart.reload` in `examples/shop`).

### State that must outlive the page

Keep it on the server and load it with a `resources` entry; the cart of `examples/shop` is the model. The framework has no browser storage for state: durable data and state live on the server, so every device and tab sees the same thing, and server rendering shows it.

### A link

Write the path: `a({ href: '/event/archived' }, 'Archived')`, or `a({ href: join('/event/', item('id')) }, ...)` in a list. Links begin with `/`, because the site is served from the root of its domain. `agent-ui check` reads the links in every page's spec and fails on a literal one that is no page, no file in `publicDir` and no API path, with a suggestion; a link built with `join` is checked with its dynamic parts replaced by one segment. A link to a file in `public/`, such as `/terms.html`, is fine because the file exists.

### A header that stays, and soft links

A **shell** is the part of the document that stays while the page inside it is replaced: a header, a footer, a player. It is an app of its own, written like a page in two files, and a link marked `soft: true` replaces only the page inside it instead of loading a document. Everything else about the link is a normal link: its `href` is real, and a failed swap, a crawler and a middle click use it.

1. Write the shell's behavior (`defineShell` from `@ehtb/agent-ui/shell`: a name, its own namespaces, `plugins: [withNavigation]`, and what it `reads` from the page, such as the cart count) and its content (`{ name, view }`, with `pageSlot()` where the page goes). `examples/shop/shared/shell.js` and `shell-view.js` are the model; API.md, section 13, has the grammar.
2. In each page that lives in the shell, add `shell` to `page.js` and `export { shell }` (the content) to `view.js`. The page must have the namespaces the shell reads (the shop's pages all list `cart`).
3. Mark the links that should be soft: `a({ href: '/checkout', soft: true }, 'Checkout')`. For a button, use `on: { click: act('route.go', { href: '/checkout' }) }`.
4. Run `agent-ui check`: it reports a soft link to a page of another shell, or none, and a `route.go` to a place that is no page.

What the visitor gets is what a page load gives: the URL changes (and back works), the page starts from the state the server rendered for it, its head is the next page's (the description, the attributes of `<html>` and `<body>` and the elements it wrote are copied from the document the link fetched; a head that follows the state needs `withHead` from `@ehtb/agent-ui/head`), and the page's element takes the focus. The element is a `region` named by the new title, so a screen reader announces the page when it takes the focus; put `domId: 'agent-ui-announcer'` on a live region in the shell (`domId` is the HTML id), usually visually hidden with `aria-live: 'polite'`, if you also want a polite live announcement. What is not carried over is a page's own browser state (a typed search text). A shell stays mounted, so its state stays; keep in it only what the shell shows. Anything that is not a plain page (a 404, a redirect, a page of another shell) is a normal page load, with the reason in the console.

### A different design for a page

Write a layout, a function `(content) => spec`, in a module and name it in the page's `layout`. Pages that import the same layout share one copy of it.

### An endpoint for a page

1. Create `api.js` next to the page's `page.js`, exporting a table:

   ```js
   {
     endpoints: { 'POST /:id/signup': ({ params, body }) => ({ status: 201, body: {...} }) },
     forms: { '/event/:id/signup': ({ params, form }) => outcome | null },
     reset,
   }
   ```

2. Endpoints are served at `/api/<name>/...`, where the name is the key you give the table. With the key `event`, the pattern `/:id/signup` becomes `POST /api/event/3/signup`.
3. Register the table in the project's `api.js`. `composeApi` is a file of your project that builds the `api` object from tables; `examples/events/compose-api.js` is one to copy and change:

   ```js
   import { composeApi } from './compose-api.js';
   export const createApi = () => composeApi({ routes: { event: createEventApi(), contact: createContactApi() } });
   ```

4. Name that file as `api` in the build config.

The browser calls the endpoint through a `resources` entry in the page's namespace.

### A form that also works without JavaScript

- Give the `form` `method: 'post'` and an `action` set to the page URL, `/event/<id>/signup`.
- Give every field a `name`.
- Write a `forms` handler for that path. It returns `{ status, url, initialState }` to render the page that shows the outcome, or `{ redirect }` to send the browser to a local path after the post (answered with 303, so a reload does not post again). `url` and `redirect` are local printable-ASCII paths starting with `/`, not `//`, with no backslash or encoded separator at the start; encode a segment with `encodeURIComponent`.
- `initialState` is nested by namespace and must include every state key the outcome sets (`event: { status: 'done', ... }`). Otherwise the page falls back to its defaults. The URL's parameters are filled in for you.
- Both outcomes may carry `headers`; the framework writes `cache-control: no-store` for a form response (a `transformResponse` can replace it), and `location` and `cache-control` cannot be in the outcome's `headers`. A form handler can set a session cookie; a page cannot. A form that changes the session also returns the new public state in `initialState`, or redirects so the next request carries the cookie.
- While the outcome page is rendered, `initialStateFor`, `stateForBrowser`, `transformResponse`, its resources and `fetchFunction` see the outcome page's `pathname`, `search` and `query`; the method, headers and cookies remain those of the POST.
- Keep the validation in one pure function that the browser, the endpoint and the form handler all import.

### Reusable state logic (what a React project writes as a custom hook)

Write the logic as a namespace (`{ state, derive, actions }`, or a function that returns one from options) and list it under as many names as you need: `namespaces: { email: textField({ validate }), password: textField({ validate }) }`. Inside it the keys are short (`value`, `touched`), the key you give is the prefix (`email.value`, `email.set`), so two uses never collide. API.md section 12 has the full hook-by-hook table; `examples/react-converted-components/features.js` has working field namespaces.

### A component library

Define each component once as `{ params, spec }`, as plain JavaScript in one folder, and use it by name: `{ use: 'button', with: { variant: 'outline' }, children: 'Save' }`. Variants are `options` on a param, optional props are `optional: true`, the extra `class` is a `default: ''` param. Expand once with `expandComponents(spec, components)` and export the result as `view` in the page's `view.js`. A mistyped variant or an undeclared prop is an error with the nearest valid name. `examples/react-converted-components` converts seven shadcn/ui components and tests them against the quoted originals. The step-by-step procedure is in `CONVERTING.md`. Import each component from its own module: the build includes whole modules, so a file that re-exports every component would put every component in every page.

### A page whose data comes from your own server

For an Express or Fastify server, mount `createSsrHandler` from `@ehtb/agent-ui/server/ssr-handler.mjs` after your own routes and your own file server for the built assets (`express.static`, `@fastify/static`): the handler renders pages and calls `next()` for everything else. These pages are rendered per request, from the host's data. See the `with-express` and `with-fastify` examples. `createSsrHandler({ maxBodyBytes })` sets the largest request body it reads for the API and form posts (default 100000 bytes). The hooks for a session and response headers are the next recipe.

### A session, a CSP and response headers

`createSsrHandler` reads each request once into `{ method, pathname, search, query, headers, cookies, signal }` and gives the request to the page's render, `api.handle`, `api.handleForm`, `initialStateFor`, `stateForBrowser`, `transformResponse` and the page's data requests (`fetchFunction(url, init, request)`). For a rendered form outcome, the page render, `initialStateFor`, `stateForBrowser`, `transformResponse`, its resources and data requests read the outcome page's path and query with the POST's method, headers and cookies (section 12). The framework has no session store, login flow, authorization or CSP policy. It gives you the request and three hooks; the policy is yours:

```js
import { randomBytes } from 'node:crypto';
// session.mjs verifies the cookie and returns the display name; see API.md section 12 or the server-hooks recipe.
import { readSession } from './session.mjs';
import { createSsrHandler } from '@ehtb/agent-ui/server/ssr-handler.mjs';

server.use(await createSsrHandler({
  config: { ...config, fetchFunction },
  root,
  outDir,
  // Public state the page starts from. The state is in the document: never put the session token here.
  initialStateFor: (request) => ({ session: { user: readSession(request.cookies.session) } }),
  // What the state script carries. A server-only key is added by initialStateFor and removed here.
  stateForBrowser: (state) => ({ ...state, session: { user: state.session.user } }),
  // Every answer the handler writes after a request context exists, including its 404 and 500.
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
}));
```

- A session token belongs in an `HttpOnly` cookie, set by the API or a form handler that changes the session. A page cannot set response headers; an API, a form outcome and `transformResponse` can set a cookie. Check the cookie, the `Origin` header or a CSRF token in the handler that changes state.
- To protect a page, return the public session state in `initialStateFor` and answer `status(state)` 403 when `state.session.user` is null; render a sign-in prompt, not the protected content, and keep `initialStateFor` public. A page cannot set a redirect header. The API and form handlers must check the session too: a page status protects the page, not the data.
- `request.cookies` holds raw values, not percent-decoded; `request.query` is a `URLSearchParams`; `request.headers` are Node's lower-case names. `request.signal` aborts when the client disconnects; the render already passes it to resources and their data requests, and a host query should take it too.
- A page that never becomes ready answers 503 after `renderTimeoutMs` (default 2000, or `timeoutMs` on the handler); `onTimeout: 'serve'` is the explicit option that sends the partial page instead. The handler reads JSON and URL-encoded bodies up to `maxBodyBytes` (default 100 KB) and answers 415 for another content type, including `multipart/form-data`; receive an upload in a host route and pass the parsed value as `request.body`.
- `initialStateFor` returns public state in the shape of `ui.state()`; every key must be declared by the page. If it returns a `session` namespace on every request, import one shared `session` namespace into every page. It is not a place to authorize: the page only renders what it is given. A shell is an app of its own and does not receive this state: if the shell shows the visitor, have the page declare the namespace and the shell `reads` the key (API.md section 13, "Shell and soft navigation").
- `stateForBrowser(state, request)` returns the state the document's state script carries after the page rendered. Keep the page's namespaces and keys and leave a server-only one out; it cannot add a key, because the browser app would not have it declared. It is a serialization boundary, not a secret store: the markup was rendered from the full state, and a value in the page's declared default is in the browser bundle. Put server-only data in `initialStateFor` with a neutral declared default and remove it here. During a static build and `agent-ui check` the request is `null`.
- `transformResponse(request, { status, headers, body })` runs after the framework's content type and cache default and the API's or form outcome's headers. Return `{ headers?, body? }` or null. Return only headers to add or replace: the headers passed in contain the framework's own headers (for example `content-type` on a page or API answer) and its security header, and those names are refused in a returned object, so read them and do not spread them. A returned header replaces the existing one; `set-cookie` values add up; the framework's security header is merged last. A returned `body` must be the whole body as a string. The body may be HTML, JSON or plain text: check `headers['content-type']` before rewriting it.
- A nonce needs both a header and a body rewrite, which is why it is one hook: the example adds the same nonce to the CSP and to every inline `script`. The page's module script is external and covered by `'self'`; the state-script reader and soft navigation accept attributes in any order, so the added nonce does not break hydration or a soft link. A page's CSS is an external stylesheet covered by `style-src 'self'`; a page that emits inline `style` needs a hash, a nonce or `'unsafe-inline'`, which the host decides. A soft navigation copies the next page's head and body scripts; an inline script that differs is created and runs, but the fetched document's nonce belongs to that response, not to the CSP of the document that stays. Keep page behavior in its module entry or a plugin when a soft link is used; do not rely on an inline script there. The state script is data, not code.
- The hook runs for every answer this handler writes once a request context exists, including its 404 and 500 and the 400 for a body it cannot read, but not for a request that goes to `next()` or for the 421 and 400 answered before a request context exists. If it throws, the visitor gets a 500 and the hook is not run again on that answer.
- A page cannot set response headers. `transformResponse` sets a page's cache policy or CSP; set a site policy unconditionally in the transform to make it a floor. A page whose state depends on the visitor should have the host send `vary: cookie` or `cache-control: private` from `transformResponse` for every answer: `no-cache` alone does not separate visitors in a shared cache.
- `fetchFunction(url, init, request)` can forward the visitor's cookie or authorization header to your data source. `prerender` and `agent-ui check` have no request, so the third argument is `undefined` there: a page whose data depends on the visitor cannot be statically generated.
- A host server or plugin that writes its own response can use `checkResponseHeaders` and `mergeResponseHeaders` from `@ehtb/agent-ui/http-headers`, so its headers follow the same checks and merge order (API.md section 12).

## 5. What is not automatic

- A session store, a login flow, authorization and a CSP policy are the project's. The framework passes the request and applies what the hooks return; it does not write a nonce, choose a policy, or decide who may see a page (section 4, "A session, a CSP and response headers").
- There is no streaming render and no partial hydration: the server sends one document after the page is ready (or a 503 by default), and the whole state script is the handover. The browser takes over the whole page (`docs/API.md`, "Taking over server markup").
- **What the browser needs to take over your markup.** It renders the page from the state the document carries and keeps the server's node wherever it is the node the render would make. Two things of your pages make it write nodes again, and `agent-ui check` reports both: markup that an HTML parser rewrites (a `div` in a `p`, a `tr` straight in a `table`, a link in a link: the validator names the nesting and what to write instead) and a derived value that is not a function of the state (it reads the time, a random number or a counter, or formats a date or number without an explicit `timeZone` and locale). Put the time or the id in state, written by an action or an API response, and write `toLocaleString('en-US', { timeZone: 'UTC' })` or `Intl.DateTimeFormat('en-US', { timeZone })` with the locale and zone the page means. A state key left out of the document by `stateForBrowser` that the page shows is the same mistake. A page that does it still works: the browser makes the nodes that differ again and reports `AUI0305`.
- There is no file-upload parser, no streaming request body, no SSE endpoint and no WebSocket endpoint. Receive those in the host server; pass a parsed body to the API as `request.body`, or serve the connection beside the handler.
- A modal, menu or popover is not a component with a focus trap. Use a native `dialog` with explicit state and copy recipe `modal`: its plugin traps the focus, restores it on close and marks the background `inert`.
- Translation, locale-aware URLs and right-to-left direction are the project's. Text and `dir` are ordinary state and attributes; the framework ships no message catalogue.
- A static site (`agent-ui build --static`) writes every page, and a page with parameters once for every URL its `view.js` lists in `export const paths = [...]` (or an async function); a page with parameters that lists none, or a status other than 200, stops the build with the reason. `agent-ui check` renders the same URLs and prints a note for a page with parameters that lists none (it is started at a sample URL, without fetching data).
- The API is Node code. A file host has no API: the static pages and the browser app work, but calls to `/api/...` and plain form posts do not.
- A site below a path of its domain is `basePath: '/shop'` in `build.config.mjs` (`BUILD.md`, "A site below a base path"). Specs, folders, resources and the API keep writing the site's own paths; a `url()` in CSS is relative to the stylesheet.
- Code splitting is by page: everything a page lists is in its chunk. A heavy feature inside one page is a plain `import()` (a lazy chunk).
- Soft navigation does not prefetch the next page; back and forward restore the window's scroll position, not the one inside a scrolling container; a page's own browser state does not survive a swap, as it does not survive a load.
- The `forms` handler and the `form` element's `action` are matched by you. The tests in `examples/events/app.test.mjs` post to both to catch drift.

## 5a. Reporting errors (Sentry and the like)

A production build keeps no sentences: an error is a code and its details (`AUI0202 {"action":"todos.add"}`, and `error.code`, `error.details`), which is also what a monitoring tool groups by. Register a plugin that hands the errors the runtime catches (a failed dispatch, a blocked URL, an update that threw) to the tool; the action log is a repro you can send with them, because `replay` reproduces the state from it.

```js
// reporting.js, listed in the plugins of the pages (or of the shell, for all of them)
export const withErrorReporting = () => (api) =>
  api.onError(({ code, details, error, action }) => {
    Sentry.withScope((scope) => {
      scope.setFingerprint([code]);                       // one issue per kind of error, not per key name
      scope.setTag('agent-ui.code', code);
      scope.setContext('agent-ui', { details, action, log: api.log.slice(-20) });  // the last actions: ui.replay(log) in a test reproduces it
      Sentry.captureException(error);
    });
  });
```

- The log holds the arguments of the actions. If they can hold personal data, send the action names (`api.log.slice(-20).map(([name]) => name)`) or filter the arguments first.
- Decode on the server side, not in the page: `import { decodeError } from '@ehtb/agent-ui/error-messages'` in a script that reads your issues, or in a `beforeSend` that runs in Node (`decodeError(error).text` is the sentence the development build would have said). Source maps (`agent-ui build --source-maps`) restore the stack the same way. In the browser nothing of the catalogue is downloaded.
- `agent-ui explain 'AUI0103 {"operation":"get","key":"todos.drat"}'` decodes one by hand. The codes and their details are listed in `docs/API.md`, section 9.
- Errors that are thrown out of the page (the app cannot start) are not caught by `onError`: they reach `window.onerror`, which the tool already hooks.

## 6. When it does not work

| Symptom | Likely cause | Fix |
|---|---|---|
| `page "/x": unknown key "vew"` | misspelled key in a page | use the suggested key; the message lists the allowed ones |
| `pages/a/page.js: its URL "/a/:slug" matches the same URLs as "/a/:id"` | two parameter folders at the same depth | merge the pages, or give one a fixed segment |
| `the folder name "x y" cannot be part of a URL` | a folder with a space or other character | letters, digits and `. _ ~ -` for a fixed segment, `[name]` for a parameter |
| `"[...path]" must be the last folder of the path` | a page below a catch-all folder | move the catch-all to the end |
| `agent-ui check` prints `/x/*rest has parameters and its view.js lists no \`paths\`` | a page with parameters has no URL of its own to render | its spec is still validated; to render it, export `paths = ['/x/a/b']` from its view.js (the same URLs `--static` writes) |
| `the link "/chekout" is no page` | a typo in an `href` | the message suggests the nearest page |
| `the soft link "/x" is on a page without a shell` | `soft` on a page that has no shell: nothing handles it | give the page a shell, or remove `soft` |
| `the soft link "/x" leads to /x, which has no shell` | a `soft` link to a page that is not in this page's shell | give both pages the shell, or remove `soft` |
| `page "/": page.js names the shell "main", but view.js exports no shell` | the behavior is in `page.js` and the content is missing from `view.js` (or the reverse) | export `shell` from both |
| `shell "main" reads[0]: watch key "cart.count" is not a state key ...` | the page lacks a namespace the shell reads | list that namespace in the page's `namespaces` |
| `soft navigation to /x: ... Loading it as a normal page` in the console | the answer was not a plain page, or a page of another shell | the link still works as a page load; read the reason it names |
| A URL shows the host's 404 | no page matches it | add a folder, or a `[...path]` page for a not-found page |
| `namespace "x": declares resources, but no plugin loads them` | the page lacks `plugins: [withResources]` | add it |
| `derived "events.visible": get("search.query"): there is no namespace "search"` | a namespace reads another that the page does not list | list it in the page's `namespaces` |
| `/api/...` returns `No such endpoint.` | the table's name differs from the URL, or the pattern does not match | endpoints live at `/api/<name>` plus the pattern |
| `/api/...` returns 405 with an `allow` header | the path matches an endpoint, but not for this method | use a method from `allow`, or add `'METHOD /pattern'` to the table's `endpoints` |
| `form "/x": outcome url "..." is not allowed` | a `forms` handler returned a `url` that is not a local path | return a path starting with `/` and not `//`, for example `url: '/contact'` |
| A form post renders the default page | `initialState` lacks a state key the outcome sets | include it, nested by namespace |
| The page shows "loading" in the HTML | the page's `ready` never became true, or the data URL is not answered at render time | check that `fetchFunction` in `build.config.mjs` (a host that answers from its own process puts its function in the config it passes to `createSsrHandler`) answers that URL; `agent-ui check` names the page |
| `ready(state) returned ... not true or false` | `ready` returned something else | return a boolean |
| Production build misses a check you saw in development | the spec validator is left out of production builds | run `agent-ui check` or build with `--dev` |
