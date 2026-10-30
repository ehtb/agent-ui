# Hydration

Server rendering and takeover: every URL is rendered on the server (a 404 for an unknown article, as set by the page's `status`), and the browser app takes over from the state embedded in the page. `route.hydrated` is false in the server markup and true once the browser app runs.

```
npm install && npm run build && npm run serve      # http://localhost:8080/
npm test
```
