// The behavior of one cookbook page. The recipe names are read by the generator from cookbook/recipes.mjs, so this file
// only has to supply a head that mentions the recipe.
import { recipeTitles } from '../generated/cookbook-meta.js';
import { docsPage } from './docs-page.js';

export const recipePage = (name) => {
  const title = recipeTitles[name];
  if (!title) throw new Error(`recipe-page: unknown recipe "${name}"`);
  return docsPage({
    title,
    description: `Cookbook recipe: ${title}`,
  });
};
