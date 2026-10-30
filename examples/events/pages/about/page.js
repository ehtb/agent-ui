// The page "about": static content, no state and no data. It is generated as plain HTML at build time.
// page.js is page-shape and behavior only; the content is view.js next to it.
import { events, plugins } from '../shared.js';

export const page = {
  namespaces: { events },
  plugins,
  head: { title: 'About - Meetups', description: 'Who we are and how the meetups work.' },
};
