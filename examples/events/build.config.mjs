// Build configuration of this example. `agent-ui build` (and dev, serve, check) read it from the project root.
// A function of the build mode returning options; the framework's own settings come from frameworkBuildOptions.
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';
import { frameworkBuildOptions } from '@ehtb/agent-ui/build/presets.mjs';
import { fetchFunction } from './server-fetch.mjs';

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default ({ dev = false, validator } = {}) => ({
  ...frameworkBuildOptions({ dev, validator, projectRoot }),
  // Production only: esbuild minifies every chunk after the framework stripped comments (docs/BUILD.md, `transform`).
  // Development builds stay readable. Names of exports and imports between chunks are kept; only local names change.
  transform: dev ? undefined : (code, { kind }) => transformSync(code, { minify: true, format: 'esm', loader: kind === 'css' ? 'css' : 'js' }).code,
  publicDir: 'public', // events.json, terms.html (plain static HTML)
  fetchFunction, // answers the data requests of pages rendered on the server (server-fetch.mjs)

  // Server side: each page's JSON endpoints and plain form posts (used by `agent-ui serve`).
  api: 'api.js',
});
