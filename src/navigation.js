// Soft navigation: following a link is still a page load, only a faster one. A link written `a({ href: '/about', soft: true }, ...)` (or
// `act('route.go', { href })` from a button) is not answered by the browser but by this plugin, which asks the server for the same
// document the browser would have got and puts its page where the current one is, inside the shell that stays:
//
//   export const shell = defineShell({ name: 'main', plugins: [withNavigation], ... });     // src/shell.js
//
// Two plugins make it faster than a load, and the shell lists each one it wants after this one (`plugins: [withNavigation, withPrefetch,
// withViewTransition]`): `withPrefetch` (src/prefetch.js) fetches a link's document when the visitor hovers it, and `withViewTransition`
// (src/view-transition.js) runs the visible swap as one View Transition. Neither is part of this file; they use its two hooks,
// `api.extendNavigation({ document, swap })` and `api.softLinkTarget(element)`, below.
//
// What happens, in this order, and what is the same as a page load:
//   1. The document of the link is fetched (the same prerendered file or server render a browser would get). The state the server
//      embedded in it is the state the next page starts from, so the page that starts is the page a load would show.
//   2. The page's stylesheets that are not loaded yet are added, and the ones that only the old page used are removed.
//   3. The entry file named in the document is imported (once; later visits find it loaded). The head the document carries (src/head-reader.js:
//      description, the attributes of <html> and <body> as that document has them, meta, link, script and style elements) replaces the old page's;
//      unlike a load, a script that is the same as the one in the document does not run again, a script that changed is put where the old one was and an
//      inline one runs before the new page's markup exists, while a script with a src (in <head> or at the end of <body>) runs when it has
//      loaded, which may be after the new markup exists, and is not waited for. The page it registered replaces the
//      running one (showPage): the old page's app is destroyed (src/ui.js, destroy), the new one starts in the same element with the same shell.
//   4. The address changes (history.pushState) before the new page starts, so route.params and head are read from the new URL; the shell
//      is told the path (route.arrive); the new page's element gets the focus and the window scrolls to the top (or to the #hash).
//      Back and forward scroll to where the visitor was on that entry, as a browser does for a page load: the position of the entry
//      being left is kept by its key (history.state), and written into the entry itself when the document is left (pagehide), so a
//      reload, and a return from another site (a new document, or this one restored from the back/forward cache: pageshow) restores
//      it too. The browser's own restoration is off for the shell's entries (scrollRestoration "manual"): it would scroll before the
//      new page exists. The plugin adds its two keys to an entry's state with replaceState, keeping what the site stored there; the
//      entry a soft navigation pushes starts with only its key, as the entry of a page load starts with no state.
//      That element is a region named by the new title, and an element whose HTML id is agent-ui-announcer (a live region the
//      site provides) receives the title too, so a swap announces itself as a page load does.
// A redirect of the server that leads to another page of this site is followed, as a page load follows it: the page the redirect ends at
// is the one that is shown, and the address is that page's (a link to /old that the server sends to /new shows /new, in the shell that
// stays). Anything that goes wrong, or is not the same as a page load (an answer that is not 200 or not HTML, a redirect to another site,
// a page of another shell, a failure while importing or starting), ends in a normal page load, with the reason in the console: a soft link
// never leaves the visitor on a half-changed page. A page that cannot be shown in place after a redirect is loaded at the place the redirect
// ends at. Back and forward do the same swap for the address they return to.
//
// A modifier key, a middle click, `target`, `download`, another origin and a link to a place on this page are left to the browser.
// What it is not: a router (there is no route list: the server's documents are the source) and not a second way to hold state (a swap
// starts the page afresh, as a load does; what must outlive it lives in the shell or on the server).
//
// Below a base path (src/base-path.js) the plugin works in the site's own paths: `navigate` takes one ("/about"), the address and a
// page load get the base, `route.arrive` and the fetch (which adds the base itself) get the path without it, and a link outside the
// base is the browser's.
//
// The plugin adds `navigate(href)` to the shell's app, which is what route.go calls, and the two hooks for the plugins that go with it
// (`extendNavigation`, `softLinkTarget`). `navigation(options)` is the plugin with its parts
// injectable (`importModule`, `loadStylesheet`, `fetchFunction`), for tests and for hosts that load modules their own way.
import { browserEnvironment } from './hydrate.js';
import { readModuleScript, readStateScript, readStylesheets } from './document-markup-reader.js';
import { isUnsafeUrl, markPagePlugin } from './spec-core.js';
import { currentPage, findEntry } from './pages.js';
import { applyHead } from './head.js';
import { readHead } from './head-reader.js';
import { withBase, withoutBase } from './base-path.js';
import { fail } from './messages.js';

// What a soft navigation needs from a document's text (written by server/document.mjs and build/write-site.mjs, with the writers of
// src/document-markup.js and read by src/document-markup-reader.js): the state the page starts from ({} when the document was not
// rendered with one), the file of the page's entry, and the page's stylesheets.
export const readDocument = (text) => ({ state: readStateScript(text), entryUrl: readModuleScript(text), stylesheets: readStylesheets(text) });

// Fetches the document of a link the way a page load would get it. Answers { text, key } for a plain page and { reason } for anything a
// soft navigation cannot show in place (the reason is what the console says when it loads the page normally); a fetch that throws
// throws. `key` is where the document really came from, the site's path and search: the link's own, or the place the server redirected to.
// A redirect is followed when the place it leads to is on this site (`origin` and `basePath` say which one that is) and answers a plain
// page itself, as a page load would end there; a redirect to another site, or one that cannot be told (no `origin`, as in a host that
// does not say), is the reason "the answer is a redirect". The one definition of "a plain page", used by the navigation and by withPrefetch.
export const fetchPlainDocument = async (fetchFunction, key, { origin = null, basePath = '' } = {}) => {
  const response = await fetchFunction(key, { headers: { accept: 'text/html' } });
  let answeredKey = key;
  if (response.redirected) {
    answeredKey = origin && response.url ? sitePathOfUrl(response.url, origin, basePath) : null;
    if (answeredKey === null) return { reason: `the answer is a redirect${origin && response.url ? ' to a place outside this site' : ''}, not a plain page` };
  }
  if (!response.ok) return { reason: `the answer is ${response.status}, not a plain page${answeredKey === key ? '' : ` (after a redirect to ${answeredKey})`}` };
  if (!/text\/html/.test(response.headers.get('content-type') ?? '')) return { reason: 'the answer is not HTML' };
  const text = await response.text();
  if (typeof text !== 'string') return { reason: 'the answer has no text' };
  return { text, key: answeredKey };
};

// The site's path and search of a URL the server answered from, or null when it is another origin or outside the base path.
const sitePathOfUrl = (href, origin, basePath) => {
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  const sitePath = withoutBase(basePath, url.pathname);
  return sitePath === null ? null : `${sitePath}${url.search}`;
};

// What a plugin may add to the navigation (api.extendNavigation): where a document comes from, and how the swap is run.
const EXTENSION_KEYS = ['document', 'swap'];

// Replaces the page that runs with the one `entry` defines, from the state its HTML carried. `currentPage()` (src/pages.js) is the record
// of what runs in this document; it is kept current here.
const showPage = (entry, initialState) => {
  const running = currentPage();
  running.ui.destroy();
  running.entry = entry;
  // The state comes from the document the server answered: this is server-rendered state, even when the element that carried
  // it is not the one of the document that is still current here. A document without a state script carries no server output,
  // so its resources must load as they do on a first mount.
  const serverRendered = Object.keys(initialState).length > 0;
  running.ui = entry.mount({ ...browserEnvironment({ dev: running.dev, basePath: running.basePath }), root: running.slot, initialState, serverRendered, shell: running.shellApp });
};

// Adds a stylesheet link and waits for it, so the new page never shows unstyled. A stylesheet that fails to load does not stop the swap.
// The keys this plugin keeps in history.state, beside what the site may keep there.
const ENTRY_KEY = 'agentUiEntry';
const SCROLL_KEY = 'agentUiScroll';
const historyState = (win) => (win.history.state && typeof win.history.state === 'object' ? win.history.state : {});
let entryCounter = 0;
const MAX_POSITIONS = 100; // scroll positions kept in memory, the most recent entries
// A key unique within the tab's history, also across reloads of the document (the counter starts again on a reload).
const newEntryKey = () => `${Date.now().toString(36)}-${(entryCounter++).toString(36)}`;

const loadStylesheetInBrowser = (document, href) =>
  new Promise((resolve) => {
    const link = document.createElement('link');
    link.setAttribute('rel', 'stylesheet');
    link.setAttribute('href', href);
    link.addEventListener('load', resolve);
    link.addEventListener('error', resolve);
    document.head.append(link);
  });

export const navigation = ({ win, fetchFunction, importModule = (url) => import(url), loadStylesheet = (href) => loadStylesheetInBrowser(win.document, href), shellName, basePath = '' }) => (api) => {
  if (!win.history) return; // a server renders the shell too, and has no history to push and no visitor to click: there is nothing to do
  const document = win.document;
  const linkElements = () => [...document.head.childNodes].filter((node) => node.localName === 'link' && node.getAttribute('rel') === 'stylesheet');
  let shownStylesheets = new Set(linkElements().map((element) => element.getAttribute('href'))); // what the page that is showing brought
  let shownUrl = `${win.location.pathname}${win.location.search}`;
  let latest = 0; // a newer navigation makes an older one that is still waiting stop
  const documentSources = []; // from withPrefetch and the like: (key) => text | null, asked before the document is fetched
  const swapRunners = []; // from withViewTransition and the like: (update) => promise, which must call update
  api.extendNavigation = (extension) => {
    for (const key of Object.keys(extension ?? {})) {
      if (!EXTENSION_KEYS.includes(key)) fail('extendNavigation', `unknown key "${key}"`, `Allowed keys: ${EXTENSION_KEYS.join(', ')}`);
    }
    for (const key of EXTENSION_KEYS) {
      if (extension[key] !== undefined && typeof extension[key] !== 'function') fail('extendNavigation', `${key} is ${typeof extension[key]}, not a function`, `Give ${key} a function, or leave it out`);
    }
    if (extension.document) documentSources.push(extension.document);
    if (extension.swap) swapRunners.push(extension.swap);
  };
  // Scroll positions by history entry. The entry that shows gets a key now if it has none (a first load).
  const positions = new Map();
  if ('scrollRestoration' in win.history) win.history.scrollRestoration = 'manual';
  if (!historyState(win)[ENTRY_KEY]) win.history.replaceState?.({ ...historyState(win), [ENTRY_KEY]: newEntryKey() }, '');
  let shownKey = historyState(win)[ENTRY_KEY] ?? null;
  const scrollPosition = () => ({ x: win.scrollX ?? 0, y: win.scrollY ?? 0 });
  // The map keeps the latest entries only: a shell that lives for hours does not hold a position for every page it ever showed.
  const rememberPosition = () => {
    if (shownKey === null) return;
    positions.delete(shownKey);
    positions.set(shownKey, scrollPosition());
    if (positions.size > MAX_POSITIONS) positions.delete(positions.keys().next().value);
  };
  // A document that is left (a reload, a link to another site) loses the map: the position goes into its own entry.
  const onPageHide = () => win.history.replaceState?.({ ...historyState(win), [SCROLL_KEY]: scrollPosition() }, '');
  // A reload or a return to this document from another one: the browser restores nothing for a "manual" entry, so this does, when the
  // plugin starts (a new document) and when the back/forward cache brings this document back (pageshow with persisted: the plugin does
  // not start again).
  const restoreSaved = () => {
    const saved = historyState(win)[SCROLL_KEY];
    if (saved && (saved.x || saved.y)) win.scrollTo?.(saved.x, saved.y);
  };
  const onPageShow = (event) => {
    if (event?.persisted) restoreSaved();
  };
  restoreSaved();

  const hardLoad = (href, reason) => {
    if (isUnsafeUrl('href', href)) return console.error(`soft navigation to ${href}: an unsafe URL is not loaded. Use an http(s) or relative URL`);
    console.warn(`soft navigation to ${href}: ${reason}. Loading it as a normal page`);
    win.location.assign(href);
  };

  const navigate = async (href, { push = true } = {}) => {
    if (api.destroyed) return; // a destroyed shell shows nothing and loads nothing
    const number = ++latest;
    let url;
    try {
      url = new URL(withBase(basePath, href), win.location.href); // the address on the wire
    } catch {
      return console.error(`soft navigation to ${href}: not a valid URL. Use an http(s) or relative URL`);
    }
    let target = `${url.pathname}${url.search}`;
    let wireHref = `${target}${url.hash}`;
    if (url.origin !== win.location.origin) return hardLoad(href, 'it is another origin'); // only this site's pages can be shown in place
    let sitePath = withoutBase(basePath, url.pathname);
    if (sitePath === null) return hardLoad(wireHref, `it is outside the base path ${basePath}`);
    try {
      const key = `${sitePath}${url.search}`;
      let text = null;
      let answeredKey = key; // where the document came from: a redirect moves it
      for (const source of documentSources) {
        const found = (await source(key)) ?? null; // a document brought ahead of the click (its text, or { text, key }); null: fetch it now
        if (number !== latest) return;
        if (typeof found === 'string') text = found;
        else if (found && typeof found.text === 'string') [text, answeredKey] = [found.text, found.key ?? key];
        if (typeof text === 'string') break;
      }
      if (typeof text !== 'string') {
        const answer = await fetchPlainDocument(fetchFunction, key, { origin: win.location.origin, basePath });
        if (number !== latest) return;
        if (answer.reason) return hardLoad(wireHref, answer.reason);
        [text, answeredKey] = [answer.text, answer.key];
      }
      if (answeredKey !== key) {
        // The server redirected, and the document is the one a page load would end at. The address is that place's (the link's #hash stays, as
        // a browser keeps it), and a page that cannot be shown in place is loaded at that address, not by way of the redirect again.
        const placed = new URL(withBase(basePath, answeredKey), win.location.href);
        target = `${placed.pathname}${placed.search}`;
        wireHref = `${target}${url.hash}`;
        sitePath = withoutBase(basePath, placed.pathname);
      }
      const { state, entryUrl, stylesheets } = readDocument(text);
      if (number !== latest) return;
      if (!entryUrl) return hardLoad(wireHref, 'the document names no page script');
      const entryPath = new URL(entryUrl, win.location.href).href;
      const added = stylesheets.filter((sheet) => !shownStylesheets.has(sheet));
      // Counted as shown before they load: if a newer navigation takes over while they load, the next one still removes them when its page does not use them.
      for (const sheet of added) shownStylesheets.add(sheet);
      await Promise.all(added.map(loadStylesheet));
      await importModule(entryPath);
      if (number !== latest) return;
      const entry = findEntry(entryPath);
      if (!entry) return hardLoad(wireHref, 'the page script registered no page');
      if (entry.shellName !== shellName) return hardLoad(wireHref, `that page has ${entry.shellName ? `the shell "${entry.shellName}"` : 'no shell'}, and this one has "${shellName}"`);
      if (push) {
        rememberPosition();
        win.history.replaceState?.({ ...historyState(win), [SCROLL_KEY]: scrollPosition() }, '');
        win.history.pushState({ [ENTRY_KEY]: newEntryKey() }, '', wireHref);
      }
      // An entry made before this plugin ran (or by the site) gets its key now, so leaving it remembers its position.
      if (!historyState(win)[ENTRY_KEY]) win.history.replaceState?.({ ...historyState(win), [ENTRY_KEY]: newEntryKey() }, '');
      const arrivedKey = historyState(win)[ENTRY_KEY] ?? null;
      // The visible part of the swap, as one update. A plugin may run it its own way (withViewTransition animates it); it must call
      // `update`, and an update that throws reaches the catch below and the page load that follows, because that is what a failed
      // swap means. The update may run later than this point (an animation first captures the old page), so it makes sure it is
      // still the newest navigation's.
      const update = () => {
        if (number !== latest) return; // a newer navigation took over while this one waited to be shown: its page is the one to swap in
        applyHead(document, readHead(text)); // the head of the next page, as a load would give it; a page that follows the state (withHead) refines it
        showPage(entry, state);
        for (const element of linkElements()) if (!stylesheets.includes(element.getAttribute('href')) && shownStylesheets.has(element.getAttribute('href'))) element.remove();
        shownStylesheets = new Set(stylesheets);
        shownUrl = target;
        api.dispatch('route.arrive', { path: sitePath });
        const { slot } = currentPage();
        // A page load announces itself with a new document title. A swap has to say it too: an element whose HTML id is
        // `agent-ui-announcer` (a live region, usually visually hidden by the site's CSS) gets the new title; without one,
        // the focused page slot carries the title as its accessible name, which a screen reader reads when it takes the focus.
        const title = document.title || 'Page changed';
        const announcer = document.getElementById?.('agent-ui-announcer');
        if (announcer) {
          // A real element and the server DOM both have replaceChildren; assigning textContent is the browser shorthand.
          if (typeof announcer.replaceChildren === 'function') announcer.replaceChildren(title);
          else announcer.textContent = title;
        }
        slot.setAttribute('tabindex', '-1');
        slot.setAttribute('role', 'region');
        slot.setAttribute('aria-label', title);
        slot.focus?.({ preventScroll: true });
        shownKey = arrivedKey;
        // Back or forward to an entry this tab has seen returns to where the visitor was; a new entry starts at the #hash or the top.
        const returnTo = push ? null : (positions.get(arrivedKey) ?? historyState(win)[SCROLL_KEY] ?? null);
        const anchor = url.hash.length > 1 ? document.getElementById?.(decodeURIComponent(url.hash.slice(1))) : null;
        if (returnTo) win.scrollTo?.(returnTo.x, returnTo.y);
        else if (anchor) anchor.scrollIntoView?.();
        else win.scrollTo?.(0, 0);
      };
      let run = update;
      for (const swap of swapRunners) {
        const inner = run;
        run = () => swap(inner);
      }
      await run();
    } catch (error) {
      if (number !== latest) return; // an older or abandoned navigation that fails has nothing left to say
      hardLoad(wireHref, error.message);
    }
  };
  api.navigate = navigate;

  // What a soft link at `element` leads to, or null when the browser keeps it (not a link marked soft, another target, `download`, no
  // href, another origin, outside the base path). `key` is the site's path and search (what the fetch takes), `here` is true when that
  // is the page showing. The one reading of a soft link: the click uses it, and so does withPrefetch on a hover.
  api.softLinkTarget = (element) => {
    const link = element?.closest?.('[data-soft]');
    if (!link || link.localName !== 'a') return null;
    if ((link.getAttribute('target') ?? '_self') !== '_self' || link.hasAttribute('download')) return null;
    if (!link.hasAttribute('href')) return null;
    const url = new URL(link.getAttribute('href'), win.location.href);
    if (url.origin !== win.location.origin) return null;
    const sitePath = withoutBase(basePath, url.pathname); // the link was written with the base (src/ui.js); outside it, the browser loads it
    if (sitePath === null) return null;
    return { sitePath, search: url.search, hash: url.hash, key: `${sitePath}${url.search}`, here: `${url.pathname}${url.search}` === shownUrl };
  };

  const onClick = (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = api.softLinkTarget(event.target);
    if (!link) return;
    if (link.here && link.hash) return; // a place on this page: the browser scrolls
    event.preventDefault();
    navigate(`${link.sitePath}${link.search}${link.hash}`);
  };
  const onPopState = () => {
    const target = `${win.location.pathname}${win.location.search}`;
    if (target === shownUrl) return;
    // The window still shows the page being left (restoration is manual), so its position is read now, before the swap.
    rememberPosition();
    shownKey = null; // until the swap ends, a second back or forward has no entry of its own to remember
    const sitePath = withoutBase(basePath, win.location.pathname);
    if (sitePath === null) return win.location.reload?.(); // an entry outside the base belongs to another site: load it
    navigate(`${sitePath}${win.location.search}`, { push: false });
  };
  document.addEventListener('click', onClick);
  win.addEventListener('popstate', onPopState);
  win.addEventListener('pagehide', onPageHide);
  win.addEventListener('pageshow', onPageShow);
  api.onDestroy(() => {
    latest++; // a navigation still waiting for its answer stops there
    document.removeEventListener?.('click', onClick);
    win.removeEventListener?.('popstate', onPopState);
    win.removeEventListener?.('pagehide', onPageHide);
    win.removeEventListener?.('pageshow', onPageShow);
  });
};

// The plugin as a shell lists it (`plugins: [withNavigation]`).
export const withNavigation = markPagePlugin(function withNavigation({ win, fetchFunction, shellName, basePath }) {
  return navigation({ win, fetchFunction, shellName, basePath });
});
