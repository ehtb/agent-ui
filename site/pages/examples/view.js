// The examples index, built from the table in examples/README.md. The sites themselves are separate projects in the
// repository; this page gives each one a description, the command that runs it and a link to its source.
import { a, code, div, h2, p, section, span, table, tbody, td, th, thead, tr } from '@ehtb/agent-ui/spec';
import { examples } from '../../generated/examples.js';
import { docsLayout, highlightedCodeBlock } from '../../lib/site-layout.js';

const exampleRow = (example) =>
  tr(
    null,
    th({ scope: 'row' }, a({ href: example.link, class: 'example-name', target: '_blank', rel: 'noreferrer' }, example.name, span({ class: 'external-mark', 'aria-hidden': 'true' }, '↗'))),
    td(null, example.description),
    td(null, code({ class: 'example-command' }, example.command)),
  );

const content = () =>
  div(
    null,
    p({ class: 'doc-lead' },
      'Complete apps that use agent-ui the way a project does. They are separate projects with their own package.json, so they show the library next to other tools without the framework depending on any of them.',
    ),
    section(
      { class: 'examples-table-wrap' },
      table(
        { class: 'examples-table' },
        thead(null, tr(null, th({ scope: 'col' }, 'Example'), th({ scope: 'col' }, 'What it shows'), th({ scope: 'col' }, 'Run it'))),
        tbody(null, examples.map(exampleRow)),
      ),
    ),
    section(
      { class: 'examples-run' },
      h2(null, 'Run one locally'),
      p(null, 'Clone the repository, install the dependencies of that example, then run its scripts. The dependency-free examples run from the repository root with ', code(null, 'npm run example'), '.'),
      highlightedCodeBlock(
        `git clone https://github.com/ehtb/agent-ui.git
cd agent-ui
npm run example -- basic test
npm run example -- basic dev`,
        'bash',
        'terminal',
      ),
      p(null, 'Examples with their own dependencies (events, with-typescript and react-converted-components) are skipped by the root test run. Install them inside their folder and run the example through the same command.'),
    ),
    section(
      { class: 'examples-note' },
      h2(null, 'Which one should I copy?'),
      p(null, 'Start with basic for the smallest page, notes for two namespaces that change together, and registration for a form. Use directory for server data and URL parameters, hydration for the browser handoff, and shop when several apps share chunks. The production-server example is the model for deploying behind your own Node server.'),
      div(
        { class: 'example-links' },
        a({ href: `${examples[0]?.link ?? 'https://github.com/ehtb/agent-ui/tree/main/examples'}`, class: 'button-link button-primary', target: '_blank', rel: 'noreferrer' }, 'Open the examples on GitHub', span({ class: 'arrow', 'aria-hidden': 'true' }, '→')),
        a({ href: '/cookbook', class: 'button-link button-secondary' }, 'Browse the cookbook', span({ class: 'arrow', 'aria-hidden': 'true' }, '→')),
      ),
    ),
  );

export const view = docsLayout({
  content: content(),
  title: 'Examples',
  description: 'Complete agent-ui apps, from the smallest page to a production server.',
  activePath: '/examples',
  eyebrow: 'Examples',
  headings: [],
  previous: { path: '/cookbook', title: 'Cookbook' },
  source: 'https://github.com/ehtb/agent-ui/tree/main/examples',
});
