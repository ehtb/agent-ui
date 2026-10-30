// A person, at "/person/:id". The id is route.params.id; the people are the same resource as on the list page.
//
// page.js is page-shape and behavior only; the content is view.js next to it.
import { peopleSettled, plugins, namespaces } from '../../shared.js';

const findPerson = (state) => state.people.list.find((person) => String(person.id) === state.route.params.id);

export const page = {
  head: { title: (state) => findPerson(state)?.name ?? 'Person', description: 'One person in the directory.' },
  namespaces,
  plugins,
  ready: peopleSettled,
  // An id that names nobody answers 404 once the people have loaded.
  status: (state) => (state.people.status === 'ready' && !findPerson(state) ? 404 : 200),
  // One static page per person in people.json.
};
