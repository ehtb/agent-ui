// The plugin that makes a soft link faster to follow: the document of the link is fetched when the visitor hovers it, so it is often
// already there at the click. A shell lists it after the navigation plugin it extends:
//
//   plugins: [withNavigation, withPrefetch]       withPrefetch is the export of @ehtb/agent-ui/prefetch
//   plugins: [withNavigation, withPrefetch({ pointerdown: true, viewport: true, maxAge: 30000 })]    the same, with the options below
//
// Two more triggers, each a choice because each costs a server render for a link the visitor may not follow, and each off by default:
//   * `pointerdown: true` also fetches at the press, for any pointer (a touch has no hover: the press is the earliest sign of a tap, a head
//     start of the length of the press). A touch that turns into a scroll has fetched a page it did not want;
//   * `viewport: true` fetches a soft link when it scrolls into view (an IntersectionObserver), once. The visitor may not follow it; `maxAge`
//     (milliseconds, 1000 to 600000, default 5000) says how long a fetched document is used, which for this trigger is what makes it worth
//     having: a link that was visible for ten seconds needs a longer one. The document is watched for links that arrive (a MutationObserver), which is a cost of its own on a page that adds many elements at once. A window without IntersectionObserver ignores `viewport`.
//
// Without it a soft link fetches its document at the click, as it always did. What it does, and what it leaves alone:
//   * a hover (a mouse pointer over a soft link, as the navigation reads one: `api.softLinkTarget`) fetches the document of the link,
//     and the navigation takes it at the click instead of fetching it again. A touch pointer fetches nothing (a tap is followed by
//     the click at once), nor does a link to the page showing, a link of another origin or another target, or one the browser keeps;
//   * the document is the same one the click would fetch, so the page that starts is the page a load would show. A document older than a
//     few seconds is not used (the server may have changed since the hover), and the latest eight are kept, so a page of links does
//     not hold a document for every link on it;
//   * a redirect of the server to another page of this site is followed, as the click would follow it, and the click shows the page it
//     ends at; a hover that fails (a status that is not 200, a redirect to another site, a document that is not HTML, a network error, a
//     cancelled fetch) is dropped without a word, and the click fetches again, so the visitor sees what a click without a hover would have seen;
//   * once the document is there, the page's entry file is hinted to the browser (`<link rel="modulepreload">`), so the script that
//     the click has to import next is already loading or loaded.
// Every hover on a soft link makes the server render a page: a site whose pages are expensive to render, or that lists hundreds of
// soft links, may prefer to leave this plugin out.
import { fetchPlainDocument, readDocument } from './navigation.js';
import { fail } from './messages.js';
import { isPlainObject, markPagePlugin } from './spec-core.js';
import { didYouMean } from './messages.js';

const MAX_PREFETCHES = 8;
const MAX_AGE = 5000; // ms, the default `maxAge`
const OPTION_KEYS = ['pointerdown', 'viewport', 'maxAge'];

// `withPrefetch({ ... })` is checked where it is written: an unknown key, a value of the wrong kind.
const checkPrefetchOptions = (options) => {
  if (options === undefined) return;
  if (!isPlainObject(options)) fail('withPrefetch(...)', `the argument must be an object of options, got ${options === null ? 'null' : typeof options}`, `Write withPrefetch({ ${OPTION_KEYS.join(': true, ')}: ... }), or list withPrefetch without calling it`);
  for (const key of Object.keys(options)) {
    if (!OPTION_KEYS.includes(key)) fail('withPrefetch(...)', `unknown option "${key}"`, `${didYouMean(key, OPTION_KEYS)}Allowed options: ${OPTION_KEYS.join(', ')}`);
  }
  for (const key of ['pointerdown', 'viewport']) {
    if (key in options && typeof options[key] !== 'boolean') fail('withPrefetch(...)', `${key} is ${JSON.stringify(options[key])}, not true or false`, `Write ${key}: true to fetch on ${key === 'viewport' ? 'a link scrolling into view' : 'the press'}, or leave it out`);
  }
  if ('maxAge' in options && (!Number.isInteger(options.maxAge) || options.maxAge < 1000 || options.maxAge > 600000)) {
    fail('withPrefetch(...)', `maxAge is ${JSON.stringify(options.maxAge)}, not a whole number of milliseconds from 1000 to 600000`, 'Write maxAge: 30000 to use a fetched document for thirty seconds (the default is 5000)');
  }
};

// `now` is injectable, for tests that must age a document.
export const prefetch = ({ win, fetchFunction, basePath = '', now = () => Date.now(), pointerdown = false, viewport = false, maxAge = MAX_AGE }) => (api) => {
  if (!win.history) return; // a server renders the shell too, and has no visitor to hover: there is nothing to do
  if (typeof api.extendNavigation !== 'function') {
    fail('withPrefetch', 'the shell has no navigation to extend', 'List withNavigation before withPrefetch in the plugins of defineShell: plugins: [withNavigation, withPrefetch]');
  }
  const document = win.document;
  const prefetches = new Map(); // key (the site's path and search) -> { at, text: promise of { text, key } (key: where a redirect led), or null }
  const hinted = new Set(); // the entry files already hinted

  const fetchText = async (key) => {
    try {
      const answer = await fetchPlainDocument(fetchFunction, key, { origin: win.location.origin, basePath });
      return answer.text === undefined ? null : { text: answer.text, key: answer.key };
    } catch {
      return null; // a failed or cancelled fetch is fetched again at the click, which shows the real reason
    }
  };
  const hintEntry = (text) => {
    const { entryUrl } = readDocument(text);
    if (!entryUrl) return;
    const href = new URL(entryUrl, win.location.href).href;
    if (hinted.has(href)) return;
    hinted.add(href);
    const link = document.createElement('link');
    link.setAttribute('rel', 'modulepreload');
    link.setAttribute('href', href);
    document.head.append(link);
  };

  // Fetches the document of the soft link at `link` (api.softLinkTarget), unless the page shows it or a fresh one is there already.
  const prefetchLink = (link) => {
    if (!link || link.here) return;
    const known = prefetches.get(link.key);
    if (known && now() - known.at <= maxAge) return;
    prefetches.delete(link.key); // a stale one is replaced, and moves to the end of the order
    if (prefetches.size >= MAX_PREFETCHES) prefetches.delete(prefetches.keys().next().value);
    const entry = { at: now(), text: null };
    entry.text = fetchText(link.key).then((fetched) => {
      if (fetched === null) {
        if (prefetches.get(link.key) === entry) prefetches.delete(link.key);
      } else {
        hintEntry(fetched.text);
      }
      return fetched;
    });
    prefetches.set(link.key, entry);
  };
  const onPointerOver = (event) => {
    if (event.pointerType && event.pointerType !== 'mouse') return; // a tap is followed by the click at once; there is no hover to catch
    prefetchLink(api.softLinkTarget(event.target));
  };
  const onPointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return; // the primary button, a touch or a pen contact
    prefetchLink(api.softLinkTarget(event.target));
  };

  api.extendNavigation({
    // The navigation asks before it fetches: a fresh document of the hover is taken (once), anything else is fetched by the click.
    document: (key) => {
      const entry = prefetches.get(key);
      prefetches.delete(key);
      return entry && now() - entry.at <= maxAge ? entry.text : null;
    },
  });
  document.addEventListener('pointerover', onPointerOver);
  if (pointerdown) document.addEventListener('pointerdown', onPointerDown);

  // A link that scrolls into view is fetched once. Links come and go with the pages, so the document is watched for new ones.
  let intersections = null;
  let mutations = null;
  if (viewport && typeof win.IntersectionObserver === 'function') {
    intersections = new win.IntersectionObserver((records) => {
      for (const record of records) {
        if (!record.isIntersecting) continue;
        intersections.unobserve(record.target);
        prefetchLink(api.softLinkTarget(record.target));
      }
    });
    const watchLinksIn = (node) => {
      if (node?.nodeType !== 1) return;
      if (node.hasAttribute?.('data-soft')) intersections.observe(node);
      for (const link of node.querySelectorAll?.('[data-soft]') ?? []) intersections.observe(link);
    };
    watchLinksIn(document.body ?? document.documentElement);
    if (typeof win.MutationObserver === 'function') {
      mutations = new win.MutationObserver((records) => {
        for (const record of records) record.addedNodes.forEach(watchLinksIn);
      });
      mutations.observe(document.body ?? document.documentElement, { childList: true, subtree: true });
    }
  }
  api.onDestroy(() => {
    document.removeEventListener?.('pointerover', onPointerOver);
    if (pointerdown) document.removeEventListener?.('pointerdown', onPointerDown);
    intersections?.disconnect();
    mutations?.disconnect();
    prefetches.clear();
  });
};

// The plugin as a shell lists it: `plugins: [withNavigation, withPrefetch]`, or `withPrefetch({ pointerdown: true, viewport: true, maxAge: 30000 })`.
const isShellEnvironment = (value) => isPlainObject(value) && 'win' in value;
export const withPrefetch = markPagePlugin(function withPrefetch(optionsOrEnvironment) {
  if (isShellEnvironment(optionsOrEnvironment)) return prefetch({ win: optionsOrEnvironment.win, fetchFunction: optionsOrEnvironment.fetchFunction, basePath: optionsOrEnvironment.basePath });
  checkPrefetchOptions(optionsOrEnvironment);
  return markPagePlugin(function withPrefetch({ win, fetchFunction, basePath }) {
    return prefetch({ win, fetchFunction, basePath, ...optionsOrEnvironment });
  });
});
