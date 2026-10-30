// The page "/product/:id": one product, with an add-to-cart button and the lines already in the cart. Behavior only: the
// content is view.js next to this file (the build and the server import it, a browser bundle does not).
import { cart } from '../../../shared/cart.js';
import { catalog, catalogSettled } from '../../../shared/catalog.js';
import { withHead } from '@ehtb/agent-ui/head';
import { plugins } from '../../../shared/plugins.js';
import { shell } from '../../../shared/shell.js';

const findProduct = (products, routeParams) => products.find((product) => String(product.id) === routeParams.id) ?? null;

const product = {
  derive: {
    current: (get) => findProduct(get('catalog.list'), get('route.params')),
    isNotFound: (get) => get('catalog.status') === 'ready' && !findProduct(get('catalog.list'), get('route.params')),
  },
};

export const page = {
  namespaces: { cart, catalog, product },
  shell,
  plugins: [...plugins, withHead], // the head follows the state (the canonical link and the structured data)
  head: {
    title: (state) => findProduct(state.catalog.list, state.route.params)?.title ?? 'Product',
    description: (state) => findProduct(state.catalog.list, state.route.params)?.summary ?? 'A product',
    // What a search engine or a link preview reads, written into the HTML by the server: the page's language, its Open Graph
    // title and a canonical link built from the URL's parameters, and the product as structured data.
    html: { lang: 'en' },
    tags: [
      { tag: 'meta', props: { property: 'og:title', content: (state) => findProduct(state.catalog.list, state.route.params)?.title ?? 'Product' } },
      { tag: 'link', props: { rel: 'canonical', href: (state) => `/product/${state.route.params.id}` } },
      {
        tag: 'script',
        props: { type: 'application/ld+json' },
        children: (state) => {
          const found = findProduct(state.catalog.list, state.route.params);
          return found && { '@context': 'https://schema.org', '@type': 'Product', name: found.title, description: found.summary, offers: { '@type': 'Offer', price: found.price, priceCurrency: 'USD' } };
        },
      },
    ],
  },
  ready: catalogSettled,
  status: (state) => (state.catalog.status === 'ready' && !findProduct(state.catalog.list, state.route.params) ? 404 : 200),
  // One static page per product in products.json.
};
