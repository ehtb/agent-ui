// The three pages of the shop on the DOM shim, talking to the real api.js in process (the same module the server uses): the cart
// lives on the server, so what one page puts in the cart is there when the next page opens.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { definePage } from '@ehtb/agent-ui/pages';
import { createRoot, createWindow, findElements, fireEvent } from '@ehtb/agent-ui/testing/dom-shim.mjs';
import { flushAsync } from '@ehtb/agent-ui/testing/helpers.mjs';
import { createApi } from './api.js';
import { page as listPage } from './pages/page.js';
import { view as listView, shell as listShell } from './pages/view.js';
import { page as productPage } from './pages/product/[id]/page.js';
import { view as productView, shell as productShell } from './pages/product/[id]/view.js';
import { page as checkoutPage } from './pages/checkout/page.js';
import { view as checkoutView, shell as checkoutShell } from './pages/checkout/view.js';

const products = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'public/products.json'), 'utf8'));
const pages = [
  [/^\/$/, definePage(listPage, { path: '/', view: listView, shell: listShell })],
  [/^\/product\/[^/]+$/, definePage(productPage, { path: '/product/:id', view: productView, shell: productShell })],
  [/^\/checkout$/, definePage(checkoutPage, { path: '/checkout', view: checkoutView, shell: checkoutShell })],
];

beforeEach(() => createApi().reset());

// The browser's fetch: products.json from the files, everything below /api from api.js in process.
const fetchFunction = async (url, init = {}) => {
  if (url === '/products.json') return Response.json(products);
  const answer = createApi().handle({ method: init.method ?? 'GET', pathname: url, body: init.body ? JSON.parse(init.body) : {} });
  return answer ? Response.json(answer.body, { status: answer.status }) : new Response(null, { status: 404 });
};

// Opens the page that serves `path`, in its own window and root (a page load): the shell first, and the page in the element the shell
// holds for it, as in a browser.
const open = async (path) => {
  const shellRoot = createRoot();
  const [, definition] = pages.find(([pattern]) => pattern.test(path));
  const win = createWindow(path);
  const shellApp = definition.createShell({ root: shellRoot, win, fetchFunction, dev: true });
  const root = findElements(shellRoot, (element) => element.attributes.id === 'app')[0];
  const ui = definition.create({ root, win, fetchFunction, dev: true, shell: shellApp });
  await flushAsync(ui);
  const byId = (id) => findElements(shellRoot, (element) => element.attributes['data-id'] === id)[0];
  return { ui, root, shellApp, shellRoot, byId };
};

test('the list page loads the catalog and the cart, and filters by the search text', async () => {
  const { ui } = await open('/');
  assert.equal(ui.state().catalog.status, 'ready');
  assert.equal(ui.state().cart.status, 'ready');
  assert.equal(ui.derived().list.visible.length, products.length);
  ui.dispatch('list.setQuery', { value: 'bottle' });
  await ui.settle();
  assert.equal(ui.derived().list.resultLabel, '1 product');
  assert.equal(ui.errors.length, 0);
});

test('adding to the cart is a request to the server, and the answer is the new cart', async () => {
  const { ui } = await open('/');
  ui.dispatch('cart.add', { id: 2, title: 'Insulated bottle', price: 24 });
  ui.dispatch('cart.add', { id: 3, title: 'Merino socks', price: 18 });
  await flushAsync(ui);
  await flushAsync(ui);
  assert.deepEqual(ui.state().cart.lines.map((line) => [line.id, line.quantity]), [[2, 1], [3, 1]]);
  ui.dispatch('cart.add', { id: 2, title: 'Insulated bottle', price: 24 });
  await flushAsync(ui);
  assert.equal(ui.derived().cart.count, 3);
  assert.equal(ui.derived().cart.total, 66);
  assert.deepEqual(createApi().handle({ method: 'GET', pathname: '/api/cart', body: {} }).body.lines.map((line) => line.quantity), [2, 1]);
});

test('the shell\'s header shows the cart of the page and the page the visitor is on', async () => {
  const { ui, shellApp, byId } = await open('/product/2');
  assert.equal(byId('nav-cart').textContent, 'Cart (0)');
  assert.equal(byId('nav-shop').attributes.class ?? '', '', 'the shop link is not the current page here');
  fireEvent(byId('add-to-cart'), 'click');
  await flushAsync(ui);
  await flushAsync(ui);
  assert.equal(ui.derived().cart.count, 1);
  assert.equal(shellApp.state().frame.cartCount, 1, 'the shell reads the count from the page, one way');
  assert.equal(byId('nav-cart').textContent, 'Cart (1)');
  assert.equal(shellApp.state().route.path, '/product/2');
  assert.equal(ui.errors.length + shellApp.errors.length, 0);
  const home = await open('/');
  assert.equal(home.byId('nav-shop').attributes.class, 'active', 'the link to the page that shows is marked');
  assert.equal(home.byId('nav-cart').textContent, 'Cart (1)', 'the next page\'s shell starts with the cart the server holds');
});

test('a button asks for the checkout page with route.go, and the links that should be soft are', async () => {
  const { ui, byId } = await open('/product/2');
  fireEvent(byId('add-to-cart'), 'click');
  await flushAsync(ui);
  await flushAsync(ui);
  assert.equal(byId('to-checkout').attributes['data-id'], 'to-checkout');
  assert.deepEqual(ui.tree().find((entry) => entry.id === 'to-checkout').on, { click: 'route.go' });
  for (const id of ['back', 'nav-shop', 'nav-cart', 'nav-checkout']) assert.equal(byId(id).attributes['data-soft'], '', `${id} is a soft link`);
});

test('the next page starts with the cart the server holds', async () => {
  const first = await open('/product/2');
  fireEvent(first.byId('add-to-cart'), 'click');
  await flushAsync(first.ui);
  assert.equal(first.ui.derived().cart.count, 1);
  const checkout = await open('/checkout');
  assert.equal(checkout.ui.derived().cart.count, 1);
  assert.equal(checkout.ui.derived().cart.total, 24);
  assert.equal(checkout.ui.errors.length, 0);
});

test('the product page answers 404 for an unknown product once the catalog has loaded', async () => {
  const known = await open('/product/4');
  assert.equal(known.ui.getStatus(), 200);
  assert.equal(known.ui.derived().product.current.title, 'Headlamp');
  assert.equal(known.ui.state().route.params.id, '4');
  const missing = await open('/product/99');
  assert.equal(missing.ui.getStatus(), 404);
  assert.equal(missing.ui.derived().product.isNotFound, true);
});

test('the checkout validates, places the order on the server, and the cart is empty on the next page', async () => {
  createApi().handle({ method: 'POST', pathname: '/api/cart/add', body: { id: 4, title: 'Headlamp', price: 35 } });
  const checkout = await open('/checkout');
  const { ui, byId } = checkout;
  assert.equal(ui.derived().cart.count, 1);

  fireEvent(byId('checkout-form'), 'submit');
  await flushAsync(ui);
  assert.deepEqual(Object.keys(ui.state().checkout.errors), ['name', 'email', 'address']);
  assert.equal(ui.state().checkout.status, 'editing');

  ui.dispatch('checkout.field', { name: 'name', value: 'Ada Lovelace' });
  ui.dispatch('checkout.field', { name: 'email', value: 'ada@example.com' });
  ui.dispatch('checkout.field', { name: 'address', value: '1 Analytical Street' });
  fireEvent(byId('checkout-form'), 'submit');
  fireEvent(byId('checkout-form'), 'submit'); // a repeated submit while sending changes nothing
  await flushAsync(ui);
  await flushAsync(ui);
  assert.equal(ui.state().checkout.status, 'done');
  assert.equal(ui.state().checkout.reference, 'ORD-1');
  assert.equal(ui.derived().cart.isEmpty, true); // the page asked for the cart again after the order
  assert.equal(ui.errors.length, 0);

  const next = await open('/');
  assert.equal(next.ui.derived().cart.count, 0);
});

test('the server refuses what the page should not send: an empty cart, and an invalid order', async () => {
  const api = createApi();
  assert.equal(api.handle({ method: 'POST', pathname: '/api/order', body: { name: 'A', email: 'a@b.co', address: 'x' } }).status, 409);
  api.handle({ method: 'POST', pathname: '/api/cart/add', body: { id: 1, title: 'Trail backpack', price: 89 } });
  const refused = api.handle({ method: 'POST', pathname: '/api/order', body: { name: '', email: 'nope', address: '' } });
  assert.equal(refused.status, 422);
  assert.deepEqual(Object.keys(refused.body.errors), ['name', 'email', 'address']);
  assert.equal(api.handle({ method: 'POST', pathname: '/api/cart/add', body: { id: 'x' } }).status, 422);
  assert.equal(api.handle({ method: 'GET', pathname: '/api/nothing', body: {} }).status, 404);
});
