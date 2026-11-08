# Production server

An agent-ui site served by one Node file with no third-party dependencies: Node's `http`, the built files in memory, and the framework's `createSsrHandler` for every page. It is the generic form of the production server a real app ships, with nothing app-specific: no API origin, no extra asset folders, no page names.

```
npm install      # links the framework (a local `file:` dependency, works offline)
npm run build    # agent-ui build -> dist/
npm start        # build and serve at http://localhost:8080/
npm test
```

`npm start` runs a production build and `server.mjs`. `npm run dev` is `agent-ui dev`, the development server with hot reload; `npm run serve` starts `server.mjs` next to an existing build.

What the server does:

- **Static files from memory.** At startup it reads `dist/` once (every file, with its MIME type, ETag and cache policy), so a request never waits on a file read. Files below `assets/` have a content hash in their name and are `immutable`; anything else keeps its name and is revalidated with its ETag (`public, max-age=3600`).
- **Pages per request.** Every other GET or HEAD goes to `createSsrHandler`, which renders the page for the requested URL with the same `create()` the browser runs; the markup and state are in the HTML, and the browser takes over.
- **The page shells and `manifest.json` are not public.** The renderer reads the shells as templates; a request for `index.html` or `manifest.json` is a 404. The shells are found from the pages the build reports, so a `public/index.html` that is not a page stays served.
- **Headers on every answer.** `SECURITY_HEADERS` (CSP, HSTS, `x-content-type-options`, `referrer-policy`, `permissions-policy`, COOP) is the one place the site policy is written. agent-ui binds style attributes, so the CSP allows inline styles; a page that calls another origin adds it to `connect-src` or `font-src`.
- **Cache-friendly.** A 200 HTML page is `public, max-age=0, s-maxage=60`: a CDN may keep it for a minute, a browser asks again. A page that depends on the visitor sends `private` or `no-store` and keeps its own policy. Hashed assets are immutable. Compression is deliberately the CDN's or the proxy's: the server sends plain bodies and `content-length`.
- **`/healthz`** answers `ok` without a render, for a load balancer.
- **Only GET and HEAD.** Writes are 405 with `allow`; an unknown path is 404 `no-store`.
- **Timeouts and shutdown.** Request and header timeouts are short (no request has a body), idle connections outlive a 60 s proxy, and SIGTERM stops accepting connections, waits for the open ones, and exits within 10 s.

Data: the page of this example loads no data. A page with `resources` renders through the config's `fetchFunction` (the server passes the config it loaded); a server that prefers the browser to load the data passes `fetchFunction: () => new Promise(() => {})` and renders the page's loading state. If `build.config.mjs` names an `api` module, `createSsrHandler` answers its endpoints too.

## Docker

`Dockerfile` is the same server in an image. The named context is the framework's repository root, because the example links it with `file:../..`:

```
docker build --build-context agent-ui=../.. -t agent-ui-production-server .
docker run --rm -p 8080:8080 agent-ui-production-server
```

The runtime image keeps the sources: server rendering imports the generated page modules and `build.config.mjs`, so it is not a `dist/`-only image.

What to read: `server.mjs` (the whole host), `server.test.mjs` (the build and every answer over HTTP), `Dockerfile`.
