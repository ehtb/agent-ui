// An article, at "/article/:id". The id is route.params.id; a missing article answers 404. This file is behavior only;
// the content is view.js next to it.
import { articlesSettled, namespaces, plugins } from '../../shared.js';
import { withHead } from '@ehtb/agent-ui/head';

const findArticle = (state) => state.articles.list.find((article) => String(article.id) === state.route.params.id);

export const page = {
  head: { title: (state) => findArticle(state)?.title ?? 'Article', description: (state) => findArticle(state)?.summary ?? 'An article' },
  namespaces,
  plugins: [...plugins, withHead],
  ready: articlesSettled,
  // Used by `agent-ui serve`: a URL for an article that does not exist answers 404.
  status: (state) => (state.articles.status === 'ready' && !findArticle(state) ? 404 : 200),
};
