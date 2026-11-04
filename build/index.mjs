// The build pipeline as a library: `import { build, loadConfig } from '@ehtb/agent-ui/build'`. Node only, never part of a page.
// The package exports this entry point and the stages `build`, `config`, `presets` and `prerender`; the other stages are internal modules of the repository.
//
//   loadConfig            read and check build.config.mjs, find the pages below pages/ and write their generated modules
//   frameworkBuildOptions the runtime chunk, validator handling, minify and hash settings for both modes
//   build                 module graph -> chunks -> files on disk; returns the manifest
//   discoverPages         the pages below pages/ and their URLs
//   prerender             write the pages as static HTML files after a build (`agent-ui build --static`)
//   formatReport          the table `agent-ui build` prints
export { loadConfig, DEFAULT_OUT_DIR } from './config.mjs';
export { frameworkBuildOptions } from './presets.mjs';
export { build } from './build.mjs';
export { discoverPages } from './pages.mjs';
export { prerender } from './prerender.mjs';
export { formatReport } from './write-site.mjs';
