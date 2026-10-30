// Build configuration of this example. `agent-ui build` (and dev, serve, check) read it from the project root.
// Which pages exist is not configured: pages/page.js is "/", pages/product/[id]/page.js is "/product/:id", and
// pages/checkout/page.js is "/checkout". Every page is its own entry, so a page downloads only what it imports.
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { frameworkBuildOptions } from '@ehtb/agent-ui/build/presets.mjs';
import { fetchFunction } from './server-fetch.mjs';

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default ({ dev = false, validator } = {}) => ({
  ...frameworkBuildOptions({ dev, validator, projectRoot }),
  publicDir: 'public', // products.json, fetched by the list and product pages
  fetchFunction, // answers the data requests of pages rendered on the server: files in public/ and the API (server-fetch.mjs)
  api: 'api.js', // the cart and the orders, served by `agent-ui serve`
});
