// Build configuration of this example. `agent-ui build` (and dev, serve) read it from the project root.
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { frameworkBuildOptions } from '@ehtb/agent-ui/build/presets.mjs';
import { fetchFunction } from './server-fetch.mjs';

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default ({ dev = false, validator } = {}) => ({
  ...frameworkBuildOptions({ dev, validator, projectRoot }),
  publicDir: 'public', // countries.json and regions/<code>.json: the lists the form fetches
  fetchFunction, // answers the same requests while the page is rendered on the server (server-fetch.mjs)
});
