// The shop's server side (Node only; never bundled for the browser): the cart and the orders. The durable data lives here, on
// the server. One instance per process, so the HTTP endpoints (server/ssr-handler.mjs) and the in-process answers used while
// rendering (server-fetch.mjs) see the same cart.
//
// This demo has ONE cart for the whole server. A real shop identifies the visitor (a session cookie) and keeps a cart per
// visitor; nothing in the pages would change, only what `createApi` looks up.
import { validateOrder } from './pages/checkout/rules.js';

const build = () => {
  let lines = []; // [{ id, title, price, quantity }]
  let orders = 0;
  const cart = () => ({ status: 200, body: { lines } });
  return {
    apiBase: '/api',
    handle: ({ method, pathname, body }) => {
      if (pathname === '/api/cart' && method === 'GET') return cart();
      if (pathname === '/api/cart/add' && method === 'POST') {
        const { id, title, price } = body;
        if (!Number.isInteger(id) || typeof title !== 'string' || typeof price !== 'number') return { status: 422, body: { message: 'A cart line needs an id, a title and a price.' } };
        const existing = lines.find((line) => line.id === id);
        lines = existing ? lines.map((line) => (line === existing ? { ...line, quantity: line.quantity + 1 } : line)) : [...lines, { id, title, price, quantity: 1 }];
        return cart();
      }
      if (pathname === '/api/cart/remove' && method === 'POST') {
        lines = lines.filter((line) => line.id !== body.id);
        return cart();
      }
      if (pathname === '/api/order' && method === 'POST') {
        if (!lines.length) return { status: 409, body: { message: 'The cart is empty.' } };
        const errors = validateOrder(body);
        if (Object.keys(errors).length) return { status: 422, body: { message: 'Please fix the highlighted fields.', errors } };
        orders += 1;
        lines = [];
        return { status: 201, body: { reference: `ORD-${orders}` } };
      }
      return pathname.startsWith('/api/') ? { status: 404, body: { message: 'No such endpoint.' } } : null;
    },
    reset: () => {
      lines = [];
      orders = 0;
    },
  };
};

let shared = null;
export const createApi = () => (shared ??= build());
