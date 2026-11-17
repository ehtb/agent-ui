// The real-browser benchmark of this example. Run with `npm run benchmark` (or `npm run example -- bench benchmark` from
// the repository root). Needs headless Chrome; skips with a message when there is none. Not part of `npm test`: it is a
// measurement, and its numbers belong in this README, not in an assertion.
//
// What it measures, in a real browser over the DevTools protocol (no dependency: @ehtb/agent-ui/testing/browser.mjs):
//
//   startup   the page at /count/:count, rendered by the server and taken over by the browser: largest contentful paint,
//             the sum and count of long tasks (over 50 ms), cumulative layout shift, and the DOM mutations the first
//             render writes (0 means the markup was taken over, not built again)
//   updates   on the page at "/", with the list seeded to the same size: toggling one row, adding one row, adding 1,000
//             rows and clearing, timed around the action and one settle
//
// Medians; see README.md for the exact method and its limits.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, serveSite } from '@ehtb/agent-ui/testing/browser.mjs';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const COUNTS = [1000, 5000, 20000];
const STARTUP_RUNS = 3;
const TOGGLES = 30;
const ADD_ONE_RUNS = 10;
const ADD_MANY_RUNS = 3;

// Runs before any script of the page: records LCP, long tasks, layout shift and DOM mutations in window.__benchMetrics.
// The observers are kept in window.__benchObservers: an observer nothing references can be collected before it delivers.
// The MutationObserver watches `document`, not document.documentElement: at the time this script runs the document has no
// root element yet, and observe(null) would stop the script.
const observeScript = `(() => {
  const metrics = { lcp: 0, longTasks: 0, longTaskCount: 0, cls: 0, mutations: 0 };
  window.__benchMetrics = metrics;
  const observers = [
    new PerformanceObserver((list) => { for (const entry of list.getEntries()) metrics.lcp = entry.startTime; }),
    new PerformanceObserver((list) => { for (const entry of list.getEntries()) { metrics.longTasks += entry.duration; metrics.longTaskCount += 1; } }),
    new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (!entry.recentInput) metrics.cls += entry.value; }),
    new MutationObserver((records) => {
      if (document.readyState === 'loading') return; // the parser's own inserts are not the app's writes
      const app = document.getElementById('app');
      if (!app) return;
      for (const record of records) {
        if (!app.contains(record.target)) continue; // the metric is the page's markup: not the title, not body whitespace
        metrics.mutations += record.type === 'childList' ? record.addedNodes.length + record.removedNodes.length : 1;
      }
    }),
  ];
  observers[0].observe({ type: 'largest-contentful-paint', buffered: true });
  observers[1].observe({ type: 'longtask', buffered: true });
  observers[2].observe({ type: 'layout-shift', buffered: true });
  observers[3].observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  window.__benchObservers = observers;
})()`;

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const ms = (value) => `${value.toFixed(1).padStart(7)}ms`;

// Times one action of the running app: the dispatch, the render it causes, and one settle, all in the page.
const timedDispatch = (page, name, args) =>
  page.evaluate(`(async () => {
    const started = performance.now();
    window.__ui.dispatch(${JSON.stringify(name)}, ${JSON.stringify(args)});
    await window.__ui.settle();
    return performance.now() - started;
  })()`);

const measureStartup = async (browser, url) => {
  const runs = [];
  for (let run = 0; run < STARTUP_RUNS; run++) {
    const page = await browser.open(url, { beforeLoad: observeScript });
    await page.settle();
    // The buffered LCP entry is delivered a task after the page starts; wait for it, so a fast page does not read 0.
    const metrics = await page.evaluate(`(async () => {
      const deadline = performance.now() + 2000;
      while (performance.now() < deadline && window.__benchMetrics.lcp === 0) await new Promise((resolve) => setTimeout(resolve, 20));
      return window.__benchMetrics;
    })()`);
    runs.push(metrics);
    await page.send('Page.navigate', { url: 'about:blank' }); // unload the page: the next run opens a fresh one
  }
  return {
    lcp: median(runs.map((run) => run.lcp)),
    longTasks: median(runs.map((run) => run.longTasks)),
    longTaskCount: median(runs.map((run) => run.longTaskCount)),
    cls: median(runs.map((run) => run.cls)),
    mutations: median(runs.map((run) => run.mutations)),
  };
};

const measureUpdates = async (browser, url, count) => {
  const page = await browser.open(url, { beforeLoad: observeScript });
  await page.settle();
  const seed = await timedDispatch(page, 'bench.seed', { count });
  const toggleId = (index) => 1 + ((index * 7919) % count);
  const toggles = [];
  for (let index = 0; index < TOGGLES; index++) toggles.push(await timedDispatch(page, 'bench.toggle', { id: toggleId(index) }));
  const mutationsBefore = await page.evaluate('window.__benchMetrics.mutations');
  await timedDispatch(page, 'bench.toggle', { id: toggleId(0) });
  const toggleMutations = (await page.evaluate('window.__benchMetrics.mutations')) - mutationsBefore;
  const addOne = [];
  for (let run = 0; run < ADD_ONE_RUNS; run++) addOne.push(await timedDispatch(page, 'bench.addOne', {}));
  const addMany = [];
  for (let run = 0; run < ADD_MANY_RUNS; run++) addMany.push(await timedDispatch(page, 'bench.addMany', { count: 1000 }));
  const clear = await timedDispatch(page, 'bench.clear', {});
  await page.send('Page.navigate', { url: 'about:blank' });
  return {
    seed,
    toggle: median(toggles),
    toggleMutations,
    addOne: median(addOne),
    addMany: median(addMany),
    clear,
  };
};

const pad = (value, width) => String(value).padStart(width);

const print = (count, startup, updates) => {
  console.log(
    `${pad(count, 6)}  seed ${ms(updates.seed)}  toggle ${ms(updates.toggle)} (${updates.toggleMutations} mutations)  ` +
      `add one ${ms(updates.addOne)}  add 1,000 ${ms(updates.addMany)}  clear ${ms(updates.clear)}  |  ` +
      `LCP ${ms(startup.lcp)}  long tasks ${ms(startup.longTasks)} (${startup.longTaskCount})  CLS ${startup.cls.toFixed(3)}  ` +
      `start mutations ${startup.mutations}`,
  );
};

console.log(`building ${projectRoot} and serving it`);
const site = await serveSite({ projectRoot });
const browser = await launchBrowser();
if (!browser) {
  console.error('no Chrome found: the benchmark needs headless Chrome (set CHROME_PATH to name another build)');
  process.exit(1);
}
try {
  console.log('count    seed            toggle               add one       add 1,000       clear             | startup (median of ' + STARTUP_RUNS + ')');
  for (const count of COUNTS) {
    const startup = await measureStartup(browser, `${site.url}/count/${count}`);
    const updates = await measureUpdates(browser, `${site.url}/`, count);
    print(count, startup, updates);
  }
} finally {
  await browser.close();
  site.close();
}
