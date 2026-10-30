// Server-side rendering: run an app's own `create(env)` against a server DOM and return HTML plus the state to hand
// to the client. Runs in Node (and any runtime with ES modules); never import it in browser entries.
//
//   const { html, stateScript, ui } = await renderPage(create, { url: '/items/3', fetchFunction, dev: false, request })
//
// `create` is the same function the browser entry calls: it receives { root, win, fetchFunction, dev, initialState, serverRendered: false }
// and must return the object from app(). The page is rendered by the identical runtime, so output matches the client.
// When `request` is given, `fetchFunction` receives it as its third argument, so the host can forward the visitor's cookie
// or authorization header to its data source. `timeoutMs` returns the markup that exists with `timedOut: true`;
// `stateForBrowser` chooses the state script; and a signal (or `request.signal`) rejects the render when the client goes away.
//
// Hydration is by replacement: when the client app mounts it renders the same spec into the root, replacing the
// server markup in one step, and restores focus and typed input to the element with the same data-id. What the server markup buys is
// first paint, crawlers and no-JS content; what it deliberately does not do is adopt server nodes, because that would
// need a second render path kept in lockstep with the first. State travels in a JSON script (see src/hydrate.js).

import { createServerDocument, serialize } from '../src/server-dom.js';
import { fail } from '../src/messages.js';
import { describeValue, isPlainObject } from '../src/spec-core.js';
import { APP_ELEMENT_ID, SHELL_ELEMENT_ID } from '../src/hydrate.js';
import { stateScriptHtml } from '../src/document-markup.js';

// A window with just what the plugins read: location, event registration and removal, timers. A plugin that needs more (storage,
// a real document, a library that draws) returns early when the environment says `isServerRendering` (docs/API.md, section 6).
export const createServerWindow = (url = '/') => {
  // "//about" is a path of this site, not the host "about": a path is appended to the origin instead of resolved against it.
  const parsed = new URL(url.startsWith('/') ? `http://localhost${url}` : url, 'http://localhost');
  const noop = () => {};
  return {
    location: { pathname: parsed.pathname, search: parsed.search, hash: parsed.hash, href: parsed.href },
    document: { addEventListener: noop, removeEventListener: noop },
    addEventListener: noop,
    removeEventListener: noop,
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (timer) => clearTimeout(timer),
  };
};

export { stateScriptHtml };

// What a render uses when no fetchFunction is given. The framework has no source of data of its own: the project says where
// data comes from while rendering (`fetchFunction` in build.config.mjs, or the option of renderPage and createSsrHandler).
// Absolute http(s) URLs go to the real fetch; a relative URL such as "/people.json" has no server to ask, and fails with the fix.
export const defaultFetchFunction = async (url, init) =>
  /^https?:\/\//.test(String(url))
    ? globalThis.fetch(url, init)
    : fail('render', `the page requested "${url}" but no fetchFunction is configured`, 'Add `fetchFunction: (url, init) => Promise<response>` to build.config.mjs (docs/BUILD.md, "Data while rendering"), or pass `fetchFunction` to renderPage or createSsrHandler');

// Renders one page.
//   url          path (and query) the visitor asked for; the page reads route.params from it
//   fetchFunction used by resources; default: defaultFetchFunction (absolute URLs only)
//   A page that declares `ready` (src/pages.js) is waited for until it says it is ready; a page without it is rendered as it is.
//   createShell  optional (environment) => the app of the page's shell (src/shell.js), which a page definition offers as `createShell`.
//                The shell is rendered around the page: its markup holds the page's element, and the result says `shell: true`
//   initialState state keys to start from (for example the result of a posted form); the app spreads it over its defaults
//   request      the request context (server/request.mjs) passed to `fetchFunction` as its third argument
//   timeoutMs    give up waiting for `ready` after this long and render what exists (default 2000)
// The server window holds only what `createServerWindow` lists, so a plugin that reaches for anything else fails with a bare
// "x is not a function". Such a TypeError or ReferenceError keeps its message and gets the fix added; other errors pass unchanged.
export const explainServerFailure = (error) =>
  error instanceof TypeError || error instanceof ReferenceError
    ? new Error(`renderPage: ${error.message}. A plugin may have used something the server window does not have (it has location, addEventListener, removeEventListener, setTimeout and clearTimeout). Return early from the plugin when the environment says \`isServerRendering\` (\`agent-ui explain browser-only-plugin\`)`, { cause: error })
    : error;

// Ends the page's app and its shell's: a cleanup of the page that throws must not leave the shell running, so the shell is ended last, always.
export const destroyApps = (ui, shellApp) => {
  try {
    ui?.destroy();
  } finally {
    shellApp?.destroy();
  }
};

const renderAbortedError = () => Object.assign(new Error('render aborted: the request was closed before the page was finished'), { name: 'AbortError', aborted: true });

// Resolves false when `isDone` became true, true when `timeoutMs` passed first. `isDone` is checked at once and then after
// every change of a state or derived key instead of on a polling timer: a resource that answers at once makes the page ready
// in the same microtask, without waiting for the next poll (a 5 ms poll is the difference between ~1 ms and ~6 ms per
// rendered page). It rejects when `isDone` throws, also from a later change, so a page whose `ready` starts throwing can
// never take the server process down. The watch is stopped when the wait ends, whether it finished, failed or timed out.
const waitForReady = (ui, isDone, timeoutMs, signal = null) =>
  new Promise((resolve, reject) => {
    let finished = false;
    let stopWatching = null;
    const deadline = setTimeout(() => finish(true), timeoutMs);
    const onAbort = () => finish(false, renderAbortedError());
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    function finish(timedOut, error = null) {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      signal?.removeEventListener('abort', onAbort);
      if (stopWatching) {
        const stop = stopWatching;
        stopWatching = null;
        stop();
      }
      if (error) reject(error);
      else resolve(timedOut);
    }
    if (signal?.aborted) {
      onAbort();
      return;
    }
    function check() {
      if (finished) return;
      try {
        if (isDone()) finish(false);
      } catch (error) {
        finish(false, error);
      }
    }
    let watchStop;
    try {
      watchStop = ui.watch(ui.keys(), check);
    } catch (error) {
      // A key the watch cannot read (a derived value that throws) is the render's failure, not something to wait out.
      finish(false, error);
      return;
    }
    // watch() checked once already; when that answer ended the wait, its disposer is stopped here, after watch() returned.
    if (finished) watchStop();
    else stopWatching = watchStop;
  });

// The state a browser is allowed to receive. A hook may remove a key (a token its own server code read) or replace a value,
// but it cannot add a key: the browser app would not have it declared. The markup is already rendered from the full state, so
// a secret that the page shows is still in the HTML; the hook controls the state script, not what the page rendered.
// Waits for the runtime to finish its pending updates, but gives up when the request is gone. Destroying the app in the abort
// listener ends its resources; the race makes sure a plugin that never settles its own effect cannot hold the request forever.
const settleWithAbort = async (ui, signal) => {
  if (!signal) return ui.settle();
  if (signal.aborted) throw renderAbortedError();
  let onAbort = null;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(renderAbortedError());
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    await Promise.race([ui.settle(), aborted]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
};

// Every fetch of the render sees the request's signal: a resource already passes its own signal for "a newer request replaced
// this one", and the two are combined so either cancels the network work. The visitor's disconnect covers the rest.
const fetchWithRequestSignal = (fetchFunction, signal) =>
  signal === null || signal === undefined
    ? fetchFunction
    : (url, init) => {
        if (signal.aborted) return Promise.reject(renderAbortedError());
        const combined = init?.signal ? AbortSignal.any([signal, init.signal]) : signal;
        // `requestFetch` is the one place that forwards the request as the third argument; do not add another here.
        return fetchFunction(url, { ...(init ?? {}), signal: combined });
      };

const publicStateFor = async (state, stateForBrowser, request) => {
  if (stateForBrowser === null || stateForBrowser === undefined) return state;
  const projected = await stateForBrowser(state, request);
  if (!isPlainObject(projected)) {
    fail('renderPage stateForBrowser', `returned ${describeValue(projected)}, not a state object { namespace: { key: value } }`, 'Return the state the browser may receive: keep the namespaces and keys the page declares, and leave a key out to keep its declared default');
  }
  for (const [namespace, values] of Object.entries(projected)) {
    if (!Object.hasOwn(state, namespace)) {
      fail('renderPage stateForBrowser', `returned the namespace "${namespace}", which the page did not declare`, 'Return only namespaces and keys of the rendered state (a hook may remove a namespace, not add one); a namespace the browser needs must be declared in the page');
    }
    if (!isPlainObject(values)) fail('renderPage stateForBrowser', `returned "${namespace}" as ${describeValue(values)}, not an object of state keys`, `Return { ${namespace}: { ... } } with the keys of that namespace, or leave the namespace out`);
    for (const key of Object.keys(values)) {
      if (!Object.hasOwn(state[namespace], key)) {
        fail('renderPage stateForBrowser', `returned "${namespace}.${key}", which is not a state key the page declared`, 'Return only namespaces and keys of the rendered state (a hook may remove a key, not add one); a key the browser needs must be declared in the page');
      }
    }
  }
  return projected;
};

export const renderPage = async (create, { url = '/', fetchFunction = null, timeoutMs = 2000, dev, initialState = {}, createShell = null, request = null, stateForBrowser = null, signal = null } = {}) => {
  if (typeof dev !== 'boolean') fail('renderPage', `dev is ${JSON.stringify(dev) ?? 'missing'}`, 'Pass dev: true to render with the development checks (agent-ui check) and dev: false to serve');
  // A request context carries the signal of its connection, so a host that passes `request` does not pass the same signal twice.
  const abortSignal = signal ?? request?.signal ?? null;
  if (abortSignal?.aborted) throw renderAbortedError();
  const document = createServerDocument();
  const root = document.createElement('div');
  root.setAttribute('id', createShell ? SHELL_ELEMENT_ID : APP_ELEMENT_ID);
  // debug: false whatever the page says: the debug console is for a browser's console, and a server has none to write to.
  const resourceFetch = fetchFunction ?? defaultFetchFunction;
  const requestFetch = request === null || request === undefined ? resourceFetch : (resourceUrl, init) => resourceFetch(resourceUrl, init, request);
  const environment = { win: createServerWindow(url), fetchFunction: fetchWithRequestSignal(requestFetch, abortSignal), dev, debug: false, isServerRendering: true, serverRendered: false };
  let shellApp = null;
  let ui = null;
  const onAbort = () => {
    // With the app gone, no resource can dispatch its late failure into a page nobody will receive. Cleanup that throws must
    // not replace the abort that the caller is about to see.
    try {
      destroyApps(ui, shellApp);
    } catch {
      // the abort error is what the caller needs
    }
  };
  abortSignal?.addEventListener('abort', onAbort, { once: true });
  try {
    // With a shell, the shell is rendered into the root and the page into the element the shell holds for it. Inside the
    // try, so a createShell that throws after it started something is cleaned up by the same path as a failing page.
    shellApp = createShell ? createShell({ ...environment, root }) : null;
    const pageRoot = shellApp ? root.findById(APP_ELEMENT_ID) : root;
    if (!pageRoot) fail('renderPage', `the shell's markup has no element with the id "${APP_ELEMENT_ID}" for the page`, 'Put pageSlot() (from @ehtb/agent-ui/spec) in the shell view');
    ui = create({ ...environment, root: pageRoot, initialState, shell: shellApp });
    if (abortSignal?.aborted) throw renderAbortedError();
    await settleWithAbort(ui, abortSignal);
    let timedOut = false;
    if (ui.isReady?.() !== undefined) {
      timedOut = await waitForReady(ui, () => ui.isReady(), timeoutMs, abortSignal);
      await settleWithAbort(ui, abortSignal);
    }
    if (abortSignal?.aborted) throw renderAbortedError();
    const state = ui.state();
    const stateForDocument = await publicStateFor(state, stateForBrowser, request);
    // The hook may await the network: a visitor who left during it must not get a result from an app that is already destroyed.
    if (abortSignal?.aborted) throw renderAbortedError();
    return { html: serialize(root), state, stateScript: stateScriptHtml(stateForDocument), ui, shell: Boolean(shellApp), shellApp, timedOut };
  } catch (error) {
    // Nothing is handed back, so nobody else can end the apps that were started.
    // The render's own failure is what the caller needs; a cleanup that also throws must not replace it.
    try {
      destroyApps(ui, shellApp);
    } catch {
      // reported by the error below
    }
    throw explainServerFailure(error);
  } finally {
    abortSignal?.removeEventListener('abort', onAbort);
  }
};
