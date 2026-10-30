// A site with a shell, a page that waits for its data (`ready`) and one that does not. The tests copy this folder, so nothing here
// depends on examples/.
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { frameworkBuildOptions } from '@ehtb/agent-ui/build/presets.mjs';

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default ({ dev = false, validator } = {}) => ({
  ...frameworkBuildOptions({ dev, validator, projectRoot }),
  publicDir: 'public',
  // Answers the data requests of pages rendered on the server: files in public/.
  fetchFunction: async (url) => new Response(await readFile(join(projectRoot, 'public', new URL(url, 'http://localhost').pathname), 'utf8')),
});
