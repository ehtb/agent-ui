// The content of "/" (the file next to page.js). Only the server and the build import it: the browser downloads the page
// behavior and the finished spec, never the builders that assemble the view.
import { a, act, each, equals, event, greaterThan, input, item, join, length, li, p, section, state, ul, when } from '@ehtb/agent-ui/spec';
import { layout } from './layout.js';

export const view = section(
  { id: 'list-view' },
  input({ id: 'search', type: 'search', 'aria-label': 'Search articles', placeholder: 'Search', value: state('search.query'), on: { input: act('search.set', { value: event('target.value') }) } }),
  when(
    greaterThan(length(state('articles.visible')), 0),
    ul({ id: 'articles' }, each('articles.visible', 'id', li(null, a({ href: join('/article/', item('id')) }, item('title')), p(null, item('summary'))))),
    when(equals(state('articles.status'), 'ready'), p({ id: 'no-results' }, 'No articles match.')),
  ),
);

export { layout };
