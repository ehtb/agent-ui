import { a, h1, li, main, p, ul } from '@ehtb/agent-ui/spec';
import { recipes } from '../recipes.mjs';

export const view = main(
  { id: 'cookbook' },
  h1({ id: 'cookbook-title' }, 'agent-ui cookbook'),
  p(null, 'One canonical way to build each common thing. Copy a recipe, rename its namespaces.'),
  ul({ id: 'recipes' }, ...recipes.map((recipe) => li({ id: `recipe-${recipe.name}` }, a({ href: `/${recipe.name}` }, recipe.title)))),
);
