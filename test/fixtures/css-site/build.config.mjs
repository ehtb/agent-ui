// Test fixture: CSS imports shared by a subset of pages. Home and about import shared.css and the build must link it
// only to those two pages; other imports a different file. The shared file is large enough to survive minSharedChunkBytes.
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { frameworkBuildOptions } from '@ehtb/agent-ui/build/presets.mjs';

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default ({ dev = false, validator } = {}) => ({
  ...frameworkBuildOptions({ dev, validator, projectRoot }),
  outDir: '.output-css',
});
