// The build pipeline: four small stages, each a plain function you can run and test on its own.
//
//   1. buildModuleGraph   read and parse every module reachable from the entries         (module-graph.mjs)
//   2. assignChunks       decide which modules are bundled together                      (assign-chunks.mjs)
//   3. generateChunks     emit readable ES module chunks and CSS files with hashed names (generate-chunks.mjs)
//   4. writeSite          write chunks, one HTML page per entry, manifest.json           (write-site.mjs)
//
// Minification is optional: `minify` strips comments and layout whitespace (names are never changed), and `transform` plugs in a real minifier.
// `sourceMaps` writes a `.map` file next to every chunk (build/source-map.mjs); it cannot be combined with `transform`.
import { dirname } from 'node:path';
import { buildModuleGraph } from './module-graph.mjs';
import { assignChunks } from './assign-chunks.mjs';
import { generateChunks } from './generate-chunks.mjs';
import { assertSafeOutputDirectory, writeSite } from './write-site.mjs';
import { findViewCodeInBrowserBundle } from './leak-check.mjs';
import { toArray } from '../src/spec-core.js';

export { assertSafeOutputDirectory };

export const build = (config) => {
  const {
    projectRoot,
    outDir = 'dist',
    assetsDir = 'assets',
    entries,
    manualChunks = {},
    minSharedChunkBytes,
    hash = true,
    publicDir = null,
    replaceModules = {},
    pages = [],
    configFile = null,
    minify = false,
    transform = null,
    sourceMaps = false,
    cssOverrides = new Map(),
    styleSources = [],
  } = config;
  // Entries are { name, path }: `path` is the browser entry module (build/pages.mjs generates them from the folders; tests may pass their own).
  const entryList = entries;
  if (!Array.isArray(entryList) || !entryList.length) throw new Error('no entries found');

  assertSafeOutputDirectory({ projectRoot, outDir, entryPaths: entryList.map((entry) => dirname(entry.path)), publicDirectories: toArray(publicDir) });
  const graph = buildModuleGraph({ projectRoot, entries: entryList, replacements: replaceModules });
  const plan = assignChunks(graph, { projectRoot, manualChunks, ...(minSharedChunkBytes !== undefined && { minSharedChunkBytes }) });
  const generated = generateChunks({ projectRoot, graph, plan, hash, minify, transform, sourceMaps, cssOverrides });
  const manifest = writeSite({ projectRoot, outDir, assetsDir, graph, plan, generated, publicDir, alsoStamped: [...pages.map((page) => page.viewFile), ...styleSources, configFile].filter(Boolean) });
  // Not written to manifest.json: what the build says about itself, printed by formatReport.
  return { ...manifest, warnings: findViewCodeInBrowserBundle(graph) };
};
