# Loading states

Pages that say when they are ready. Each page declares `ready`, `pending` and `status` (see `docs/GUIDE.md`, "A page that needs data"):

| Page        | URL            | What it shows                                                                                                                                                                         |
| ----------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instant     | `/instant`     | No data and no `ready`: ready at once.                                                                                                                                                |
| Products    | `/products`    | `ready` + `pending`: a skeleton until the products have loaded; Reload refreshes them behind the list (the list stays, "Refreshing in the background…" shows).                        |
| One product | `/products/2`  | The same data. `status`: 404 for an unknown id (`/products/99`), but only after loading, so "not found" never flashes.                                                                |
| Unavailable | `/unavailable` | The data never arrives. A failure counts as finished: the error is shown, the page answers 503, "Try again" repeats the request. Owns its own state and resource, scoped to its page. |

```
npm install
npm start        # http://localhost:8080/  (build, then render every page per request)
npm test
```

What to read: `pages/shared.js` (the loading states, why only the first load says "loading", and the 1.2 second delay in the browser that makes the skeleton visible; the server is not slowed down), `pages/products/page.js` (ready and status) with `pages/products/view.js` (the view and its pending skeleton next to it), `pages/unavailable/page.js` (a page's own resource, failure as a finished state). Each `page.js` is the page's behavior only; its content is the `view.js` beside it, and `pages/layout.js` is the shell they share.

The server renders the finished page for every URL, so `pending` is only visible in the browser: open a product that is not in `products.json`, or reload with the network slowed down. `unavailable` answers 503, so this site cannot be built with `--static` (a file host would serve that page with 200).
