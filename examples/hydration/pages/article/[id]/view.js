// The content of "/article/:id" (the file next to page.js). Only the server and the build import it.
import { a, act, article, button, h2, p, state, when } from '@ehtb/agent-ui/spec';
import { layout } from '../../layout.js';

export const view = article(
  { id: 'article-view' },
  a({ id: 'back', href: '/' }, 'All articles'),
  when(state('articles.isNotFound'), p({ id: 'not-found', role: 'alert' }, 'Article not found.')),
  when(state('articles.current'), [
    h2({ id: 'article-title' }, state('articles.current.title')),
    p({ id: 'article-body' }, state('articles.current.body')),
    button({ id: 'like', on: { click: act('likes.add', { id: state('route.params.id') }) } }, 'Like (', state('articles.currentLikes'), ')'),
  ]),
);

export { layout };
