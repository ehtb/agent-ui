// The documentation map: one entry per page, in reading order. This module is imported by page.js files, so it stays
// free of Node built-ins and of the spec builders.
export const repository = 'https://github.com/ehtb/agent-ui';

export const docs = [
  {
    id: 'start',
    path: '/docs',
    title: 'Start here',
    shortTitle: 'Start here',
    description: 'Install agent-ui, write the first page and run the checks.',
    nav: 'Getting started',
  },
  {
    id: 'overview',
    path: '/docs/overview',
    file: 'README.md',
    source: 'README.md',
    title: 'Project overview',
    shortTitle: 'Overview',
    description: 'What agent-ui is, why it exists and what it chooses not to build.',
    nav: 'Getting started',
  },
  {
    id: 'agent-rules',
    path: '/docs/agent-rules',
    file: 'docs/AGENT-RULES.md',
    source: 'docs/AGENT-RULES.md',
    title: 'Agent rules',
    shortTitle: 'Agent rules',
    description: 'The short operating manual for an agent that writes an agent-ui app.',
    nav: 'Getting started',
  },
  {
    id: 'guide',
    path: '/docs/guide',
    file: 'docs/GUIDE.md',
    source: 'docs/GUIDE.md',
    title: 'Guide',
    shortTitle: 'Guide',
    description: 'How pages, URLs, APIs, forms and soft navigation fit together.',
    nav: 'Getting started',
  },
  {
    id: 'api',
    path: '/docs/api',
    file: 'docs/API.md',
    source: 'docs/API.md',
    title: 'API reference',
    shortTitle: 'API',
    description: 'The spec grammar, namespaces, actions, plugins, pages and testing helpers.',
    nav: 'Reference',
  },
  {
    id: 'build',
    path: '/docs/build',
    file: 'docs/BUILD.md',
    source: 'docs/BUILD.md',
    title: 'Build & deploy',
    shortTitle: 'Build',
    description: 'Bundling, static export, hosting, source maps, budgets and the production checklist.',
    nav: 'Reference',
  },
  {
    id: 'converting',
    path: '/docs/converting',
    file: 'docs/CONVERTING.md',
    source: 'docs/CONVERTING.md',
    title: 'Components',
    shortTitle: 'Components',
    description: 'Convert React components into agent-ui components with parity tests.',
    nav: 'Reference',
  },
  {
    id: 'design',
    path: '/docs/design',
    file: 'docs/DESIGN.md',
    source: 'docs/DESIGN.md',
    title: 'Design notes',
    shortTitle: 'Design',
    description: 'The thesis, evidence, trade-offs and what agent-ui deliberately leaves out.',
    nav: 'Reference',
  },
  {
    id: 'releasing',
    path: '/docs/releasing',
    file: 'docs/RELEASING.md',
    source: 'docs/RELEASING.md',
    title: 'Releasing',
    shortTitle: 'Releasing',
    description: 'How a release is cut, tested and published.',
    nav: 'Project',
  },
  {
    id: 'changelog',
    path: '/docs/changelog',
    file: 'CHANGELOG.md',
    source: 'CHANGELOG.md',
    title: 'Changelog',
    shortTitle: 'Changelog',
    description: 'Every release, its changes and the migration notes.',
    nav: 'Project',
  },
];

export const navGroups = [
  {
    title: 'Getting started',
    items: [
      { path: '/docs', title: 'Start here' },
      { path: '/docs/overview', title: 'Overview' },
      { path: '/docs/agent-rules', title: 'Agent rules' },
      { path: '/docs/guide', title: 'Guide' },
    ],
  },
  {
    title: 'Reference',
    items: [
      { path: '/docs/api', title: 'API reference' },
      { path: '/docs/build', title: 'Build & deploy' },
      { path: '/docs/converting', title: 'Components' },
      { path: '/docs/design', title: 'Design notes' },
    ],
  },
  {
    title: 'Explore',
    items: [
      { path: '/cookbook', title: 'Cookbook' },
      { path: '/examples', title: 'Examples' },
    ],
  },
  {
    title: 'Project',
    items: [
      { path: '/docs/releasing', title: 'Releasing' },
      { path: '/docs/changelog', title: 'Changelog' },
    ],
  },
];

export const getDoc = (id) => {
  const doc = docs.find((candidate) => candidate.id === id);
  if (!doc) throw new Error(`docs-meta: unknown document "${id}"`);
  return doc;
};

export const neighbours = (doc) => {
  const index = docs.findIndex((candidate) => candidate.id === doc.id);
  return {
    previous: index > 0 ? docs[index - 1] : null,
    next: index >= 0 && index < docs.length - 1 ? docs[index + 1] : null,
  };
};

export const sourceUrl = (doc) => (doc.source ? `${repository}/blob/main/${doc.source}` : `${repository}/tree/main`);
