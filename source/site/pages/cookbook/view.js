// The cookbook index: one card per recipe, generated from cookbook/recipes.mjs. Each card links to a page that shows
// every file of the recipe in reading order.
import { a, div, h2, li, p, section, span, ul } from '@ehtb/agent-ui/spec';
import { recipeMeta } from '../../generated/cookbook-meta.js';
import { recipes } from '../../generated/cookbook.js';
import { renderInline } from '../../lib/markdown.js';
import { docsLayout } from '../../lib/site-layout.js';

const recipeCard = (recipe, index) =>
  section(
    { class: 'recipe-card' },
    div(
      { class: 'recipe-card-head' },
      span({ class: 'recipe-card-number', 'aria-hidden': 'true' }, String(index + 1).padStart(2, '0')),
      h2(null, a({ href: `/cookbook/${recipe.name}` }, recipe.title)),
    ),
    p({ class: 'recipe-card-use' }, ...renderInline(recipe.use)),
    div(
      { class: 'recipe-card-foot' },
      span({ class: 'recipe-card-files' }, `${recipe.files.length} ${recipe.files.length === 1 ? 'file' : 'files'}`),
      a({ href: `/cookbook/${recipe.name}`, class: 'text-link text-link-arrow' }, 'Open recipe', span({ class: 'arrow', 'aria-hidden': 'true' }, '→')),
    ),
  );

const content = () =>
  div(
    null,
    p({ class: 'doc-lead' },
      'One canonical way to build each common thing. Every recipe is a page that `agent-ui check` renders and the test suite drives, so the code below is known to work. Copy the files, rename the namespaces, keep the shape.',
    ),
    div(
      { class: 'cookbook-note' },
      p(null, 'Prefer the command line? ', a({ href: '/docs', class: 'text-link' }, 'agent-ui explain <recipe>'), ' prints the same files into your terminal.'),
    ),
    section(
      { class: 'cookbook-list' },
      recipeMeta.map((meta, index) => recipeCard(recipes.find((recipe) => recipe.name === meta.name), index)),
    ),
    section(
      { class: 'cookbook-footer' },
      h2(null, 'Missing a recipe?'),
      p(null, 'The grammar is closed on purpose. If a task needs a new node, event or operator, the change starts in the validator and docs/API.md, with a test in the same change — not as a local workaround. Open an issue with the use case.'),
      ul(
        { class: 'link-list' },
        li(null, a({ href: 'https://github.com/ehtb/agent-ui/issues', target: '_blank', rel: 'noreferrer' }, 'Open an issue')),
        li(null, a({ href: '/docs/design', class: 'text-link' }, 'Read the design notes')),
        li(null, a({ href: '/docs/api', class: 'text-link' }, 'Browse the grammar')),
      ),
    ),
  );

export const view = docsLayout({
  content: content(),
  title: 'Cookbook',
  description: 'Working recipes for the common things every agent-ui app needs.',
  activePath: '/cookbook',
  eyebrow: 'Cookbook',
  headings: [],
  previous: { path: '/docs/design', title: 'Design notes' },
  next: { path: '/examples', title: 'Examples' },
  source: 'https://github.com/ehtb/agent-ui/tree/main/cookbook',
});
