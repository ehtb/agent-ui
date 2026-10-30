// Build configuration of this example. `agent-ui build` (and dev, serve, check) read it from the project root.
// A function of the build mode returning options; the framework's own settings come from frameworkBuildOptions.
// Which pages exist is not configured: pages/page.js is the page "/".
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { frameworkBuildOptions } from '@ehtb/agent-ui/build/presets.mjs';

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default ({ dev = false, validator } = {}) => ({
  ...frameworkBuildOptions({ dev, validator, projectRoot }),
});
