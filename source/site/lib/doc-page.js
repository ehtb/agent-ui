// The behavior of a documentation page. Every entry of docs-meta.js that has a Markdown source gets one generated page
// folder; this function supplies its head and namespaces without repeating them in each folder.
import { getDoc } from './docs-meta.js';
import { docsPage } from './docs-page.js';

export const docPage = (id) => {
  const doc = getDoc(id);
  return docsPage({ title: doc.title, description: doc.description });
};
