// Pages: one self-contained object per URL, run as one app. A page lives in the folder that mirrors its URL
// (pages/product/[id]/page.js serves "/product/:id"), and following a link to another page is a page load: there is no
// client-side router. What survives between pages lives on the server. A link marked `soft` makes that page load faster
// (src/navigation.js): the next page is fetched and replaces the current one inside a shell (src/shell.js) that stays, with the
// same state and the same URL a page load would give.
//
// A page is two files, so a browser downloads only its behavior and the finished spec, never the code that builds the
// spec:
//
//   // pages/product/[id]/page.js     the page: behavior only; this is the module the browser entry imports
//   export const page = { head, namespaces, plugins, ready, status, shell };
//
//   // pages/product/[id]/view.js     the content: only the server (and the build) imports it
//   export const view = section({ ... });
//   export const layout = wrapper;    // optional
//   export const pending = p(...);    // optional
//   export const shell = shellView;   // optional: the content of the shell page.js names, { name, view } (src/shell.js)
//
// Required: head in page.js, view in view.js. Optional: layout, pending and shell in view.js; namespaces, plugins, ready, status
// and shell in page.js.
//
//   head        { title: string | (state) => string, description?: string | (state) => string }
//   view        the spec of the page's content (a node, usually an element)
//   pending     spec shown instead of `view` while `ready` is false (a skeleton, "Loading..."). Needs `ready`. It replaces
//               the whole content of the page, so give its elements ids of their own
//   layout      (content) => spec: the shell around the content, imported from a shared module (or none). The layout and
//               the view are built on the server and the build ships the result as data
//   namespaces  { name: { state, derive, actions, resources, shapes } }: everything the page keeps in state, exactly as in
//               app(). Shared namespaces are imported and listed here like any other. "route" is reserved: the framework
//               provides route.params, the parameters of the URL (/product/3 -> route.params.id === '3'), and route.hydrated,
//               false in the markup the server renders and true once the browser app has taken over
//   ready       (state) => boolean: true when the page has what it needs (its data has loaded). The one definition of
//               "loaded": the server waits for it before it renders (so the HTML is the finished page), `agent-ui check`
//               waits for it, and `pending` is shown until it is true. Without it the page counts as ready at once
//   status      (state) => HTTP status of the page (404 for an unknown id). Used when a server renders the page
//   plugins     [(environment) => plugin]: what the page needs from outside its state, imported by the page itself so that a page
//               downloads only the code it uses. `withResources` (@ehtb/agent-ui/resources) loads the namespaces' `resources`; a window
//               listener is `({ win }) => windowEvents(win, { ... })`. Declaring resources without it is reported when the page starts
//   shell       the shell this page lives in (defineShell, src/shell.js): an app of its own that stays when a soft link replaces the
//               page. page.js holds its behavior, view.js its content; their names must match. The page's own markup goes where the
//               shell's spec has pageSlot(). Without one the page fills the document
//
// `state` in head, ready and status is the snapshot of all state (not derived values), as in ui.state():
// { route: { params }, cart: { ... }, ... }.
//
// definePage(page, { path, view, layout, pending, shell }) returns what the build, the server and the tests use; a browser entry passes
// the finished `spec` instead of `view`, `layout` and `pending` (startPage). `path` is the page's URL pattern; the
// build takes it from the folder, tests write it out.
import { app } from './ui.js';
import { browserEnvironment } from './hydrate.js';
import { codedError } from './errors.js';
import { RESERVED_NAMESPACE, declaredStateKeys, mergeInitialState } from './namespaces.js';
import { withoutBase } from './base-path.js';
import { compileUrlPattern } from './url-pattern.js';
import { checkPage, checkViewExports } from './pages-checks.js';
import { exposeHot } from './hot.js';
import { createDocumentDescriber, createStatusReader } from './pages-server.js';

// A visitor may type a trailing slash: "/product/3/" is the page "/product/:id".
const pathWithoutTrailingSlash = (pathname) => (pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname);

// The parts of a view.js module that definePage takes (`import * as viewModule from './view.js'`), checked first: a misspelt
// export is reported with the file and the nearest valid name instead of being ignored. The generated modules call this.
export const contentOf = (viewModule, file) => {
  checkViewExports(viewModule, file);
  return { view: viewModule.view, layout: viewModule.layout, pending: viewModule.pending, shell: viewModule.shell };
};

export const definePage = (page, { path, view, layout, pending, spec, shell: shellContent }) => {
  checkPage(page, { path, view, layout, pending, spec, shell: shellContent });
  const pattern = compileUrlPattern(path);
  const { namespaces: pageNamespaces = {}, plugins: pagePlugins = [] } = page;

  const stateKeys = Object.entries(pageNamespaces).flatMap(([namespace, definition]) => declaredStateKeys(definition).map((key) => [namespace, key]));

  // `ready(state)` must answer true or false; the answer is undefined for a page that declares no `ready`.
  const readiness = (currentState) => {
    if (!page.ready) return undefined;
    const answer = page.ready(currentState);
    if (typeof answer !== 'boolean') throw codedError('AUI0501', { path, answer });
    return answer;
  };
  const statusOf = createStatusReader({ page, path });

  // The framework's own namespace: the URL's parameters, set once when the page starts, and `hydrated`, false in the markup
  // the server renders and true once the browser app has taken over (startPage). `route.ready` says whether `ready` is true
  // (always true for a page that declares no `ready`); it is what the spec binds to for the `pending` view, and a page can show it.
  const routeNamespace = {
    // A page with a shell also has `route.destination` and `route.go`, the way a button takes the visitor to another page (src/shell.js).
    state: { params: {}, hydrated: false, ...page.shell?.route.state },
    actions: { hydrate: { args: {}, run: (store) => store.set('hydrated', true) }, ...page.shell?.route.actions },
    derive: {
      ready: (get) => {
        const snapshot = { route: { params: get('params') } };
        for (const [namespace, key] of stateKeys) (snapshot[namespace] ??= {})[key] = get(`${namespace}.${key}`);
        return readiness(snapshot) ?? true;
      },
    },
  };
  const namespaces = { [RESERVED_NAMESPACE]: routeNamespace, ...pageNamespaces };

  // The finished spec: the server builds it from the view, the pending view and the layout; the browser receives it already
  // built (the build rendered it in Node and shipped it as data), so none of them reaches a browser bundle. While `ready`
  // is false the page's `pending` view takes the place of its content; the layout wraps either.
  const buildSpec = () => {
    const content = pending ? { when: { state: 'route.ready' }, children: view, otherwise: pending } : view;
    return layout ? layout(content) : content;
  };
  const pageSpec = spec !== undefined ? spec : buildSpec();

  // Everything the page says about its document for the current state (src/head-document.js): title, description, the attributes
  // of <html> and <body>, and the elements of <head> and the end of <body>. Only a server asks for it (server/document.mjs); in a
  // browser bundle this is a stub.
  const describePage = createDocumentDescriber({ page, path });

  // The title is the page's in every document it runs in (a soft navigation does not read the title of the document it fetched). A
  // literal title is written once; a title that is a function of the state follows the state. The rest of the head (attributes, meta
  // and link elements) follows it for a page that lists the plugin `withHead` (src/head.js), so a page without that downloads none of it; a soft
  // navigation copies the whole head of the document it fetched (src/head-reader.js).
  const keepTitleCurrent = (win) => (api) => {
    const writeTitle = (title) => {
      if (win?.document && win.document.title !== title) win.document.title = title;
    };
    if (typeof page.head.title !== 'function') return writeTitle(page.head.title);
    api.watch(api.keys(), () => writeTitle(page.head.title(api.state())));
  };

  // The shell's content, finished: { name, view }. The server builds it from view.js, the browser receives it as data.
  const createShell = page.shell ? (environment) => page.shell.createApp(environment, shellContent.view) : undefined;

  // The same function the browser entry and the server renderer call. `environment.shell` is the app of the page's shell, when it
  // has one: what the shell reads from this page (page.shell.reads) and where route.go leads start here and end when this app is destroyed.
  let specChecked = false;
  const create = (environment) => {
    const { root, win, dev, initialState = {}, shell: shellApp, basePath = '' } = environment;
    const pathname = win?.location?.pathname === undefined ? path : withoutBase(basePath, win.location.pathname) ?? path;
    const params = pattern.match(pathWithoutTrailingSlash(pathname)) ?? {};
    const ui = app({
      namespaces,
      initialState: mergeInitialState(initialState, { [RESERVED_NAMESPACE]: { params } }),
      spec: pageSpec,
      root,
      dev,
      basePath,
      debug: environment.debug ?? page.debug, // the server says false; a browser says nothing, and the page decides
      plugins: [...pagePlugins.map((plugin) => plugin({ ...environment, page: { path, head: page.head } })), keepTitleCurrent(win)],
      // The spec and namespaces of a page never change, so production checks them once. A caller's initial state is checked every time.
      specChecked: specChecked && !dev && Object.keys(initialState).length === 0,
    });
    specChecked = true;
    if (shellApp && page.shell) {
      try {
        ui.onDestroy(page.shell.connect(ui, shellApp, win, basePath));
      } catch (error) {
        ui.destroy(); // a page that cannot be read by its shell must not stay mounted
        throw error;
      }
    }
    // What the current page says about itself; the server renderer asks these (server/render-page.js, ssr-handler.mjs).
    // Both are undefined when the page declares no `ready` / `status`.
    ui.isReady = () => readiness(ui.state());
    ui.getStatus = () => statusOf(ui.state());
    return ui;
  };

  return {
    path,
    namespaces,
    spec: pageSpec,
    create,
    // Creates the page's app and tells it that the browser has taken over (route.hydrate); what a browser entry and a soft navigation call.
    mount: (environment) => {
      const ui = create(environment);
      ui.dispatch('route.hydrate');
      return ui;
    },
    // The shell's app (undefined for a page without one) and the shell's finished content, which a production build writes once
    // for all the pages that share it.
    createShell,
    shellName: page.shell?.name,
    shellContent,
    shellNamespaces: page.shell?.namespaces,
    describePage,
  };
};

// ---- in the browser: the document's one page, and the pages a soft navigation brings ----------------------------------------------
// Every browser entry registers its definition under the URL of its own file (`url`: import.meta.url of the generated entry), so a
// soft navigation that has fetched the next page's HTML and imported the file named in it can find the definition (findEntry): an
// entry that was imported before is not evaluated again.
const entries = new Map();
// What runs in this document: { entry, ui (the page app), shellApp, slot (the element the page lives in) }; src/navigation.js keeps it current.
let current = null;

export const findEntry = (url) => entries.get(url);
export const currentPage = () => current;

// What every generated browser entry calls (build/pages.mjs): register the page and, when it is the first in this document, start it
// from the state the server embedded. A production entry passes the finished `spec` (spec.js) and `shell` (the shell's content
// as data); a development entry passes `view`/`layout`/`pending`/`shell` and builds the spec here. Returns the definition.
export const startPage = (page, { url, dev, basePath = '', ...options }) => {
  const entry = definePage(page, options);
  exposeHot({ entries, getCurrent: () => current }); // `agent-ui dev` swaps the running page for an edited one (src/hot.js); a production build has a stub there
  if (url) entries.set(url, entry);
  if (current) return entry; // a soft navigation imported this entry; it starts the page itself (src/navigation.js)
  const environment = browserEnvironment({ dev, basePath });
  current = { ...(page.shell ? page.shell.start(entry, environment) : { entry, ui: entry.mount(environment), shellApp: null, slot: environment.root }), dev, basePath };
  return entry;
};
