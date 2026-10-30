# Contacts

A contact list with a form, validation, search, filter and sort, in four namespaces (`contacts`, `form`, `view`, `editing`) that reach each other through `calls`.

The contacts live in memory and are gone after a reload; durable data belongs on the server (`resources`, see `examples/orders` and `examples/events`).

```
npm install && npm run build && npm run serve    # http://localhost:8080/
npm test
```
