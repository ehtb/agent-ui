// Build configuration. `agent-ui build` writes the site to dist/; `agent-ui serve` renders every page per request.
// When a page is ready, and which status it answers, are declared by each page (`ready`, `status`), not here.
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { frameworkBuildOptions } from '@ehtb/agent-ui/build/presets.mjs';
import { fetchFunction } from './server-fetch.mjs';

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default ({ dev = false, validator } = {}) => ({
  ...frameworkBuildOptions({ dev, validator, projectRoot }),
  publicDir: 'public', // products.json (there is deliberately no unavailable.json)
  fetchFunction, // answers the data requests of pages rendered on the server (server-fetch.mjs)
});
