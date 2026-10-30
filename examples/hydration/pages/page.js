// The list page, at "/": search and a link to every article. This file is behavior only; the content is view.js next to it.
import { articlesSettled, namespaces, plugins } from './shared.js';

export const page = {
  head: { title: 'Articles', description: 'Server-rendered articles that the browser takes over.' },
  namespaces,
  plugins,
  ready: articlesSettled,
};
