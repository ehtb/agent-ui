// The content of one cookbook page: when to reach for the recipe, then every file it asks you to copy, in reading order.
// The code is highlighted at build time and shipped as spec data, like the documentation pages.
import { p, section, div, h2, code, span } from '@ehtb/agent-ui/spec';
import { recipes } from '../generated/cookbook.js';
import { recipeMeta, recipeTitles } from '../generated/cookbook-meta.js';
import { renderInline } from './markdown.js';
import { docsLayout, highlightedCodeBlock } from './site-layout.js';

const fileTitle = (path) => {
  const parts = path.split('/');
  return parts[parts.length - 1];
};

const recipeNeighbours = (name) => {
  const index = recipeMeta.findIndex((recipe) => recipe.name === name);
  return {
    previous: index > 0 ? { path: `/cookbook/${recipeMeta[index - 1].name}`, title: recipeMeta[index - 1].title } : null,
    next: index >= 0 && index < recipeMeta.length - 1
      ? { path: `/cookbook/${recipeMeta[index + 1].name}`, title: recipeMeta[index + 1].title }
      : null,
  };
};

export const recipeView = (name) => {
  const recipe = recipes.find((candidate) => candidate.name === name);
  if (!recipe) throw new Error(`recipe-view: unknown recipe "${name}"`);
  const { previous, next } = recipeNeighbours(name);
  const content = [
    p({ class: 'doc-lead' }, ...renderInline(recipe.use)),
    div(
      { class: 'recipe-meta' },
      span({ class: 'recipe-badge' }, `${recipe.files.length} ${recipe.files.length === 1 ? 'file' : 'files'}`),
      span(null, 'Copy them in reading order and rename the namespaces.'),
    ),
    ...recipe.files.map((file) =>
      section(
        { class: 'recipe-file' },
        h2({ class: 'recipe-file-title' }, code({ class: 'inline-code' }, file.path)),
        highlightedCodeBlock(file.code, file.language, fileTitle(file.path)),
      ),
    ),
  ];
  return docsLayout({
    content,
    title: recipeTitles[name],
    description: `Cookbook recipe: ${recipeTitles[name]}`,
    activePath: '/cookbook',
    sectionLink: { label: 'Cookbook', href: '/cookbook' },
    eyebrow: 'Cookbook',
    headings: [],
    previous,
    next,
    source: 'https://github.com/ehtb/agent-ui/tree/main/cookbook',
  });
};
