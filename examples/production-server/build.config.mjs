// Build configuration of this example. `agent-ui build` writes the site to dist/; server.mjs serves it without any
// third-party dependency and renders every page per request. public/ holds a file that keeps its name (robots.txt), so
// the server answers it with an ETag instead of an immutable cache.
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { frameworkBuildOptions } from '@ehtb/agent-ui/build/presets.mjs';

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default ({ dev = false, validator } = {}) => ({
  ...frameworkBuildOptions({ dev, validator, projectRoot }),
  publicDir: 'public',
});
