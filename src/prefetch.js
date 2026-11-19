// The plugin that makes a soft link faster to follow: the document of the link is fetched when the visitor hovers it, so it is often
// already there at the click. A shell lists it after the navigation plugin it extends:
//
//   plugins: [withNavigation, withPrefetch]       withPrefetch is the export of @ehtb/agent-ui/prefetch
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
import { markPagePlugin } from './spec-core.js';

const MAX_PREFETCHES = 8;
const MAX_AGE = 5000; // ms

// `now` is injectable, for tests that must age a document.
export const prefetch = ({ win, fetchFunction, basePath = '', now = () => Date.now() }) => (api) => {
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

  const onPointerOver = (event) => {
    if (event.pointerType && event.pointerType !== 'mouse') return; // a tap is followed by the click at once; there is no hover to catch
    const link = api.softLinkTarget(event.target);
    if (!link || link.here) return;
    const known = prefetches.get(link.key);
    if (known && now() - known.at <= MAX_AGE) return;
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

  api.extendNavigation({
    // The navigation asks before it fetches: a fresh document of the hover is taken (once), anything else is fetched by the click.
    document: (key) => {
      const entry = prefetches.get(key);
      prefetches.delete(key);
      return entry && now() - entry.at <= MAX_AGE ? entry.text : null;
    },
  });
  document.addEventListener('pointerover', onPointerOver);
  api.onDestroy(() => {
    document.removeEventListener?.('pointerover', onPointerOver);
    prefetches.clear();
  });
};

// The plugin as a shell lists it (`plugins: [withNavigation, withPrefetch]`).
export const withPrefetch = markPagePlugin(function withPrefetch({ win, fetchFunction, basePath }) {
  return prefetch({ win, fetchFunction, basePath });
});
