// The "Start here" page. It is hand-written because it is the one page a new reader should finish in a few minutes:
// install, two files, three commands. The rest of the documentation is generated from Markdown.
import { a, code, div, h2, li, ol, p, section, span, strong, ul } from '@ehtb/agent-ui/spec';
import { docsLayout, highlightedCodeBlock, infoCard } from '../../lib/site-layout.js';

const step = (number, title, id, body) =>
  section(
    { class: 'start-step' },
    div({ class: 'step-number', 'aria-hidden': 'true' }, String(number)),
    div({ class: 'step-body' }, h2({ domId: id }, title), ...body),
  );

const fileLink = (label, href) =>
  a({ href, class: 'text-link text-link-arrow' }, label, span({ class: 'arrow', 'aria-hidden': 'true' }, '→'));

const content = () =>
  div(
    null,
    p({ class: 'doc-lead' },
      'agent-ui is a UI library for apps that an agent writes and maintains. The interface is a JSON spec, state is plain data in namespaces, and all behavior goes through named, typed actions. This page gets you from an empty folder to a checked, server-rendered page.',
    ),
    div(
      { class: 'start-callout' },
      span({ class: 'callout-icon', 'aria-hidden': 'true' }, '⚡'),
      div(null,
        strong(null, 'Already have an agent on the project?'),
        p(null, 'Run ', code(null, 'npx agent-ui init'), ' to write the operating rules into AGENTS.md, then point the agent at this page and the API reference.'),
      ),
    ),
    step(1, 'Install the package', 'install', [
      p(null, 'agent-ui has no runtime dependencies. Add it to a project that uses ES modules and Node 22 or newer.'),
      highlightedCodeBlock('npm install @ehtb/agent-ui', 'bash', 'terminal'),
    ]),
    step(2, 'Describe the build', 'build-config', [
      p(null, 'A project has one build.config.mjs. It returns the framework options for the current mode; your own options come on top.'),
      highlightedCodeBlock(
        `import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { frameworkBuildOptions } from '@ehtb/agent-ui/build/presets.mjs';

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default ({ dev = false, validator } = {}) => ({
  ...frameworkBuildOptions({ dev, validator, projectRoot }),
});`,
        'js',
        'build.config.mjs',
      ),
    ]),
    step(3, 'Write the first page', 'first-page', [
      p(null, 'A page is a URL, a URL is a folder, and a page is two files: ', code(null, 'page.js'), ' for behavior and ', code(null, 'view.js'), ' for content. The page at ', code(null, '/'), ' lives in ', code(null, 'pages/'), '.'),
      highlightedCodeBlock(
        `export const namespaces = {
  todos: {
    state: { items: [], nextId: 1 },
    actions: {
      add: {
        args: { text: 'string' },
        run: (store, { text }) => {
          const id = store.get('nextId');
          store.set('nextId', id + 1);
          store.set('items', [...store.get('items'), { id, text }]);
        },
      },
    },
  },
};

export const page = { head: { title: 'Todos' }, namespaces };`,
        'js',
        'pages/page.js',
      ),
      highlightedCodeBlock(
        `import { main, h1, ul, li, item, each } from '@ehtb/agent-ui/spec';

export const view = main(
  null,
  h1(null, 'Todos'),
  ul(null, each('todos.items', 'id', li(null, item('text')))),
);`,
        'js',
        'pages/view.js',
      ),
      p(null, 'The view imports the builders, but a production browser never does: the build evaluates the view once in Node and ships the finished spec as data.'),
    ]),
    step(4, 'Check it, then build it', 'commands', [
      p(null, 'The check renders every page in development mode and reports spec, link and data problems. Fix every line it prints before you continue.'),
      highlightedCodeBlock('npx agent-ui check\nnpx agent-ui build\nnpx agent-ui serve', 'bash', 'terminal'),
      p(null, 'For a site with no server, ', code(null, 'npx agent-ui build --static'), ' writes one HTML file per URL. Put the output on any file host.'),
    ]),
    section(
      { class: 'start-next' },
      h2(null, 'Where to go next'),
      div(
        { class: 'card-grid card-grid-compact' },
        infoCard({ title: 'The guide', children: p(null, 'How pages, URLs, APIs, forms and soft navigation fit together.'), href: '/docs/guide', label: 'Read the guide' }),
        infoCard({ title: 'The rules', children: p(null, 'The short operating manual for an agent working in the codebase.'), href: '/docs/agent-rules', label: 'Read the rules' }),
        infoCard({ title: 'The cookbook', children: p(null, 'Working recipes for lists, forms, modals, drag and drop and more.'), href: '/cookbook', label: 'Browse recipes' }),
      ),
    ),
    div(
      { class: 'start-footer-links' },
      p(null, 'Looking for the full grammar? ', fileLink('The API reference has every node, binding, operator and option', '/docs/api'), '.'),
    ),
  );

export const view = docsLayout({
  content: content(),
  title: 'Start here',
  description: 'Install agent-ui, write the first page and run the checks.',
  activePath: '/docs',
  headings: [
    { level: 2, text: 'Install the package', id: 'install' },
    { level: 2, text: 'Describe the build', id: 'build-config' },
    { level: 2, text: 'Write the first page', id: 'first-page' },
    { level: 2, text: 'Check it, then build it', id: 'commands' },
  ],
  next: { path: '/docs/overview', title: 'Project overview' },
});
