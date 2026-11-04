// The build pipeline: four small stages, each a plain function you can run and test on its own.
//
//   1. buildModuleGraph   read and parse every module reachable from the entries         (module-graph.mjs)
//   2. assignChunks       decide which modules are bundled together                      (assign-chunks.mjs)
//   3. generateChunks     emit readable ES module chunks and CSS files with hashed names (generate-chunks.mjs)
//   4. writeSite          write chunks, one HTML page per entry, manifest.json           (write-site.mjs)
//
// Minification is optional: `minify` strips comments and layout whitespace (names are never changed), and `transform` plugs in a real minifier.
// `sourceMaps` writes a `.map` file next to every chunk (build/source-map.mjs); with a `transform`, the transform returns its own map
// and the build follows it back to the source files.
import { dirname } from 'node:path';
import { buildModuleGraph } from './module-graph.mjs';
import { assignChunks } from './assign-chunks.mjs';
import { generateChunks } from './generate-chunks.mjs';
import { assertSafeOutputDirectory, writeSite } from './write-site.mjs';
import { findViewCodeInBrowserBundle } from './leak-check.mjs';
import { toArray } from '../src/spec-core.js';
import { BuildError } from './parse-module.mjs';
import { fail } from '../src/messages.js';
import { BASE_PATH_ADVICE, isBasePath } from '../src/base-path-checks.js';

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
    basePath = '',
    budgets = {},
  } = config;
  if (!isBasePath(basePath)) fail('build', `basePath ${JSON.stringify(basePath)} is not allowed`, BASE_PATH_ADVICE);
  // Entries are { name, path }: `path` is the browser entry module (build/pages.mjs generates them from the folders; tests may pass their own).
  const entryList = entries;
  if (!Array.isArray(entryList) || !entryList.length) throw new Error('no entries found');

  assertSafeOutputDirectory({ projectRoot, outDir, entryPaths: entryList.map((entry) => dirname(entry.path)), publicDirectories: toArray(publicDir) });
  const graph = buildModuleGraph({ projectRoot, entries: entryList, replacements: replaceModules });
  const plan = assignChunks(graph, { projectRoot, manualChunks, ...(minSharedChunkBytes !== undefined && { minSharedChunkBytes }) });
  const generated = generateChunks({ projectRoot, graph, plan, hash, minify, transform, sourceMaps, cssOverrides });
  const manifest = writeSite({ projectRoot, outDir, assetsDir, basePath, graph, plan, generated, publicDir, alsoStamped: [...pages.map((page) => page.viewFile), ...styleSources, configFile].filter(Boolean) });
  // A page that downloads more than the budget before it runs fails the build, after the site is written, so the report and the
  // manifest are there to read (which chunk is heavy).
  if (budgets.pageGzipBytes !== undefined) {
    const over = Object.entries(manifest.pages).filter(([, page]) => page.startupSize.gzipBytes > budgets.pageGzipBytes);
    if (over.length) {
      const kilobytes = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
      throw new BuildError(`budgets.pageGzipBytes: ${over.map(([name, page]) => `page "${name}" loads ${kilobytes(page.startupSize.gzipBytes)} gzip at startup (${page.chunksLoadedAtStartup.join(', ')})`).join('; ')}, over the budget of ${kilobytes(budgets.pageGzipBytes)}. Read the chunk report: load a heavy module with import() where it is used, move code a page does not need out of its imports, or raise the budget`);
    }
  }
  // Not written to manifest.json: what the build says about itself, printed by formatReport.
  return { ...manifest, warnings: findViewCodeInBrowserBundle(graph) };
};
