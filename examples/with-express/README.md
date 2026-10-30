# With Express

agent-ui pages inside an Express server. Express owns the server, the routes and the API (`/api/entries`); agent-ui contributes one request handler (`createSsrHandler`) that renders the guestbook page per request; Express serves the built assets itself (`express.static`). The page is rendered from the same in-process store that the API uses.

```
npm install      # also installs Express, so this one needs the npm registry
npm run build    # agent-ui build -> dist/
npm start        # http://localhost:3000
npm test         # app.test.mjs runs anywhere; server.test.mjs needs Express (skipped until installed)
```

Pages (each folder below `pages/` mirrors its URL: `pages/entry/[id]/page.js` is `/entry/:id`): `/` (entries), `/entry/:id` (one entry; unknown ids answer 404), `/sign` (the form), `/about`. Every URL is rendered per request with the host's data, and the browser takes over from there. Each page declares `ready` (when the entries have loaded), `pending` (what the browser shows meanwhile) and `status` (404 for an unknown entry, 503 for a failed load) in its `page.js`; the entries themselves live on the server, and every page load fetches them again.

What to read: `server.js` (the order: host routes, agent-ui handler, host 404, and why), `pages/` (the pages, which talk to `/api/entries` with `resources`), (rendered per request, not at build time, because the data comes from the host).

Run `npm install && npm test` in this folder to test it against Express (17 tests, including the server over HTTP).
