// The content of the page at "/person/:id" (the file next to page.js). build/ and the server import it; a browser
// bundle does not, because the build renders this view in Node and ships the finished spec as data instead.
import { a, equals, h2, not, p, section, state, when } from '@ehtb/agent-ui/spec';
import { layout, tagList } from '../../layout.js';
// The shell both pages share; the build and the server read it as `view.layout`.
export { layout };

export const view =
  section(
    { id: 'detail-view' },
    a({ id: 'back', href: '/' }, 'Back to the list'),
    when(
      not(equals(state('people.selected'), null)),
      [h2({ id: 'person-name' }, state('people.selected.name')), p({ id: 'person-email' }, state('people.selected.email')), tagList(state('people.selected.tags'))],
      p({ id: 'not-found' }, 'No such person.'),
    ),
  );
