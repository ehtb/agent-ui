// Stage 4: write the output directory.
//
//   <outDir>/<entry>.html            one page per entry: stylesheet links, modulepreload hints, one module script
//                                    (the page "/" is index.html, so a static host serves it for the site's root)
//   <outDir>/<assetsDir>/*.js|*.css  the chunks (hashed file names, safe to cache forever)
//   <outDir>/manifest.json           machine-readable description of pages and chunks (for agents and deploy scripts)
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { escapeAttribute } from '../src/html-escape.js';
import { toArray } from '../src/spec-core.js';
import { fail } from '../src/messages.js';
import { BASE_PATH_ADVICE, isBasePath } from '../src/base-path-checks.js';
import { APP_ELEMENT_ID } from '../src/hydrate.js';
import { moduleScriptHtml, stylesheetLinkHtml } from '../src/document-markup.js';
import { PAGES_DIRECTORY } from './pages.mjs';
import { stampSources } from './stamp.mjs';

const escapeHtml = escapeAttribute;

// Plain recursive copy (read + write), so it behaves the same on every file system.
const copyDirectory = (sourceDirectory, targetDirectory) => {
  mkdirSync(targetDirectory, { recursive: true });
  for (const item of readdirSync(sourceDirectory, { withFileTypes: true })) {
    const source = join(sourceDirectory, item.name);
    const target = join(targetDirectory, item.name);
    // A link would publish whatever it points at, wherever that is. Copy the file itself into the folder instead.
    if (item.isSymbolicLink()) throw new Error(`publicDir: ${source} is a symbolic link. The folder is copied into the site as it is, and a link would publish the file it points to, which may be outside the project. Put the file itself in the folder`);
    if (item.isDirectory()) copyDirectory(source, target);
    else writeFileSync(target, readFileSync(source));
  }
};

// Every page has the same body: the mount point of the app. The page itself comes from the page's spec.
const PAGE_BODY = `<div id="${APP_ELEMENT_ID}"></div>`;

// `writeSite` (and so `build`) deletes the output directory before writing it. Refuse any directory that is not plainly a build output: the
// project root or something outside it, a directory that holds the project's sources, data or package.json.
export const assertSafeOutputDirectory = ({ projectRoot, outDir, entryPaths, publicDirectories }) => {
  const root = resolve(projectRoot);
  const output = resolve(root, outDir);
  const inside = relative(root, output);
  const refuse = (problem) => {
    throw new Error(`outDir "${outDir}" ${problem}. The build deletes its output directory first, so use a directory only the build writes to, such as "dist"`);
  };
  if (inside === '' || inside === '..' || inside.startsWith('../') || inside.startsWith('..\\') || isAbsolute(inside)) refuse('is the project root or outside it');
  const covers = (path) => {
    const relativePath = relative(output, resolve(root, path));
    return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
  };
  const source = [...entryPaths, PAGES_DIRECTORY, ...publicDirectories].find(covers);
  if (source) refuse(`contains "${source}", which the build reads`);
  if (existsSync(join(output, 'package.json')) || existsSync(join(output, 'build.config.mjs'))) refuse('contains a package.json or build.config.mjs, so it is a project and not a build output');
};

export const writeSite = ({ projectRoot, outDir, assetsDir, basePath = '', graph, plan, generated, publicDir = null, alsoStamped = [] }) => {
  if (!isBasePath(basePath)) fail('writeSite', `basePath ${JSON.stringify(basePath)} is not allowed`, BASE_PATH_ADVICE);
  const outputDirectory = resolve(projectRoot, outDir);
  // Also checked here, so code that imports writeSite directly is protected like the CLI.
  assertSafeOutputDirectory({ projectRoot, outDir, entryPaths: [...graph.roots.filter((root) => root.kind === 'entry').map((root) => dirname(root.path)), ...graph.modules.keys()], publicDirectories: toArray(publicDir) });
  rmSync(outputDirectory, { recursive: true, force: true });
  mkdirSync(join(outputDirectory, assetsDir), { recursive: true });
  // Static files (data, images, ...) are copied as they are to the output root, next to the pages.
  for (const directory of toArray(publicDir)) {
    if (existsSync(resolve(projectRoot, directory))) copyDirectory(resolve(projectRoot, directory), outputDirectory);
  }

  const writeAsset = (fileName, text) => writeFileSync(join(outputDirectory, assetsDir, fileName), text);
  // Asset URLs are root-absolute: a page such as /product/3 is served below a path, and a relative URL would break there. A site
  // below a base path (src/base-path.js) has the base in front of them.
  const assetUrl = (fileName) => `${basePath}/${assetsDir}/${fileName}`;
  const sizeOf = (text) => ({ bytes: Buffer.byteLength(text), gzipBytes: gzipSync(text).length });

  const chunkReport = {};
  const stylesheetBytes = new Map(); // asset URL -> sizeOf, for the per-page CSS total
  for (const [name, output] of generated) {
    const chunk = plan.chunks.get(name);
    writeAsset(output.javascriptFile, output.javascript);
    if (output.stylesheet) {
      writeAsset(output.stylesheetFile, output.stylesheet);
      stylesheetBytes.set(assetUrl(output.stylesheetFile), sizeOf(output.stylesheet));
    }
    if (output.sourceMap) writeAsset(`${output.javascriptFile}.map`, output.sourceMap);
    chunkReport[name] = {
      reason: chunk.reason,
      javascript: assetUrl(output.javascriptFile),
      ...(output.sourceMap && { sourceMap: assetUrl(`${output.javascriptFile}.map`) }),
      ...(output.stylesheet && { stylesheet: assetUrl(output.stylesheetFile), stylesheetSources: chunk.stylesheets }),
      modules: chunk.modulePaths,
      // The source size of each module, in bytes (after import rewriting, before stripping or minifying): what each file costs
      // inside its chunk. A module is always included whole (no tree shaking), so this is also what importing it adds.
      moduleSizes: Object.fromEntries(chunk.modulePaths.map((path) => [path, Buffer.byteLength(graph.modules.get(path).body)])),
      loadsEagerly: plan.eagerChunkNames.has(name),
      imports: [...chunk.staticDependencies.keys()],
      lazyImports: [...chunk.dynamicDependencies],
      size: sizeOf(output.javascript),
      ...(output.stylesheet && { stylesheetSize: sizeOf(output.stylesheet) }),
    };
  }

  // Chunks a page may fetch later: dynamic imports of its startup chunks, and (recursively) of those chunks.
  const lazyChunksOf = (startupChunkNames) => {
    const lazy = [];
    const pending = startupChunkNames.flatMap((name) => [...plan.chunks.get(name).dynamicDependencies]);
    while (pending.length) {
      const name = pending.shift();
      if (startupChunkNames.includes(name) || lazy.includes(name)) continue;
      lazy.push(name);
      pending.push(...plan.chunks.get(name).dynamicDependencies);
    }
    return lazy;
  };

  const pages = {};
  for (const root of graph.roots.filter((candidate) => candidate.kind === 'entry')) {
    const entryChunk = plan.chunkNameOfModule.get(root.path);
    const loadOrder = plan.staticClosure(entryChunk); // dependencies first, entry chunk last
    const stylesheets = loadOrder.map((name) => generated.get(name).stylesheetFile).filter(Boolean);
    const preloads = loadOrder.filter((name) => name !== entryChunk);
    const title = escapeHtml(`${root.id} - agent-ui`);
    const html = [
      '<!doctype html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      `<title>${title}</title>`,
      ...stylesheets.map((file) => stylesheetLinkHtml(assetUrl(file))),
      ...preloads.map((name) => `<link rel="modulepreload" href="${assetUrl(generated.get(name).javascriptFile)}">`),
      '</head>',
      '<body>',
      PAGE_BODY,
      moduleScriptHtml(assetUrl(generated.get(entryChunk).javascriptFile)),
      '</body>',
      '</html>',
      '',
    ].join('\n');
    writeFileSync(join(outputDirectory, `${root.id}.html`), html);
    const stylesheetUrls = stylesheets.map(assetUrl);
    pages[root.id] = {
      html: `${root.id}.html`,
      entryChunk,
      chunksLoadedAtStartup: loadOrder,
      lazyChunks: lazyChunksOf(loadOrder),
      stylesheets: stylesheetUrls,
      stylesheetsSize: stylesheetUrls.reduce((total, url) => {
        const size = stylesheetBytes.get(url);
        return size ? { bytes: total.bytes + size.bytes, gzipBytes: total.gzipBytes + size.gzipBytes } : total;
      }, { bytes: 0, gzipBytes: 0 }),
    };
    // What a first visit downloads before the page runs: the JavaScript loaded at startup and the stylesheets (each file gzipped on
    // its own, as a server sends it). What `budgets.pageGzipBytes` limits.
    const javascriptSize = loadOrder.reduce((total, name) => ({ bytes: total.bytes + chunkReport[name].size.bytes, gzipBytes: total.gzipBytes + chunkReport[name].size.gzipBytes }), { bytes: 0, gzipBytes: 0 });
    pages[root.id].startupSize = { bytes: javascriptSize.bytes + pages[root.id].stylesheetsSize.bytes, gzipBytes: javascriptSize.gzipBytes + pages[root.id].stylesheetsSize.gzipBytes };
  }

  // What the build was made from, so `agent-ui serve` can tell that the sources moved on (build/stamp.mjs).
  // The graph holds the JavaScript modules; a stylesheet import is filed under the module's `stylesheets` and never visited as a module. The view
  // of a page is not in the graph either (the spec ships as data), nor is the configuration: `alsoStamped` names those. An edit to any of them makes the build stale.
  const records = [...graph.modules.values()];
  const modules = records.map((record) => record.sourcePath);
  const stylesheets = records.flatMap((record) => record.stylesheets);
  const named = alsoStamped.filter((file) => existsSync(resolve(projectRoot, file)));
  const sourceFiles = [...new Set([...modules, ...stylesheets, ...named])];
  const manifest = { pages, chunks: chunkReport, assetsDir, basePath, sources: { files: sourceFiles, hash: stampSources(projectRoot, sourceFiles) } };
  writeFileSync(join(outputDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
};

// Human-readable summary of the chunk layout, for the build log.
export const formatReport = (manifest) => {
  const lines = ['chunk                     js size  (gzip)   css      loads     reason / modules'];
  for (const [name, chunk] of Object.entries(manifest.chunks)) {
    const css = chunk.stylesheetSize ? `${chunk.stylesheetSize.bytes}B` : '-';
    lines.push(
      [
        name.padEnd(25),
        `${chunk.size.bytes}B`.padStart(7),
        `(${chunk.size.gzipBytes}B)`.padStart(8),
        css.padStart(8),
        (chunk.loadsEagerly ? 'startup' : 'on demand').padEnd(9),
        `${chunk.reason}: ${chunk.modules.join(', ')}`,
      ].join(' '),
    );
  }
  lines.push('', 'page                      startup (gzip)   js + css loaded before the page runs');
  for (const [name, page] of Object.entries(manifest.pages)) lines.push([name.padEnd(25), `${page.startupSize.bytes}B`.padStart(7), `(${page.startupSize.gzipBytes}B)`.padStart(8), `  ${page.chunksLoadedAtStartup.join(', ')}`].join(' '));
  for (const warning of manifest.warnings ?? []) lines.push(`\nwarning: ${warning}`);
  return lines.join('\n');
};
