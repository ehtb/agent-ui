// Build configuration of this example. `agent-ui build` (and dev, serve, check) read it from the project root.
// The sources stay JavaScript, because the bundler reads JavaScript: TypeScript checks them as they are (`tsc -p .`, `checkJs` in
// tsconfig.json), with the types written in JSDoc and taken from the zod schemas (`z.infer`).
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { frameworkBuildOptions } from '@ehtb/agent-ui/build/presets.mjs';
import { fetchFunction } from './server-fetch.mjs';

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default ({ dev = false, validator } = {}) => {
  const options = frameworkBuildOptions({ dev, validator, projectRoot });
  return {
    ...options,
    // zod is written with re-exports, which the bundler does not read (docs/BUILD.md, "Vendor files"): where the source imports
    // 'zod/mini', a browser bundle gets vendor/zod.js, which `npm run vendor` makes from the package. Node and tsc use the package.
    replaceModules: { ...options.replaceModules, 'node_modules/zod/mini/index.js': 'vendor/zod.js' },
    api: 'api.js', // the endpoints under /api
    fetchFunction, // answers the data requests of pages rendered on the server, in process
  };
};
