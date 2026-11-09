// The content of a documentation page, assembled from the Markdown the generator turned into spec data. Only the build
// and the server import this module, so the Markdown renderer and the builders never reach a browser bundle.
import { documents } from '../generated/docs.js';
import { getDoc, neighbours, sourceUrl } from './docs-meta.js';
import { docsLayout } from './site-layout.js';

export const docView = (id) => {
  const doc = getDoc(id);
  const document = documents[doc.id];
  if (!document) throw new Error(`doc-view: no generated document for "${id}"`);
  const { previous, next } = neighbours(doc);
  return docsLayout({
    content: document.nodes,
    title: doc.title,
    description: doc.description,
    activePath: doc.path,
    headings: document.headings,
    previous,
    next,
    source: sourceUrl(doc),
  });
};
