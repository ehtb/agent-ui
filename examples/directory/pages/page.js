// The list page, at "/": search, team filter, reload, and a link to every person.
//
// page.js is page-shape and behavior only; the content is view.js next to it.
import { peopleSettled, plugins, namespaces } from './shared.js';

export const page = {
  head: { title: 'People', description: 'Everyone in the directory.' },
  namespaces,
  plugins,
  ready: peopleSettled,
};
