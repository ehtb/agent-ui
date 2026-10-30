// The page "/": the list of everything written so far, each linking to its own page. Behavior only; the content is in
// view.js next to it (only the server and the build import that, never a browser).
import { entriesSettled, guestbook, plugins } from './shared.js';

export const page = {
  namespaces: { guestbook },
  plugins,
  head: { title: 'Guestbook', description: 'Read what visitors wrote, and add your own message.' },
  // Until the entries have loaded the browser shows `pending`; the server waits and renders the finished page.
  ready: entriesSettled,
};
