# Orders

A multistep flow: look up a customer, their orders load, pick an order and its shipment loads. Shows chained `resources` (each step watches what the previous step stored and returns `null` until it can run), a reusable `loadable` feature (the counterpart of a custom hook) that generates the loading, loaded and failed actions, derived rows, a validated form and notes kept in memory, and a Cancel button for the orders request (a state flag the resource watches; the request is aborted and `onCancel` resets the status).

```
npm install      # links the framework (a local `file:` dependency, works offline)
npm run build    # agent-ui build  -> dist/
npm run serve    # http://localhost:8080/
npm test
```

Customers `1` and `2` exist; any other id fails with `HTTP 404`. Order `103` has no shipment, which shows a failed last step.
