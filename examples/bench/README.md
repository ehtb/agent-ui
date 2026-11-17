# Bench

A real-browser benchmark of the framework's two costs: **starting a server-rendered page** and **updating a large list**. `benchmark.mjs` builds this example, serves it, and drives headless Chrome over the DevTools protocol (`@ehtb/agent-ui/testing/browser.mjs`, no dependency). It needs Chrome and skips with a message without one; it is not part of `npm test`.

```
npm install && npm run benchmark      # or, from the repository root: npm run example -- bench benchmark
```

Two pages:

- `/count/:count` — the list is derived from the URL's parameter, so the server renders that many rows and the browser takes the markup over (adopt). The benchmark opens it at 1,000, 5,000 and 20,000 rows to measure startup.
- `/` — the list is state; the benchmark seeds it to the same sizes and measures the actions one visitor action causes.

## What is measured

**Startup** (median of 3 fresh loads of `/count/:count`):

- **LCP** — the last `largest-contentful-paint` entry, waited for with a bounded poll (the buffered entry arrives a task after the page starts).
- **Long tasks** — the sum and count of `longtask` entries (each over 50 ms).
- **CLS** — the sum of `layout-shift` values without recent input.
- **Start writes** — the DOM mutations the first render makes inside the page's app element after the document is parsed: 0 means the server's markup was taken over untouched.

**Updates** (on `/`, one page per size, median over repeated actions, each timed around the dispatch and one settle):

- **seed** — one action that writes the whole list of that size (the largest single write).
- **toggle** — 30 toggles of different rows.
- **add one** — 10 single-row additions.
- **add 1,000** — 3 additions of a thousand rows.
- **clear** — one action.

A script the browser runs before the page's own (`beforeLoad`) installs the observers, so the measurement covers the whole startup; the mutation observer ignores records while the document is parsing and anything outside the app element.

## Results

Measured 2026-11-17, MacBook Pro (Apple M4 Pro, macOS 15), Node 24.5, Google Chrome 157.0.8103.79, production build, served per request on 127.0.0.1, medians as above. Machine-dependent: compare runs on one machine, not across machines.

| Rows | seed | toggle | add one | add 1,000 | clear | LCP | long tasks | CLS | start writes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,000  | 8.3 ms   | 0.3 ms | 0.3 ms | 7.0 ms | 11.1 ms | 80 ms  | 0           | 0.000 | 0 |
| 5,000  | 34.2 ms  | 1.2 ms | 1.0 ms | 6.0 ms | 22.4 ms | 172 ms | 0           | 0.000 | 0 |
| 20,000 | 113.2 ms | 4.7 ms | 4.3 ms | 9.8 ms | 66.3 ms | 284 ms | 106 ms (1)  | 0.000 | 0 |

What the numbers say, and what they do not:

- **Toggling one row stays cheap and constant in DOM writes (3 mutations) at every size.** Its time grows linearly (the derived list is recomputed in full), reaching 4.7 ms at 20,000 rows — still one frame, and the same order the test shim reports. Every row is rendered (there is no virtualization), so a page of 20,000 rows costs an 80,000-element document at startup; the framework's own advice for lists this long is to ask the server for one page of the data at a time (`budgets.listRows`, `docs/BUILD.md`). **The measurement settled the question the roadmap had left open** (docs/DESIGN.md, roadmap item 4): an incremental derive is not built for now, because the recomputation is under one frame at every size the framework advises to render, and a general one would need the state model to grow.
- **Startup is the adopter's work paying off:** 0 start writes at every size, no layout shift, and one long task at 20,000 rows (the first render's script itself). The LCP of a 20,000-row page is 284 ms on this machine with no network.
- **Adding one row to a 20,000-row list costs 4.3 ms** — the full derive again. Fine for the sizes above; the same linear growth that bounds toggling bounds it.
- **What this is not:** a comparison with other frameworks (same page, no network, no throttling); a measurement of a real site's TTI (no images, fonts or third-party code); and the timings include the DevTools round trips of the driving helper for the actions (the LCP and long-task numbers do not).

## Files

| File | What it is |
|---|---|
| `benchmark.mjs` | the benchmark (run it, do not import it) |
| `pages/page.js`, `pages/view.js` | the page at `/`: a toolbar of actions and the list they act on |
| `pages/count/[count]/page.js`, `.../view.js` | the page at `/count/:count`: the list derived from the URL, `paths` naming the URLs `agent-ui check` renders |
| `bench/items.js` | the namespace both pages share: `seed`, `toggle`, `addOne`, `addMany`, `clear`, and the rows derived from the URL until the first action materializes the list |
| `test/bench.test.mjs` | the pages on the test DOM: the actions do what the benchmark measures, one toggle writes one row, and the unchanged items keep their references |
