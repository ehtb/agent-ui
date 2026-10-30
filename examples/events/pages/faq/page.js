// The page "faq": static content, no state and no data.
// page.js is page-shape and behavior only; the content is view.js next to it.
import { events, plugins } from '../shared.js';

export const page = {
  namespaces: { events },
  plugins,
  head: { title: 'FAQ - Meetups', description: 'Answers to common questions about registering.' },
};
