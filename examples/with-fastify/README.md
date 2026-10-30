# With Fastify

The same guestbook as `with-express`, inside a Fastify server. Fastify owns the routes and the API; its not-found handler hands the raw request and response to agent-ui's handler (`reply.hijack()` first), which renders the page and calls back for everything else; the built assets are served by `@fastify/static`.

```
npm install      # also installs Fastify, so this one needs the npm registry
npm run build
npm start        # http://localhost:3000
npm test         # app.test.mjs runs anywhere; server.test.mjs needs Fastify (skipped until installed)
```

Pages (each folder below `pages/` mirrors its URL: `pages/entry/[id]/page.js` is `/entry/:id`): `/` (entries), `/entry/:id` (one entry; unknown ids answer 404), `/sign` (the form), `/about`. Every URL is rendered per request with the host's data, and the browser takes over from there. Each page declares `ready` (when the entries have loaded), `pending` (what the browser shows meanwhile) and `status` (404 for an unknown entry, 503 for a failed load) in its `page.js`; the entries themselves live on the server, and every page load fetches them again.

What to read: `server.js` (route table, the not-found handler, why `hijack`), `pages/` (the pages).

Not tested against the real Fastify in the framework repository's own test run (the registry is not reachable there); the wiring was exercised with a stand-in that implements the Fastify calls used here. Run `npm install && npm test` in this folder to run it against Fastify.
