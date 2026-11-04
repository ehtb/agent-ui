// A shell: the part of a document that stays while the page inside it changes (a header, a footer, a player). It is an app of its
// own, next to the page's app, so every rule of an app holds for it: state in namespaces, behavior through actions, effects in
// plugins. What the shell shows of the page it takes from the page's app, one way, with syncApps (src/sync-apps.js), and what a
// page shows of the shell it does not need: the shell never reaches into a page.
//
//   // shared/shell.js                     behavior: imported by the page.js of every page that uses the shell
//   export const shell = defineShell({
//     name: 'main',                        the name view.js repeats, so a page cannot pair one shell's behavior with another's content
//     namespaces: { frame: { state: { cartCount: 0 }, actions: { setCartCount: { args: { count: 'number' }, run: (store, { count }) => store.set('cartCount', count) } } } },
//     plugins: [withNavigation],           what the shell needs from outside its state; soft navigation (src/navigation.js) is one
//     reads: [{ watch: ['cart.count'], action: 'frame.setCartCount', args: { count: 'cart.count' } }],   what the shell takes from the page
//   });
//
//   // shared/shell-view.js                content: imported by the view.js of those pages (only the server and the build run it)
//   export const shell = { name: 'main', view: main(header(...), pageSlot(), footer(...)) };
//
// The page is mounted in the element `pageSlot()` writes (the HTML id "app"), once and not inside a `when` or an `each`. The shell
// has the reserved namespace `route` with `route.path`, the path of the page that is showing (kept by the navigation plugin), so a link
// can show it is the current one. `reads` are checked when a page starts with the shell: the page must have every key it watches.
import { app } from './ui.js';
import { isUnsafeUrl } from './spec-core.js';
import { APP_ELEMENT_ID, SHELL_ELEMENT_ID } from './hydrate.js';
import { syncApps } from './sync-apps.js';
import { RESERVED_NAMESPACE } from './namespaces.js';
import { withBase, withoutBase } from './base-path.js';
import { checkShell } from './shell-checks.js';

const route = {
  state: { path: '/' },
  actions: { arrive: { args: { path: 'string' }, run: (store, { path }) => store.set('path', path) } },
};

// What the shell adds to the route namespace of its pages (src/pages.js): where the page asks to go ({ href, count }: the count makes a second
// request for the same place a change) and `route.go`, the way a button or an action takes the visitor to another page. `connect` acts on it.
const pageRoute = {
  state: { destination: null },
  actions: { go: { args: { href: 'string' }, run: (store, { href }) => store.set('destination', { href, count: (store.get('destination')?.count ?? 0) + 1 }) } },
};

export const defineShell = (definition) => {
  checkShell(definition, route);
  const { name, namespaces = {}, plugins = [], reads = [], debug } = definition;
  return {
    kind: 'shell',
    name,
    // Every namespace the shell's app has (its own and `route`): what the content is validated against, in a production build too.
    namespaces: { [RESERVED_NAMESPACE]: route, ...namespaces },
    // The shell's app, mounted in `root` with the shell's content (`view`, a finished spec).
    createApp: (environment, view) =>
      app({
        namespaces: { [RESERVED_NAMESPACE]: route, ...namespaces },
        initialState: { [RESERVED_NAMESPACE]: { path: withoutBase(environment.basePath ?? '', environment.win?.location?.pathname ?? '/') ?? '/' } },
        spec: view,
        root: environment.root,
        dev: environment.dev,
        basePath: environment.basePath ?? '',
        debug: environment.debug ?? debug,
        plugins: plugins.map((plugin) => plugin({ ...environment, shellName: name })),
      }),
    route: pageRoute,
    // The first page of a document, in the browser (src/pages.js, startPage): the server's markup is the shell with the page inside it.
    // The page's element is taken out while the shell mounts, because a mount replaces the markup of its root, and put back in the
    // shell's slot, so what the visitor typed before this script ran is carried over by the page's own mount, as for a page without a
    // shell. Without server markup the shell's root is made where the page's element was. Returns what src/pages.js keeps as `current`.
    // If the shell cannot be made (its content is invalid, a plugin throws) the error goes to the console and the page's element is put
    // back where it was, so the visitor keeps the page the server rendered, without the shell's markup. If the shell is made and the page
    // then cannot start, the shell the server wrote stays (the page's element is in its slot); a shell this call made is stopped and removed with it, and the page's element goes back where it was.
    start: (entry, environment) => {
      const { win, root: slot } = environment;
      const { document } = win;
      const parent = slot.parentNode;
      const next = slot.nextSibling;
      let shellRoot = document.getElementById(SHELL_ELEMENT_ID);
      let madeShellRoot = false; // a shell root this call put in the document, which has to go again if the shell cannot start
      const serverMarkup = shellRoot ? [...shellRoot.childNodes] : null; // what the server wrote in the shell's element, put back if the shell cannot be made
      let shellApp = null;
      try {
        if (shellRoot) slot.remove();
        else {
          madeShellRoot = true;
          shellRoot = document.createElement('div');
          shellRoot.setAttribute('id', SHELL_ELEMENT_ID);
          slot.replaceWith(shellRoot);
        }
        shellApp = entry.createShell({ ...environment, root: shellRoot });
        document.getElementById(APP_ELEMENT_ID).replaceWith(slot);
        win.__shell = shellApp;
        shellApp.onDestroy(() => {
          if (win.__shell === shellApp) delete win.__shell;
        });
        return { entry, ui: entry.mount({ ...environment, root: slot, shell: shellApp }), shellApp, slot };
      } catch (error) {
        // The page's element goes back where it was; the markup of a shell that failed is not left beside it. A shell this call made
        // is stopped with its root (its listeners and `window.__shell` go), also when it was the page that could not start.
        if (madeShellRoot) {
          shellApp?.destroy();
          shellRoot.remove();
        }
        // Back to where it was only when it is nowhere, or is inside the root this call made and removed. In the server's shell it already sits in the slot.
        if (parent && (!slot.parentNode || (madeShellRoot && slot.parentNode !== parent))) parent.insertBefore(slot, next);
        if (!madeShellRoot && !shellApp && serverMarkup) shellRoot.replaceChildren(...serverMarkup);
        throw error;
      }
    },
    // Starts what the shell reads from a page's app and follows where route.go leads (the shell's `navigate`, from src/navigation.js, or
    // a normal page load without one); returns the function that stops all of it (the page's app calls it when it is destroyed). When
    // one read cannot be made, the ones already started are stopped before the error goes on.
    connect: (pageApp, shellApp, win, basePath = '') => {
      const stops = [];
      const stopAll = () => stops.forEach((stop) => stop());
      try {
        reads.forEach((read, index) => {
          try {
            stops.push(syncApps({ from: pageApp, to: shellApp, ...read }));
          } catch (error) {
            const missingKey = /watch key/.test(error.message) ? ". The page must have every key the shell reads: list its namespace in the page's namespaces" : '';
            throw new Error(`shell "${name}" reads[${index}]: ${error.message.replace(/^syncApps: /, '')}${missingKey}`);
          }
        });
        stops.push(
          pageApp.watch(['route.destination'], ({ 'route.destination': destination }) => {
            if (!destination || pageApp.replaying) return;
            if (isUnsafeUrl('href', destination.href)) return console.error(`route.go: ${destination.href} is an unsafe URL and is not loaded. Use an http(s) or relative URL`);
            if (shellApp.navigate) shellApp.navigate(destination.href);
            else win.location.assign(withBase(basePath, destination.href));
          }),
        );
      } catch (error) {
        stopAll();
        throw error;
      }
      return stopAll;
    },
  };
};
