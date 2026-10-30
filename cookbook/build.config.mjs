// The build configuration of the cookbook, a project like any other: `agent-ui check` in this folder renders every recipe.
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { frameworkBuildOptions } from '@ehtb/agent-ui/build/presets.mjs';
import { fetchFunction } from './server-fetch.mjs';

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default ({ dev = false, validator } = {}) => ({
  ...frameworkBuildOptions({ dev, validator, projectRoot }),
  publicDir: 'public',
  fetchFunction, // answers the data requests of pages rendered on the server (the async-list recipe)
});
