# Islands

agent-ui used as a library, without its page model: the host (`server.js`, plain `node:http`) owns the page, its header, its routes and its files. Two agent-ui apps live in it: a product list in the main content and a cart badge in the host's header. Each is a separate app with its own namespace, state and log; `syncApps` sends the catalog's count to the badge, one way, through the badge's own action.

```
npm install      # links the framework; no registry needed
npm start        # http://localhost:3000
npm test         # the islands in the test DOM, and the host over HTTP
```

What it shows:

- **No `pages/` folder and no `agent-ui build`.** A widget is a namespace, a spec and a `create({ root, dev, initialState })` function (`client/widgets/`). The server renders it with `renderPage(create, { url, dev, initialState })` into an element of its own page and writes its state next to it with `stateScriptHtml(state, id)`. The browser starts it from that state with `readServerState(document, id)` (`client/islands.js`).
- **Two apps on one page.** `syncApps` is the one sanctioned way for them to talk (`docs/API.md`, section 6): declared as data, checked when made, logged on the receiving side. Inside one app, namespaces and `calls` do that.
- **The browser loads the package's modules as they are**, through an import map in the page, so there is nothing to build. That is the shortest path, not the fastest: the browser downloads the builders and the validator too. A production site bundles the client (with `agent-ui build`, which uses the page model, or with the bundler the host already has) so a browser downloads only the runtime and the spec.

What it does not show: anything the page model gives (pages from folders, soft navigation, `agent-ui check` over every page, static generation). Those are in the other examples; this one is the floor of what the framework needs from a host.
