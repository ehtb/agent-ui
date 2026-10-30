// The content of the page at "/" (the file next to page.js). build/ and the server import it; a browser bundle does not,
// because the build renders this view (with the shell's content) in Node once and ships the finished spec as data instead.
import { act, and, each, equals, event, h2, input, length, p, section, state, ul, when } from '@ehtb/agent-ui/spec';
import { shell } from '../shared/shell-view.js';
import { productCard } from './components/product-card.js';

const listView = section(
  { id: 'product-list' },
  h2({ id: 'list-title' }, 'Products'),
  input({ id: 'search', type: 'search', 'aria-label': 'Search products', placeholder: 'Search products', value: state('list.query'), on: { input: act('list.setQuery', { value: event('target.value') }) } }),
  p({ id: 'result-count', role: 'status' }, state('list.resultLabel')),
  ul({ id: 'products' }, each('list.visible', 'id', productCard)),
  when(and(equals(state('catalog.status'), 'ready'), equals(length(state('list.visible')), 0)), p({ id: 'no-results' }, 'No products match your search.')),
);

export const view = listView;
export { shell };
