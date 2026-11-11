// The site's landing page. It is a normal page view: the build renders it once and ships the finished spec, so the page
// has no runtime behavior beyond the links it draws.
import { a, code, div, h1, h2, h3, li, p, section, span, strong, ul } from '@ehtb/agent-ui/spec';
import { siteMeta } from '../generated/site-meta.js';
import { codeBlock, homeLayout, highlightedCodeBlock, infoCard } from '../lib/site-layout.js';

const arrow = () => span({ class: 'arrow', 'aria-hidden': 'true' }, '→');

const actionLink = (href, label, variant = 'primary') =>
  a({ href, class: `button-link button-${variant}` }, label, arrow());

const metric = (value, label) =>
  div({ class: 'metric' }, strong({ class: 'metric-value' }, value), span({ class: 'metric-label' }, label));

const feature = (number, title, body) =>
  articleCard(
    span({ class: 'feature-number', 'aria-hidden': 'true' }, number),
    h3({ class: 'feature-title' }, title),
    p({ class: 'feature-body' }, body),
  );

const articleCard = (...children) => div({ class: 'feature-card' }, ...children);

const checklist = (items) =>
  ul({ class: 'check-list' }, items.map((text) => li(null, span({ class: 'check-mark', 'aria-hidden': 'true' }, '✓'), text)));

const codeSample = `import { div, button, h1, each, act, state, item } from '@ehtb/agent-ui/spec';

export const view = main(
  null,
  h1(null, 'Todos'),
  each('todos.items', 'id', (todo) =>
    div(null, state('todos.items'), button({ on: { click: act('todos.toggle', { id: item('id') }) } }, 'Toggle')),
  ),
);`;

const pageContent = () =>
  div(
    null,
    section(
      { class: 'home-hero' },
      div(
        { class: 'hero-copy' },
        p({ class: 'hero-eyebrow' },
          span({ class: 'pulse-dot', 'aria-hidden': 'true' }),
          `v${siteMeta.version} · zero dependencies · server rendered`,
        ),
        h1({ class: 'hero-title' },
          span(null, 'Interfaces for agents'),
          span({ class: 'hero-title-accent' }, 'by agents.'),
        ),
        p({ class: 'hero-lead' },
          'agent-ui makes the UI a plain JSON spec, the state plain data in namespaces, and every behavior a named, typed action. Agents write it, the validator checks it, and a small runtime renders it on the server and in the browser.',
        ),
        div(
          { class: 'hero-actions' },
          actionLink('/docs', 'Get started'),
          actionLink(`${siteMeta.repository}/tree/main/examples`, 'Browse examples', 'secondary'),
        ),
        div(
          { class: 'install-line' },
          code({ class: 'install-command' }, 'npm install @ehtb/agent-ui'),
          a({ href: '/docs', class: 'install-link' }, 'Read the setup guide', arrow()),
        ),
      ),
      div(
        { class: 'hero-visual', 'aria-hidden': 'true' },
        div(
          { class: 'visual-window' },
          div(
            { class: 'visual-bar' },
            span({ class: 'visual-dot visual-dot-a' }),
            span({ class: 'visual-dot visual-dot-b' }),
            span({ class: 'visual-dot visual-dot-c' }),
            span({ class: 'visual-title' }, 'page.js'),
          ),
          code(
            { class: 'visual-code' },
            span({ class: 'tok-keyword' }, 'export const '),
            span({ class: 'tok-plain' }, 'namespaces = {\n  todos: {\n    state: { items: [], draft: '),
            span({ class: 'tok-string' }, "''"),
            span({ class: 'tok-plain' }, ' },\n    actions: {\n      add: {\n        args: { text: '),
            span({ class: 'tok-string' }, "'string'"),
            span({ class: 'tok-plain' }, ' },\n        run: (store, { text }) => {\n          store.set('),
            span({ class: 'tok-string' }, "'items'"),
            span({ class: 'tok-plain' }, ',\n            [...store.get('),
            span({ class: 'tok-string' }, "'items'"),
            span({ class: 'tok-plain' }, '), { id: ..., text }]);\n        },\n      },\n    },\n  },\n};'),
          ),
        ),
        div(
          { class: 'visual-note visual-note-a' },
          span({ class: 'visual-note-icon', 'aria-hidden': 'true' }, '✓'),
          div(null, strong(null, 'Validator'), span(null, 'Runs on mount, names the fix')),
        ),
        div(
          { class: 'visual-note visual-note-b' },
          span({ class: 'visual-note-icon visual-note-icon-alt', 'aria-hidden': 'true' }, '↺'),
          div(null, strong(null, 'Replay'), span(null, 'Every action is a log entry')),
        ),
      ),
    ),
    section(
      { class: 'metrics-strip' },
      metric('0', 'runtime dependencies'),
      metric('1', 'JSON spec per page'),
      metric(`${siteMeta.docs}`, 'documentation pages'),
      metric(`${siteMeta.recipes}`, 'cookbook recipes'),
      metric(`${siteMeta.examples}`, 'runnable examples'),
    ),
    section(
      { class: 'home-section' },
      div(
        { class: 'section-heading' },
        p({ class: 'section-eyebrow' }, 'Why agent-ui'),
        h2(null, 'A framework shaped like the thing agents are good at'),
        p(null, 'Agents write text and reason over explicit structure. agent-ui turns the interface into exactly that: a closed grammar, plain state and named actions, with the checks at the moment the page is written.'),
      ),
      div(
        { class: 'feature-grid' },
        feature('01', 'The UI is data', 'A page compiles to a JSON spec. The browser downloads the behavior and the finished spec, never the builders that assembled it.'),
        feature('02', 'State has one shape', 'Plain JSON in namespaces. Every write is an action, every action is logged, and a thrown error undoes the whole step.'),
        feature('03', 'Checks before guessing', 'Bindings, arguments, labels, list keys and URLs are validated on mount with a path and a fix. `agent-ui check` covers every page.'),
        feature('04', 'Server first', 'Every page renders on the server with its real URL and state. The browser takes over the markup the server wrote instead of building it again, and soft navigation replaces a page without a client-side router.'),
        feature('05', 'Small on purpose', 'No React, no build-time magic, no transitive dependencies. The grammar is closed, so there is one valid form of every part.'),
        feature('06', 'Written to be read', 'Readable names, no minification by the framework, and a cookbook of recipes that are tested on every run.'),
      ),
    ),
    section(
      { class: 'home-section home-split' },
      div(
        { class: 'split-copy' },
        p({ class: 'section-eyebrow' }, 'One page, two files'),
        h2(null, 'Behavior and content never mix'),
        p(null, 'page.js declares the head, the namespaces and the plugins. view.js declares what the page looks like. Only the server and the build evaluate the view, so a browser never pays for the spec builders.'),
        checklist([
          'state, derive and actions live in one namespace each',
          'handlers are [actionName, args], never logic',
          'lists have stable keys; ids are explicit',
          'network goes through resources, effects through plugins',
        ]),
        a({ href: '/docs/guide', class: 'text-link text-link-arrow' }, 'Read the guide', arrow()),
      ),
      div({ class: 'split-code' }, codeBlock(
        `export const page = {
  head: { title: 'Todos' },
  namespaces: { todos },
};

// view.js
export const view = main(
  null,
  h1(null, 'Todos'),
  each('todos.items', 'id', (todo) =>
    li(null, item('text')),
  ),
);`,
        'js',
        'page.js + view.js',
      )),
    ),
    section(
      { class: 'home-section home-agents' },
      div(
        { class: 'agents-copy' },
        p({ class: 'section-eyebrow' }, 'Agent ready'),
        h2(null, 'Rules an agent can follow without a screenshot'),
        p(null, 'The framework ships its own operating manual and a discoverable grammar. `agent-ui explain` prints the canonical recipe for a task, `agent-ui check` renders every page, and the runtime exposes state, actions and rendered structure as data.'),
        div(
          { class: 'agents-actions' },
          a({ href: '/docs/agent-rules', class: 'button-link button-primary' }, 'Read the agent rules', arrow()),
          a({ href: '/docs/api', class: 'button-link button-secondary' }, 'API reference', arrow()),
        ),
      ),
      div(
        { class: 'agents-panel' },
        div({ class: 'panel-row' }, code(null, 'agent-ui init'), span(null, 'writes the rules into AGENTS.md')),
        div({ class: 'panel-row' }, code(null, 'agent-ui explain'), span(null, 'prints the canonical form')),
        div({ class: 'panel-row' }, code(null, 'agent-ui check'), span(null, 'renders and validates every page')),
        div({ class: 'panel-row' }, code(null, 'agent-ui build'), span(null, 'writes the production site')),
        div({ class: 'panel-row' }, code(null, 'agent-ui build --static'), span(null, 'writes one HTML file per URL')),
      ),
    ),
    section(
      { class: 'home-section' },
      div(
        { class: 'section-heading' },
        p({ class: 'section-eyebrow' }, 'Learn by copying'),
        h2(null, 'Documentation, recipes and runnable examples'),
        p(null, 'The same documentation an agent reads is published here. Every cookbook recipe is a working page the test suite drives.'),
      ),
      div(
        { class: 'card-grid' },
        infoCard({
          title: 'Start here',
          children: p(null, 'Install the package, write the first page and run the checks.'),
          href: '/docs',
          label: 'Open the guide',
        }),
        infoCard({
          title: 'API reference',
          children: p(null, 'The complete grammar, namespaces, actions, resources, plugins and testing helpers.'),
          href: '/docs/api',
          label: 'Read the reference',
        }),
        infoCard({
          title: 'Cookbook',
          children: p(null, `${siteMeta.recipes} recipes for the things every app needs, from lists to modals to drag and drop.`),
          href: '/cookbook',
          label: 'Browse recipes',
        }),
        infoCard({
          title: 'Examples',
          children: p(null, `${siteMeta.examples} complete apps, from the smallest todo list to production servers and code splitting.`),
          href: '/examples',
          label: 'See the examples',
        }),
      ),
    ),
    section(
      { class: 'home-cta' },
      div(
        { class: 'cta-inner' },
        p({ class: 'section-eyebrow' }, 'Ship the first page'),
        h2(null, 'From a folder to a rendered page in one command'),
        p(null, 'No client-side router, no component library, no dependencies to audit. Write the two files, run the check, build the site.'),
        div(
          { class: 'cta-actions' },
          actionLink('/docs', 'Start the tutorial'),
          a({ href: `${siteMeta.repository}/tree/main/examples/basic`, class: 'button-link button-ghost' }, 'Read the smallest example', arrow()),
        ),
      ),
      highlightedCodeBlock('npm install @ehtb/agent-ui\nnpx agent-ui init\nnpx agent-ui check\nnpx agent-ui build --static', 'bash', 'terminal'),
    ),
  );

export const view = homeLayout(pageContent());
