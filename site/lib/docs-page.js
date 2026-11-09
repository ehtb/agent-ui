// The page behavior of a documentation page. Content lives in view.js; this file only says what the page keeps in
// state, which plugin it needs and what it tells the document. It is imported by the browser entry, so it uses no
// Node built-ins and no spec builders.
import { withResources } from '@ehtb/agent-ui/resources';
import { search } from './search.js';

const headTags = [
  { tag: 'link', props: { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' } },
  { tag: 'meta', props: { name: 'theme-color', content: '#0b1020' } },
  { tag: 'meta', props: { name: 'color-scheme', content: 'light' } },
];

export const docsPage = ({ title, description, titleForState = null }) => ({
  head: {
    title: titleForState ?? `${title} · agent-ui`,
    description,
    html: { lang: 'en' },
    body: { class: 'page-docs' },
    tags: headTags,
  },
  namespaces: { search },
  plugins: [withResources],
});
