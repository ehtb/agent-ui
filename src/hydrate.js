// Client side of server rendering. Browser entries merge the state the server embedded into their initial state:
//
//   create({ ..., initialState: readServerState(document) })    // {} when the page was not server-rendered
//
// and the app's create(env) spreads it over its defaults: state: { ...state, ...env.initialState }.

import { withBase } from './base-path.js';
import { APP_ELEMENT_ID as appElementId } from './spec-core.js';

// The element ids every side of server rendering agrees on: the mount point of the app, and the script that carries the server's state to
// the browser. The renderer (server/), the document builder and the build use these. The id of the mount point is written once, in
// src/spec-core.js, because the runtime needs it too (the slot of a shell keeps what the page's markup holds when an app takes over server
// markup), and a core module cannot import this one without making a cycle between the chunks.
export const APP_ELEMENT_ID = appElementId;
// The mount point of a shell (src/shell.js), for a page that has one. The page's own mount point, APP_ELEMENT_ID, is then inside it:
// the shell's spec holds it as an element, and the page app renders into that element.
export const SHELL_ELEMENT_ID = 'shell';
export const STATE_ELEMENT_ID = 'agent-ui-state';

export const readServerState = (doc = document, elementId = STATE_ELEMENT_ID) => {
  try {
    const element = doc.getElementById(elementId);
    return element ? JSON.parse(element.textContent) : {};
  } catch {
    return {};
  }
};

// The environment every browser entry passes to its app's create(env); the server counterpart is renderPage() in
// server/render-page.js, which passes the same fields. Apps pick what they need and ignore the rest.
// `dev` says whether this is a development build (the generated entry writes it down); app() refuses anything but true or false.
// `basePath` is the path the site is served below (src/base-path.js, written down by the build): the fetch adds it to a resource's
// root-absolute URL, so the app's own URLs ("/api/cart") stay the same wherever the site is mounted.
export const browserEnvironment = ({ dev, basePath = '' }) => ({
  root: document.getElementById(APP_ELEMENT_ID),
  win: window,
  fetchFunction: window.fetch && (basePath ? (url, init) => window.fetch(withBase(basePath, url), init) : window.fetch.bind(window)),
  basePath,
  initialState: readServerState(document),
  // A state script means this document was rendered by the server (or built as a static page): the state usually holds the
  // page's resource output, and a resource that opts in with `revalidate: 'never'` (src/resources.js) does not ask again.
  // A redaction hook may have removed a key, and a partial timeout render may be incomplete, so the opt-in stays explicit.
  serverRendered: document.getElementById?.(STATE_ELEMENT_ID) != null,
  dev,
  isServerRendering: false,
});
