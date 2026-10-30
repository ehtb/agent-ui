import { withResources, resources } from '@ehtb/agent-ui/resources';

// The products, loaded from /products.json for the pages that show them (the list and one product): the namespace `catalog`,
// which those two pages list in their `namespaces`.
//
// Loading is state, and each page says what it needs with `ready` (see pages/products/page.js):
//   catalog.status      'idle' (not asked yet) -> 'loading' (first load) -> 'ready' | 'failed'
//   catalog.refreshing  true while a repeat request is running behind a page that is already on screen
//
// Only the first load shows "loading". A later request (the browser repeats the request after the server rendered the
// page, a return to the page, the reload button) is a refresh: what is on screen stays, so a page that is ready never
// goes back to its pending view.

// A page that needs the products is ready when the load has finished, successfully or not: a failed load is shown as
// an error, and waiting for it would only delay the render.
export const productsSettled = (state) => state.catalog.status === 'ready' || state.catalog.status === 'failed';

export const findProduct = (products, routeParams) => products.find((product) => String(product.id) === routeParams.id) ?? null;

export const catalog = {
    state: {
      list: [],
      status: 'idle',
      error: '',
      refreshing: false,
      reloadCount: 0,
    },
    derive: {
      count: (get) => `${get('list').length} products`,
    },
    actions: {
      loading: {
        args: {},
        run: (store) => {
          if (store.get('status') !== 'ready') store.set('status', 'loading');
          store.set('refreshing', true);
          store.set('error', '');
        },
      },
      loaded: {
        args: { data: 'json' },
        run: (store, { data }) => {
          store.set('list', data);
          store.set('status', 'ready');
          store.set('refreshing', false);
        },
      },
      failed: {
        args: { message: 'string' },
        run: (store, { message }) => {
          if (store.get('status') !== 'ready') store.set('status', 'failed'); // a failed refresh keeps the old list
          store.set('error', message);
          store.set('refreshing', false);
        },
      },
      reload: { args: {}, run: (store) => store.set('reloadCount', store.get('reloadCount') + 1) },
    },
    resources: [
      {
        watch: ['reloadCount'],
        request: () => ({ url: '/products.json' }),
        onStart: 'loading',
        onSuccess: 'loaded',
        onError: 'failed',
      },
    ],
  };

// Every request the browser makes is held back by DELAY_MS, so that the pending views stay on screen long enough to see.
// The server is not slowed down: it renders the finished page. Set it to 0 to remove the delay.
const DELAY_MS = 1200;
const delayed = (fetchFunction) => async (url, options) => {
  await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  return fetchFunction(url, options);
};
const isBrowser = (win) => typeof window !== 'undefined' && win === window;
export const resourcesSlowedInTheBrowser = ({ fetchFunction, win }) => (isBrowser(win) ? resources(delayed(fetchFunction), { win }) : withResources({ fetchFunction, win }));
