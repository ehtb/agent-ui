// The page "eventUnknown": /event/*path, the wildcard (catch-all) route. "*path" matches one or more remaining segments,
// so every URL below /event/ that no other event route claims lands here: /event/1/foo, /event/archived/old/2019.
// It is the least specific of the three event patterns, so it never takes a URL from the others:
//   /event/archived   routes/event/archived   (literal: most specific)
//   /event/:id        routes/event           (one segment)
//   /event/*path      this route             (everything deeper)
// The build config answers these pages with HTTP 404 (`status` of the prerender entry).
// page.js is page-shape and behavior only; the content is view.js next to it.
import { events, plugins } from '../../shared.js';

export const page = {
  namespaces: { events },
  plugins,
  head: { title: 'Page not found - Meetups' },
  status: () => 404, // everything under /event/ that is no page
};
