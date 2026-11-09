// Build configuration of the documentation site. The site is a normal agent-ui project: pages live in folders, the
// build writes the JavaScript and CSS, and `--static` renders every page at build time. GitHub Pages serves the output
// below https://ehtb.github.io/agent-ui/, so the base path is the repository name.
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { frameworkBuildOptions } from '@ehtb/agent-ui/build/presets.mjs';
import { fetchFunction } from './server-fetch.mjs';

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default ({ dev = false, validator } = {}) => ({
  ...frameworkBuildOptions({ dev, validator, projectRoot }),
  basePath: '/agent-ui',
  publicDir: 'public',
  fetchFunction,
});
