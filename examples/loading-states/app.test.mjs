// The ready states in the browser app, on the headless DOM shim with a fetch the test controls. No server needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoot, createWindow } from '@ehtb/agent-ui/testing/dom-shim.mjs';
import { createFakeFetch, deferred, flushAsync } from '@ehtb/agent-ui/testing/helpers.mjs';
import { definePage } from '@ehtb/agent-ui/pages';
import { page as overview } from './pages/page.js';
import { page as instant } from './pages/instant/page.js';
import { page as products } from './pages/products/page.js';
import { page as product } from './pages/products/[id]/page.js';
import { page as unavailable } from './pages/unavailable/page.js';
// The content of each page (view + the shared layout) lives in the view.js next to it; page.js is behavior only.
import * as overviewView from './pages/view.js';
import * as instantView from './pages/instant/view.js';
import * as productsView from './pages/products/view.js';
import * as productView from './pages/products/[id]/view.js';
import * as unavailableView from './pages/unavailable/view.js';

const definitions = [
  [/^\/instant$/, definePage(instant, { path: '/instant', view: instantView.view, layout: instantView.layout })],
  [/^\/products$/, definePage(products, { path: '/products', view: productsView.view, layout: productsView.layout, pending: productsView.pending })],
  [/^\/products\/[^/]+$/, definePage(product, { path: '/products/:id', view: productView.view, layout: productView.layout, pending: productView.pending })],
  [/^\/unavailable$/, definePage(unavailable, { path: '/unavailable', view: unavailableView.view, layout: unavailableView.layout, pending: unavailableView.pending })],
  [/^\/$/, definePage(overview, { path: '/', view: overviewView.view, layout: overviewView.layout })],
];
// The page that serves the URL, as the server would pick it.
const create = (environment) => definitions.find(([pattern]) => pattern.test(environment.win.location.pathname))[1].create(environment);

const catalogItems = [
  { id: 1, name: 'Field notebook', price: 9, description: 'Dotted pages.' },
  { id: 2, name: 'Brass pencil', price: 14, description: 'A pencil.' },
];
const notFound = { ok: false, status: 404, json: async () => null };

const open = async (path, respond, initialState = {}) => {
  const fake = createFakeFetch(respond);
  const ui = create({ root: createRoot(), win: createWindow(path), fetchFunction: fake, dev: true, initialState });
  await flushAsync(ui);
  return { ui, fake };
};
const shown = (ui) => JSON.stringify(ui.outline());

test('a page without data declares no ready and is ready at once', async () => {
  const { ui, fake } = await open('/instant', () => catalogItems);
  assert.equal(ui.isReady(), undefined);
  assert.equal(ui.getStatus(), undefined);
  assert.equal(fake.calls.length, 0); // nothing asked for the products
  assert.ok(shown(ui).includes('instant-view'));
  assert.ok(shown(ui).includes('ready')); // the layout line: "This page is ready."
});

test('products: a skeleton while the data loads, then the list', async () => {
  const response = deferred();
  const { ui } = await open('/products', () => response);
  assert.equal(ui.isReady(), false);
  assert.ok(shown(ui).includes('products-skeleton'));
  assert.equal(shown(ui).includes('products-view'), false);
  assert.ok(shown(ui).includes('pending'));
  response.resolve(catalogItems);
  await flushAsync(ui);
  assert.equal(ui.isReady(), true);
  assert.equal(shown(ui).includes('products-skeleton'), false);
  assert.equal(ui.derived().catalog.count, '2 products');
});

test('a refresh keeps the list on screen and never returns the page to pending', async () => {
  // The state the server embedded: the products are there. The browser still repeats the request on mount.
  const refresh = deferred();
  const { ui, fake } = await open('/products', () => refresh, { catalog: { list: catalogItems, status: 'ready' } });
  assert.equal(fake.calls.length, 1);
  assert.equal(ui.isReady(), true);
  assert.equal(ui.state().catalog.refreshing, true);
  assert.ok(shown(ui).includes('refreshing'));
  assert.equal(shown(ui).includes('products-skeleton'), false);
  refresh.resolve([...catalogItems, { id: 3, name: 'Desk lamp', price: 48, description: 'Light.' }]);
  await flushAsync(ui);
  assert.equal(ui.state().catalog.refreshing, false);
  assert.equal(ui.state().catalog.list.length, 3);
});

test('a failed refresh keeps the old list and records the error', async () => {
  const { ui } = await open('/products', () => notFound, { catalog: { list: catalogItems, status: 'ready' } });
  assert.equal(ui.state().catalog.status, 'ready');
  assert.equal(ui.state().catalog.list.length, 2);
  assert.equal(ui.state().catalog.error, 'HTTP 404');
});

test('a product page: 404 for an unknown id once loaded, never before', async () => {
  const response = deferred();
  const { ui } = await open('/products/99', () => response);
  assert.equal(ui.isReady(), false);
  assert.equal(ui.getStatus(), 200); // not loaded yet: nothing says it is missing
  assert.equal(ui.derived().product.isMissing, false);
  response.resolve(catalogItems);
  await flushAsync(ui);
  assert.equal(ui.getStatus(), 404);
  assert.equal(ui.derived().product.isMissing, true);
  const known = await open('/products/2', () => catalogItems);
  assert.equal(known.ui.getStatus(), 200);
  assert.equal(known.ui.derived().product.current.name, 'Brass pencil');
});

test('a failure counts as finished: the error is shown, the status is 503, and Try again repeats the request', async () => {
  let answer = notFound;
  const { ui, fake } = await open('/unavailable', () => answer);
  assert.equal(ui.isReady(), true);
  assert.equal(ui.getStatus(), 503);
  assert.ok(shown(ui).includes('report-error'));
  answer = { ok: true, status: 200, json: async () => ({}) };
  ui.dispatch('unavailable.reload');
  await flushAsync(ui);
  assert.equal(fake.calls.length, 2);
  assert.equal(ui.getStatus(), 200);
  assert.ok(shown(ui).includes('report-ok'));
});

test('only the pages that list the catalog request the products', async () => {
  const instantPage = await open('/instant', () => notFound);
  assert.equal(instantPage.fake.calls.length, 0);
  const productsPage = await open('/products', () => notFound);
  assert.equal(productsPage.fake.calls[0].url, '/products.json');
  const unavailablePage = await open('/unavailable', () => notFound);
  assert.equal(unavailablePage.fake.calls[0].url, '/unavailable.json');
  assert.equal(unavailablePage.ui.errors.length, 0);
});
