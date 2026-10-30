// Soft navigation: following a link is still a page load, only a faster one. A link written `a({ href: '/about', soft: true }, ...)` (or
// `act('route.go', { href })` from a button) is not answered by the browser but by this plugin, which asks the server for the same
// document the browser would have got and puts its page where the current one is, inside the shell that stays:
//
//   export const shell = defineShell({ name: 'main', plugins: [withNavigation], ... });     // src/shell.js
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
//      That element is a region named by the new title, and an element whose HTML id is agent-ui-announcer (a live region the
//      site provides) receives the title too, so a swap announces itself as a page load does.
// Anything that goes wrong, or is not the same as a page load (an answer that is not 200 or not HTML, a redirect, a page of another shell,
// a failure while importing or starting), ends in a normal page load of the same URL, with the reason in the console: a soft link
// never leaves the visitor on a half-changed page. Back and forward do the same swap for the address they return to.
//
// A modifier key, a middle click, `target`, `download`, another origin and a link to a place on this page are left to the browser.
// What it is not: a router (there is no route list: the server's documents are the source) and not a second way to hold state (a swap
// starts the page afresh, as a load does; what must outlive it lives in the shell or on the server).
//
// The plugin adds `navigate(href)` to the shell's app, which is what route.go calls. `navigation(options)` is the plugin with its parts
// injectable (`importModule`, `loadStylesheet`, `fetchFunction`), for tests and for hosts that load modules their own way.
import { browserEnvironment } from './hydrate.js';
import { readModuleScript, readStateScript, readStylesheets } from './document-markup-reader.js';
import { isUnsafeUrl } from './spec-core.js';
import { currentPage, findEntry } from './pages.js';
import { applyHead } from './head.js';
import { readHead } from './head-reader.js';

// What a soft navigation needs from a document's text (written by server/document.mjs and build/write-site.mjs, with the writers of
// src/document-markup.js and read by src/document-markup-reader.js): the state the page starts from ({} when the document was not
// rendered with one), the file of the page's entry, and the page's stylesheets.
export const readDocument = (text) => ({ state: readStateScript(text), entryUrl: readModuleScript(text), stylesheets: readStylesheets(text) });

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
  running.ui = entry.mount({ ...browserEnvironment({ dev: running.dev }), root: running.slot, initialState, serverRendered, shell: running.shellApp });
};

// Adds a stylesheet link and waits for it, so the new page never shows unstyled. A stylesheet that fails to load does not stop the swap.
const loadStylesheetInBrowser = (document, href) =>
  new Promise((resolve) => {
    const link = document.createElement('link');
    link.setAttribute('rel', 'stylesheet');
    link.setAttribute('href', href);
    link.addEventListener('load', resolve);
    link.addEventListener('error', resolve);
    document.head.append(link);
  });

export const navigation = ({ win, fetchFunction, importModule = (url) => import(url), loadStylesheet = (href) => loadStylesheetInBrowser(win.document, href), shellName }) => (api) => {
  if (!win.history) return; // a server renders the shell too, and has no history to push and no visitor to click: there is nothing to do
  const document = win.document;
  const linkElements = () => [...document.head.childNodes].filter((node) => node.localName === 'link' && node.getAttribute('rel') === 'stylesheet');
  let shownStylesheets = new Set(linkElements().map((element) => element.getAttribute('href'))); // what the page that is showing brought
  let shownUrl = `${win.location.pathname}${win.location.search}`;
  let latest = 0; // a newer navigation makes an older one that is still waiting stop

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
      url = new URL(href, win.location.href);
    } catch {
      return console.error(`soft navigation to ${href}: not a valid URL. Use an http(s) or relative URL`);
    }
    const target = `${url.pathname}${url.search}`;
    if (url.origin !== win.location.origin) return hardLoad(href, 'it is another origin'); // only this site's pages can be shown in place
    try {
      const response = await fetchFunction(target, { headers: { accept: 'text/html' } });
      if (number !== latest) return;
      if (!response.ok || response.redirected) return hardLoad(href, `the answer is ${response.redirected ? 'a redirect' : response.status}, not a plain page`);
      if (!/text\/html/.test(response.headers.get('content-type') ?? '')) return hardLoad(href, 'the answer is not HTML');
      const text = await response.text();
      const { state, entryUrl, stylesheets } = readDocument(text);
      if (number !== latest) return;
      if (!entryUrl) return hardLoad(href, 'the document names no page script');
      const entryPath = new URL(entryUrl, win.location.href).href;
      const added = stylesheets.filter((sheet) => !shownStylesheets.has(sheet));
      // Counted as shown before they load: if a newer navigation takes over while they load, the next one still removes them when its page does not use them.
      for (const sheet of added) shownStylesheets.add(sheet);
      await Promise.all(added.map(loadStylesheet));
      await importModule(entryPath);
      if (number !== latest) return;
      const entry = findEntry(entryPath);
      if (!entry) return hardLoad(href, 'the page script registered no page');
      if (entry.shellName !== shellName) return hardLoad(href, `that page has ${entry.shellName ? `the shell "${entry.shellName}"` : 'no shell'}, and this one has "${shellName}"`);
      if (push) win.history.pushState(null, '', href);
      applyHead(document, readHead(text)); // the head of the next page, as a load would give it; a page that follows the state (withHead) refines it
      showPage(entry, state);
      for (const element of linkElements()) if (!stylesheets.includes(element.getAttribute('href')) && shownStylesheets.has(element.getAttribute('href'))) element.remove();
      shownStylesheets = new Set(stylesheets);
      shownUrl = target;
      api.dispatch('route.arrive', { path: url.pathname });
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
      if (push) {
        const anchor = url.hash.length > 1 ? document.getElementById?.(decodeURIComponent(url.hash.slice(1))) : null;
        if (anchor) anchor.scrollIntoView?.();
        else win.scrollTo?.(0, 0);
      }
    } catch (error) {
      if (number !== latest) return; // an older or abandoned navigation that fails has nothing left to say
      hardLoad(href, error.message);
    }
  };
  api.navigate = navigate;

  const onClick = (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target?.closest?.('[data-soft]');
    if (!link || link.localName !== 'a') return;
    if ((link.getAttribute('target') ?? '_self') !== '_self' || link.hasAttribute('download')) return;
    if (!link.hasAttribute('href')) return;
    const url = new URL(link.getAttribute('href'), win.location.href);
    if (url.origin !== win.location.origin) return;
    if (`${url.pathname}${url.search}` === shownUrl && url.hash) return; // a place on this page: the browser scrolls
    event.preventDefault();
    navigate(`${url.pathname}${url.search}${url.hash}`);
  };
  const onPopState = () => {
    const target = `${win.location.pathname}${win.location.search}`;
    if (target !== shownUrl) navigate(target, { push: false });
  };
  document.addEventListener('click', onClick);
  win.addEventListener('popstate', onPopState);
  api.onDestroy(() => {
    latest++; // a navigation still waiting for its answer stops there
    document.removeEventListener?.('click', onClick);
    win.removeEventListener?.('popstate', onPopState);
  });
};

// The plugin as a shell lists it (`plugins: [withNavigation]`).
export const withNavigation = ({ win, fetchFunction, shellName }) => navigation({ win, fetchFunction, shellName });
