# Notes

The notes page from the quick start in the framework's `docs/API.md`: two namespaces, a cross-namespace `calls`, a form.

The notes live in memory and are gone after a reload. Anything that must last belongs on the server: load and save it with a `resources` entry (see `examples/orders` and `examples/events`).

```
npm install && npm run build && npm run serve    # http://localhost:8080/
npm test
```
