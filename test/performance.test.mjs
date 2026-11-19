// The development performance plugin (src/performance.js), `agent-ui check --performance`, `budgets.stylesheetsGzipBytes` and
// the `fetchpriority` attribute: guiding an author or agent to write pages that pass Lighthouse performance criteria.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { auditSpecPerformance, performance, withPerformance } from '../src/performance.js';
import * as performanceStub from '../build/stubs/performance-omitted.js';
import { app, validate } from '../src/ui.js';
import { act, button, div, each, img, item, li, p, state, ul } from '../src/spec.js';
import { memoizeItem } from '../src/memoize.js';
import { definePage } from '../src/pages.js';
import { withResources } from '../src/resources.js';
import { createRoot, createWindow } from './support/dom-shim.mjs';
import { mountSpec } from './support/helpers.mjs';

const repository = resolve(import.meta.dirname, '..');

test('fetchpriority is a valid attribute in the grammar and validator, and a near miss is suggested', () => {
  const valid = img({ id: 'hero', src: '/hero.jpg', alt: 'Hero', width: 800, height: 600, fetchpriority: 'high' });
  assert.deepEqual(validate(valid, { namespaces: {} }), []);
  const misspelt = { tag: 'img', props: { src: '/hero.jpg', alt: 'Hero', fetchpriorty: 'high' } };
  const problems = validate(misspelt, { namespaces: {} });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /unknown attribute "fetchpriorty"\. Did you mean "fetchpriority"\?/);
});

test('auditSpecPerformance checks render-blocking head scripts, unsized and lazy LCP images, SSR resource waterfalls and unused namespaces', () => {
  const namespaces = {
    catalog: {
      state: { items: [], status: 'idle' },
      actions: {
        loading: { args: {}, run() {} },
        loaded: { args: { data: 'json' }, run: (store, { data }) => store.set('items', data) },
        failed: { args: { message: 'string' }, run() {} },
      },
      resources: [
        {
          watch: [],
          owns: ['items'],
          request: () => ({ url: '/api/items' }),
          onStart: 'loading',
          onSuccess: 'loaded',
          onError: 'failed',
        },
      ],
    },
    unusedFeature: {
      state: { count: 0 },
      actions: { bump: { args: {}, run: (store) => store.set('count', store.get('count') + 1) } },
    },
  };

  const spec = div(
    null,
    img({ id: 'hero', src: '/hero.jpg', alt: 'Hero', loading: 'lazy', fetchpriority: 'high' }),
    ul({ id: 'list' }, each('catalog.items', 'id', li(null, item('name')))),
  );

  const withoutReady = auditSpecPerformance(spec, {
    head: {
      title: 'Shop',
      tags: [
        { tag: 'script', props: { src: '/blocking.js' } },
        { tag: 'script', props: { src: '/deferred.js', defer: true } },
        { tag: 'script', props: { type: 'application/ld+json' }, children: '{}' },
      ],
      bodyTags: [{ tag: 'script', props: { src: '/analytics.js' } }],
    },
    namespaces,
    hasReady: false,
    where: 'pages/page.js',
  });

  assert.deepEqual(withoutReady, [
    'pages/page.js: head.tags[0]: <script src="/blocking.js"> in <head> blocks rendering and delays FCP and LCP. Add defer: true or async: true to props, or move the script to head.bodyTags',
    'pages/page.js: img "hero": <img> has no width and height, so the layout shifts when it loads (CLS). Add width and height to props',
    'pages/page.js: img "hero": <img> has both loading="lazy" and fetchpriority="high". Remove loading="lazy" on an above-the-fold LCP image, or remove fetchpriority="high"',
    'pages/page.js: namespace "catalog": declares resources, but the page has no ready(state) function. The server renders before the data arrives, delaying LCP until the browser fetches it. Add ready: (state) => ... to page.js',
    'pages/page.js: namespace "unusedFeature": listed in namespaces, but nothing in the view, head or other namespaces reads or calls it. Remove "unusedFeature" from namespaces so the page does not download unused JavaScript',
  ]);

  // With hasReady: true, the check flags a resource with `owns` that omits `revalidate: 'never'`.
  const withReady = auditSpecPerformance(img({ id: 'hero', src: '/hero.jpg', alt: 'Hero', width: 800, height: 600, fetchpriority: 'high' }), {
    namespaces: { catalog: namespaces.catalog },
    hasReady: true,
    where: 'pages/page.js',
  });
  assert.deepEqual(withReady, [
    'pages/page.js: namespace "catalog" resources[0]: the server already waits for ready(state), but the browser fetches this resource again on mount. Add revalidate: \'never\' (with owns) so the browser trusts the server\'s data on first paint',
  ]);

  // With revalidate: 'never', width + height, and all namespaces used, there are no problems.
  const cleanNamespaces = {
    catalog: {
      ...namespaces.catalog,
      resources: [{ ...namespaces.catalog.resources[0], revalidate: 'never' }],
    },
    meta: { state: { label: 'Shop' } },
  };
  assert.deepEqual(
    auditSpecPerformance(
      div(null, img({ id: 'hero', src: '/hero.jpg', alt: 'Hero', width: 800, height: 600, fetchpriority: 'high' }), ul(null, each('catalog.items', 'id', li(null, item('name'))))),
      {
        head: { title: (currentState) => currentState.meta.label },
        namespaces: cleanNamespaces,
        hasReady: true,
      },
    ),
    [],
  );
});

test('options of auditSpecPerformance, performance and withPerformance are checked with suggestions', () => {
  assert.throws(() => auditSpecPerformance({ tag: 'div' }, null), /auditSpecPerformance: options must be an object, got null/);
  assert.throws(() => auditSpecPerformance({ tag: 'div' }, { hasRedy: true }), /auditSpecPerformance: unknown option "hasRedy"\. Did you mean "hasReady"\? Allowed options: head, namespaces, hasReady, where/);
  assert.throws(() => performance(null), /performance: options must be an object, got null/);
  assert.throws(() => performance({ elemnts: 100 }), /performance: unknown option "elemnts"\. Did you mean "elements"\? Allowed options: onReport, elements, listRows, actionMs, longTaskMs, unusedCssRatio, head, hasReady, where/);
  assert.throws(() => performance({ elements: 0 }), /performance: elements must be a whole number, 1 or more\. Write elements: 1500/);
  assert.throws(() => performance({ listRows: -5 }), /performance: listRows must be a whole number, 1 or more\. Write listRows: 100/);
  assert.throws(() => performance({ actionMs: 0 }), /performance: actionMs must be a positive number of milliseconds\. Write actionMs: 16/);
  assert.throws(() => performance({ longTaskMs: -1 }), /performance: longTaskMs must be a positive number of milliseconds\. Write longTaskMs: 50/);
  assert.throws(() => performance({ unusedCssRatio: 1.5 }), /performance: unusedCssRatio must be a number between 0 and 1\. Write unusedCssRatio: 0\.5/);
  assert.throws(() => performance({ onReport: 'log' }), /performance: onReport must be a function/);
  assert.throws(() => withPerformance({ listRow: 50 }), /performance: unknown option "listRow"\. Did you mean "listRows"\?/);
  assert.throws(
    () => app({ dev: true, namespaces: {}, spec: div(null, 'x'), root: createRoot(), plugins: [withPerformance] }),
    /plugins\[0\] \("withPerformance"\) is a page plugin factory/,
  );
});

test('runtime performance plugin reports DOM size, list rows, and unmemoized derived lists, and stays quiet when memoizeItem is used', async () => {
  const initialItems = Array.from({ length: 20 }, (_, index) => ({ id: index + 1, title: `Item ${index + 1}`, done: false }));
  const makeNamespaces = (transform) => ({
    todos: {
      state: { items: initialItems },
      derive: { rows: (get) => get('items').map(transform) },
      actions: {
        toggle: {
          args: { id: 'number' },
          run: (store, { id }) => store.set('items', store.get('items').map((entry) => (entry.id === id ? { ...entry, done: !entry.done } : entry))),
        },
      },
    },
  });
  const listSpec = ul({ id: 'todo-list' }, each('todos.rows', 'id', li(null, item('label'))));

  const findings = [];
  const { ui } = mountSpec({
    namespaces: makeNamespaces((entry) => ({ id: entry.id, label: entry.title.toUpperCase(), done: entry.done })),
    spec: listSpec,
    plugins: [performance({ elements: 10, listRows: 15, onReport: (finding) => findings.push(finding) })],
  });

  assert.equal(findings.some((finding) => finding.kind === 'dom-size' && /renders 21 elements, over the limit of 10/.test(finding.message)), true);
  assert.equal(findings.some((finding) => finding.kind === 'list-rows' && /renders 20 rows in one list \(inside "todo-list"\), over the limit of 15/.test(finding.message)), true);

  ui.dispatch('todos.toggle', { id: 1 });
  await ui.settle();
  const unmemoized = findings.find((finding) => finding.kind === 'unmemoized-derive');
  assert.ok(unmemoized, JSON.stringify(findings));
  assert.match(unmemoized.message, /action "todos\.toggle" recomputed derived list "todos\.rows" \(20 items\) and created new object references for 19 unchanged items.*memoizeItem/);

  // Deduplicated: a second toggle does not report the same message again.
  const countBefore = findings.length;
  ui.dispatch('todos.toggle', { id: 2 });
  await ui.settle();
  assert.equal(findings.length, countBefore);

  // With memoizeItem, unchanged rows keep their reference and no unmemoized-derive finding is reported.
  const memoizedFindings = [];
  const formatRow = memoizeItem((entry) => ({ id: entry.id, label: entry.title.toUpperCase(), done: entry.done }));
  const memoized = mountSpec({
    namespaces: makeNamespaces(formatRow),
    spec: listSpec,
    plugins: [performance({ onReport: (finding) => memoizedFindings.push(finding) })],
  });
  memoized.ui.dispatch('todos.toggle', { id: 1 });
  await memoized.ui.settle();
  assert.deepEqual(memoizedFindings, []);
});

test('browser stylesheets and PerformanceObserver (LCP, CLS, Long Tasks) are reported with data-id and cleaned up on destroy', () => {
  const observers = [];
  const disconnected = [];
  class FakePerformanceObserver {
    constructor(callback) {
      this.callback = callback;
    }
    observe({ type }) {
      this.type = type;
      observers.push(this);
    }
    disconnect() {
      disconnected.push(this.type);
    }
    emit(entries) {
      this.callback({ getEntries: () => entries });
    }
  }

  const win = createWindow('/');
  win.PerformanceObserver = FakePerformanceObserver;
  const unusedRules = Array.from({ length: 9 }, (_, index) => ({ selectorText: `.unused-${index}` }));
  win.document = {
    title: 'Home',
    styleSheets: [
      {
        href: 'http://localhost:8080/assets/shared-60fa35a0.67007604.css',
        cssRules: [{ selectorText: ':root' }, { selectorText: '.used:hover' }, ...unusedRules],
      },
    ],
    querySelector: (selector) => (selector === '.used' ? {} : null),
  };

  const findings = [];
  const definition = definePage(
    {
      head: { title: 'Home' },
      plugins: [withPerformance({ onReport: (finding) => findings.push(finding) })],
    },
    { path: '/', view: div({ id: 'hero-box' }, p({ id: 'text' }, 'Hello')) },
  );

  const ui = definition.create({ root: createRoot(), win, fetchFunction: null, dev: true });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'unused-css');
  assert.match(findings[0].message, /page "\/": stylesheet "\/assets\/shared-60fa35a0\.67007604\.css" has 9 of 10 rules \(90%\) that match no element on this page/);

  const lcpObserver = observers.find((observer) => observer.type === 'largest-contentful-paint');
  const clsObserver = observers.find((observer) => observer.type === 'layout-shift');
  const longTaskObserver = observers.find((observer) => observer.type === 'longtask');

  lcpObserver.emit([
    {
      startTime: 1420,
      element: {
        localName: 'img',
        getAttribute: (name) => (name === 'data-id' ? 'hero-image' : name === 'loading' ? 'lazy' : null),
      },
    },
  ]);
  lcpObserver.emit([
    {
      startTime: 980,
      element: {
        localName: 'img',
        getAttribute: (name) => (name === 'data-id' ? 'banner-image' : null),
      },
    },
  ]);
  clsObserver.emit([
    {
      hadRecentInput: false,
      value: 0.25,
      sources: [{ node: { getAttribute: (name) => (name === 'data-id' ? 'hero-box' : null) } }],
    },
  ]);
  longTaskObserver.emit([{ duration: 120 }]);

  assert.equal(findings.some((finding) => finding.kind === 'lcp-lazy-image' && /LCP element <img data-id="hero-image"> \(1420 ms\) has loading="lazy"/.test(finding.message)), true);
  assert.equal(findings.some((finding) => finding.kind === 'lcp-priority' && /LCP element <img data-id="banner-image"> \(980 ms\) does not have fetchpriority="high"/.test(finding.message)), true);
  assert.equal(findings.some((finding) => finding.kind === 'cls' && /layout shift of 0\.250 \(over Lighthouse's 0\.1 threshold\) affecting \[data-id="hero-box"\]/.test(finding.message)), true);
  assert.equal(findings.some((finding) => finding.kind === 'long-task' && /main-thread task took 120 ms \(over 50 ms; last action: startup\)/.test(finding.message)), true);

  ui.destroy();
  assert.deepEqual(disconnected.sort(), ['largest-contentful-paint', 'layout-shift', 'longtask']);
});

test('Rule 13: withPerformance and the production stub stay quiet when dev is false, during server rendering, and during replay', async () => {
  const findings = [];
  const definition = definePage(
    {
      head: { title: 'Home', tags: [{ tag: 'script', props: { src: '/blocking.js' } }] },
      plugins: [withPerformance({ onReport: (finding) => findings.push(finding) })],
    },
    { path: '/', view: img({ id: 'hero', src: '/hero.jpg', alt: 'Hero' }) },
  );

  // dev: false and isServerRendering: true both stay quiet even when the real module is loaded.
  const prodUi = definition.create({ root: createRoot(), win: createWindow('/'), fetchFunction: null, dev: false });
  prodUi.destroy();
  const ssrUi = definition.create({ root: createRoot(), win: createWindow('/'), fetchFunction: null, dev: true, isServerRendering: true });
  ssrUi.destroy();
  assert.deepEqual(findings, []);

  // The production stub exports the same functions and does nothing.
  assert.deepEqual(performanceStub.auditSpecPerformance(), []);
  assert.equal(typeof performanceStub.performance(), 'function');
  assert.equal(typeof performanceStub.withPerformance(), 'function');

  // Production: a page that lists withPerformance, bare or called with options, starts and installs nothing (the stub is what a
  // production build swaps in). A call that returned the plugin itself instead of a factory failed with "returned nothing, not a plugin".
  for (const plugin of [performanceStub.withPerformance, performanceStub.withPerformance({ elements: 1000 })]) {
    const productionPage = definePage({ head: { title: 'Production' }, plugins: [plugin] }, { path: '/', view: p({ id: 'text' }, 'Hello') });
    const productionUi = productionPage.create({ root: createRoot(), win: createWindow('/'), fetchFunction: null, dev: false });
    productionUi.destroy();
  }
});

test('auditSpecPerformance counts a namespace as read only when its whole name is mentioned, and onTimeout does not excuse a second fetch', () => {
  const namespaces = { cart: { state: { total: 0 } }, art: { state: { count: 0 } } };
  const spec = p({ id: 'total' }, state('cart.total'));
  const unusedArt = 'namespace "art": listed in namespaces, but nothing in the view, head or other namespaces reads or calls it';

  // `art` sits inside `cart` in the head function, and inside `smart.` in a derive function: neither reads it.
  const headProblems = auditSpecPerformance(spec, { head: { title: (state) => `Cart ${state.cart.total}` }, namespaces });
  assert.equal(headProblems.length, 1);
  assert.match(headProblems[0], new RegExp(unusedArt));
  const deriveProblems = auditSpecPerformance(spec, {
    namespaces: { ...namespaces, smart: { state: {}, derive: { label: (get) => get('smart.label') } }, cart: { state: { total: 0 } } },
  });
  assert.equal(deriveProblems.some((problem) => problem.includes(unusedArt)), true);

  // A whole-name mention counts: in a head function, and as a qualified key in another namespace's derive function.
  assert.deepEqual(auditSpecPerformance(spec, { head: { title: (state) => `Art ${state.art.count}` }, namespaces }), []);
  assert.deepEqual(
    auditSpecPerformance(spec, { namespaces: { ...namespaces, summary: { state: {}, derive: { line: (get) => `${get('art.count')}` } } } }).filter((problem) => problem.includes(unusedArt)),
    [],
  );

  // onTimeout belongs to createSsrHandler, not to a resource: a resource that sets it still fetches again on mount.
  const catalog = {
    catalog: { state: { items: [] }, resources: [{ watch: [], owns: ['items'], request: () => ({ url: '/api/items' }), onTimeout: 'serve' }] },
  };
  const revalidation = auditSpecPerformance(each('catalog.items', 'id', li(null, item('name'))), { namespaces: catalog, hasReady: true });
  assert.equal(revalidation.length, 1);
  assert.match(revalidation[0], /the browser fetches this resource again on mount/);
});

test('slow-action times the recompute of the derived values an action made stale, not the plugin\'s own audit', async () => {
  const busyWait = (milliseconds) => {
    const end = globalThis.performance.now() + milliseconds;
    while (globalThis.performance.now() < end);
  };
  const makeNamespaces = (deriveCost) => ({
    counter: {
      state: { count: 0 },
      derive: { label: (get) => (busyWait(deriveCost), `Count ${get('count')}`) },
      actions: { increment: { args: {}, run: (store) => store.set('count', store.get('count') + 1) } },
    },
  });
  const spec = div({ id: 'box' }, p({ id: 'label' }, state('counter.label')));

  const slowFindings = [];
  const slow = mountSpec({ namespaces: makeNamespaces(30), spec, plugins: [performance({ actionMs: 10, onReport: (finding) => slowFindings.push(finding) })] });
  slow.ui.dispatch('counter.increment', {});
  await slow.ui.settle();
  const slowAction = slowFindings.find((finding) => finding.kind === 'slow-action');
  assert.ok(slowAction, JSON.stringify(slowFindings));
  assert.match(slowAction.message, /action "counter\.increment" made its derived values take \d+ ms to recompute \(over 10 ms\)/);
  assert.ok(slowAction.details.duration >= 25, `the derived value costs 30 ms, the finding says ${slowAction.details.duration}`);

  const quickFindings = [];
  const quick = mountSpec({ namespaces: makeNamespaces(0), spec, plugins: [performance({ actionMs: 10, onReport: (finding) => quickFindings.push(finding) })] });
  quick.ui.dispatch('counter.increment', {});
  await quick.ui.settle();
  assert.equal(quickFindings.some((finding) => finding.kind === 'slow-action'), false);
});

test('agent-ui check --performance and budgets.stylesheetsGzipBytes report performance problems and unused module exports', async () => {
  const { build } = await import('../build/build.mjs');
  const { loadConfig } = await import('../build/config.mjs');
  const { checkProject } = await import('../cli/check.mjs');

  const project = mkdtempSync(join(tmpdir(), 'agent-ui-perf-'));
  try {
    mkdirSync(join(project, 'pages'), { recursive: true });
    mkdirSync(join(project, 'shared'), { recursive: true });
    mkdirSync(join(project, 'node_modules/@ehtb'), { recursive: true });
    symlinkSync(repository, join(project, 'node_modules/@ehtb/agent-ui'), 'dir');

    writeFileSync(join(project, 'build.config.mjs'), 'export default () => ({});');
    writeFileSync(
      join(project, 'shared/helpers.js'),
      [
        "export const usedTitle = 'Home';",
        "export const unusedComponent = () => 'never imported';",
      ].join('\n'),
    );
    writeFileSync(
      join(project, 'pages/page.js'),
      [
        "import { usedTitle } from '../shared/helpers.js';",
        'export const page = {',
        '  head: { title: usedTitle, tags: [{ tag: "script", props: { src: "/blocking.js" } }] },',
        '  namespaces: { extra: { state: { x: 1 } } },',
        '};',
      ].join('\n'),
    );
    writeFileSync(
      join(project, 'pages/view.js'),
      "import { img } from '@ehtb/agent-ui/spec';\nexport const view = img({ id: 'hero', src: '/hero.png', alt: 'Hero' });\n",
    );
    writeFileSync(join(project, 'pages/style.css'), '.hero { display: block; color: #123456; background: #abcdef; }\n');

    const config = await loadConfig({ root: project, mode: { dev: true } });

    // Standard check passes without performance mode.
    const normal = await checkProject({ config, root: project });
    assert.deepEqual(normal.problems, []);

    // Performance check reports unused module exports, render-blocking head scripts, unsized images, and unused namespaces.
    const perf = await checkProject({ config, root: project, performance: true });
    assert.deepEqual(perf.problems, [
      'shared/helpers.js: exports "unusedComponent", which no page imports. The bundler includes whole modules (no tree shaking), so every page that imports shared/helpers.js downloads "unusedComponent" as unused JavaScript. Remove the export, or move it to its own module',
      'pages/page.js: head.tags[0]: <script src="/blocking.js"> in <head> blocks rendering and delays FCP and LCP. Add defer: true or async: true to props, or move the script to head.bodyTags',
      'pages/page.js: img "hero": <img> has no width and height, so the layout shifts when it loads (CLS). Add width and height to props',
      'pages/page.js: namespace "extra": listed in namespaces, but nothing in the view, head or other namespaces reads or calls it. Remove "extra" from namespaces so the page does not download unused JavaScript',
    ]);

    // Build budget stylesheetsGzipBytes fails when a page's gzipped CSS exceeds the budget.
    const prodConfig = await loadConfig({ root: project, mode: { dev: false } });
    assert.throws(
      () => build({ ...prodConfig, projectRoot: project, outDir: 'dist', budgets: { stylesheetsGzipBytes: 10 } }),
      /budgets\.stylesheetsGzipBytes: page "index" loads \d+\.\d KB gzip of CSS at startup \(\/assets\/index\..*\.css\), over the budget of 0\.0 KB\. Move styles only one page uses into its page\.css/,
    );
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test('in headless Chrome, page.auditPerformance measures render-blocking requests, unused CSS and unsized images', async (context) => {
  const { launchBrowser, serveSite } = await import('./support/browser.mjs');
  const browser = await launchBrowser();
  if (!browser) return context.skip('no Chrome found (set CHROME_PATH)');
  const project = mkdtempSync(join(tmpdir(), 'agent-ui-chrome-perf-'));
  let site = null;
  try {
    mkdirSync(join(project, 'pages'), { recursive: true });
    mkdirSync(join(project, 'node_modules/@ehtb'), { recursive: true });
    symlinkSync(repository, join(project, 'node_modules/@ehtb/agent-ui'), 'dir');
    writeFileSync(join(project, 'build.config.mjs'), 'export default () => ({});');
    writeFileSync(join(project, 'pages/page.js'), "export const page = { head: { title: 'Home' } };");
    writeFileSync(
      join(project, 'pages/view.js'),
      "import { div, img } from '@ehtb/agent-ui/spec';\nexport const view = div({ id: 'home', class: 'used' }, img({ id: 'hero', src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', alt: 'Hero' }));\n",
    );
    const unusedCss = Array.from({ length: 10 }, (_, index) => `.unused-${index} { color: red; }`).join('\n');
    writeFileSync(join(project, 'pages/style.css'), `.used { display: block; }\n${unusedCss}\n`);

    site = await serveSite({ projectRoot: project, dev: true });
    const page = await browser.open(`${site.url}/`);
    const audit = await page.auditPerformance();
    assert.ok(audit.domElements > 0);
    assert.equal(audit.stylesheets.length, 1);
    assert.equal(audit.stylesheets[0].totalRules, 11);
    assert.equal(audit.stylesheets[0].unusedRules, 10);
    assert.ok(audit.problems.some((problem) => /10 of 11 rules \(91%\) match no element on this page/.test(problem)), JSON.stringify(audit.problems));
    assert.ok(audit.problems.some((problem) => /img "hero": has no width and height/.test(problem)), JSON.stringify(audit.problems));
  } finally {
    site?.close();
    await browser.close();
    rmSync(project, { recursive: true, force: true });
  }
});

