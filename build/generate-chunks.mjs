// Stage 3: turn the chunk plan into JavaScript and CSS files.
//
// Output is plain, readable ES modules (no minification: run any minifier you like over the output directory).
// Each source module becomes a function scope inside its chunk, so local names never collide and no renaming is needed:
//
//   import { module_ui } from "./agent-ui.3f2a9c1e.js";     // exports objects of modules living in other chunks
//   const module_app = (() => {
//     const { signal } = module_ui;                          // original import statements, rewritten
//     ...original module code, minus import/export keywords...
//     return { create, state };                              // original exports
//   })();
//   export { module_app };                                   // only what other chunks need
//
// Files get a content hash in their name (disabled with hash: false) so they can be cached forever. Hashing walks the
// chunks dependencies-first, because a chunk's content includes the final file names of the chunks it imports.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { stripCss, stripJavaScript } from './strip.mjs';
import { composeSourceMap, createSourceMap } from './source-map.mjs';
import { BuildError } from './parse-module.mjs';
import { didYouMean } from '../src/messages.js';

const contentHash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 8);
const sanitize = (name) => name.replace(/[^A-Za-z0-9_$]/g, '_');
const MARKER = /⟦(module|dynamic):([^⟧]+)⟧/g;

// minify: remove comments and layout whitespace (names are kept). transform(code, { file, kind, sourceMap }) runs afterwards and
// returns a replacement (plug in a real minifier here); kind is 'javascript' or 'css'.
// sourceMaps: every chunk keeps the lines of the modules in it (empty lines where a comment or an import was) and gets a
// `<file>.map` next to it, which says for each line of the chunk where it came from (build/source-map.mjs). With a transform,
// `sourceMap` is true for every JavaScript chunk and the transform returns { code, map }: its own map, from what it wrote to the
// chunk it was given, which the build follows back to the source files.
const TRANSFORM_FIX = "Write transform: (code, { kind, sourceMap }) => { const result = transformSync(code, { minify: true, format: 'esm', loader: kind === 'css' ? 'css' : 'js', sourcemap: sourceMap ? 'external' : false }); return sourceMap ? { code: result.code, map: result.map } : result.code; }";

export const readTransformResult = (result, { file, kind, sourceMap }) => {
  const where = `transform (${kind} of chunk "${file}")`;
  // An async transform (esbuild.transform rather than transformSync) answers a Promise, which reads like an object; say so instead
  // of complaining about its missing "code".
  if (result !== null && typeof result === 'object' && typeof result.then === 'function') {
    throw new BuildError(`${where}: returned a Promise. The build cannot wait here, so transform must be synchronous: call the minifier's synchronous entry (esbuild: transformSync, not transform). ${TRANSFORM_FIX}`);
  }
  if (!sourceMap) {
    if (typeof result === 'string') return { code: result, map: null };
    throw new BuildError(`${where}: returned ${result === null ? 'null' : typeof result}, and with sourceMap: false it must return the code as a string. ${TRANSFORM_FIX}`);
  }
  if (result === null || typeof result !== 'object' || Array.isArray(result)) {
    throw new BuildError(`${where}: returned ${result === null ? 'null' : typeof result}, and with sourceMap: true (sourceMaps is on) it must return { code, map }, the minifier's code and its source map. ${TRANSFORM_FIX}`);
  }
  for (const key of Object.keys(result)) {
    if (key !== 'code' && key !== 'map') throw new BuildError(`${where}: unknown key "${key}" in the result. ${didYouMean(key, ['code', 'map'])}Return { code, map } and nothing else`);
  }
  if (typeof result.code !== 'string') throw new BuildError(`${where}: "code" must be the minified code as a string. ${TRANSFORM_FIX}`);
  if (/^\/\/# sourceMappingURL=/m.test(result.code)) throw new BuildError(`${where}: the code ends with its own "//# sourceMappingURL=" comment. Have the minifier write no comment (esbuild: sourcemap: 'external'); the build adds the comment for the file it writes`);
  let map = result.map;
  if (typeof map === 'string') {
    try {
      map = JSON.parse(map);
    } catch (error) {
      throw new BuildError(`${where}: "map" is a string but not JSON (${error.message}). Return the map as the minifier gives it (esbuild: result.map) or as an object`);
    }
  }
  if (map === null || typeof map !== 'object' || map.version !== 3 || typeof map.mappings !== 'string') {
    throw new BuildError(`${where}: "map" must be a source map of version 3 (an object or its JSON, with "version": 3 and "mappings"). Ask the minifier for one (esbuild: sourcemap: 'external') and return result.map`);
  }
  if (Array.isArray(map.sources) && map.sources.length > 1) {
    throw new BuildError(`${where}: "map" names ${map.sources.length} sources, and a transform of one chunk has one input. Return the map of this transform only, with no input map of its own`);
  }
  return { code: result.code, map };
};

export const generateChunks = ({ projectRoot, graph, plan, hash = true, minify = false, transform = null, sourceMaps = false, cssOverrides = new Map() }) => {
  // The build's own maps cover JavaScript; a stylesheet is concatenated files and gets no map.
  const finish = (code, kind, chunkName) => {
    const input = minify ? (kind === 'css' ? stripCss(code) : stripJavaScript(code, { keepLines: sourceMaps })) : code;
    if (!transform) return { input, code: input, map: null };
    const sourceMap = sourceMaps && kind === 'javascript';
    return { input, ...readTransformResult(transform(input, { file: chunkName, kind, sourceMap }), { file: chunkName, kind, sourceMap }) };
  };
  const { modules, order } = graph;
  const { chunks, chunkNameOfModule, chunkOrder, eagerChunkNames } = plan;

  // A readable variable per module: module_ui for src/ui.js. On a clash, directory names are added until unique
  // (module_alpha_app and module_beta_app for alpha/app.js and beta/app.js).
  const variableOfModule = new Map();
  const usedVariables = new Set();
  for (const path of order) {
    const segments = path.slice(0, path.length - extname(path).length).split('/');
    let variable;
    for (let count = 1; count <= segments.length; count++) {
      variable = `module_${sanitize(segments.slice(-count).join('_'))}`;
      if (!usedVariables.has(variable)) break;
    }
    const base = variable;
    for (let suffix = 2; usedVariables.has(variable); suffix++) variable = `${base}_${suffix}`;
    usedVariables.add(variable);
    variableOfModule.set(path, variable);
  }

  // Which modules must a chunk export? Those imported by other chunks, plus targets of dynamic import().
  const exportedModulesOfChunk = new Map([...chunks.keys()].map((name) => [name, new Set()]));
  for (const chunk of chunks.values()) {
    for (const [dependencyChunk, paths] of chunk.staticDependencies) {
      for (const path of paths) exportedModulesOfChunk.get(dependencyChunk).add(path);
    }
    for (const path of chunk.modulePaths) {
      for (const dynamicPath of modules.get(path).dynamicDependencies) {
        exportedModulesOfChunk.get(chunkNameOfModule.get(dynamicPath)).add(dynamicPath);
      }
    }
  }

  const generated = new Map(); // chunk name -> { javascriptFile, javascript, stylesheetFile, stylesheet }

  const fileNameFor = (chunkName, extension, text) =>
    hash ? `${chunkName}.${contentHash(text)}${extension}` : `${chunkName}${extension}`;

  for (const chunkName of chunkOrder) {
    const chunk = chunks.get(chunkName);
    // `lines` is the text of the chunk in pieces; `origins` says, for each line of the chunk, which line of which module it is.
    const lines = [];
    const origins = [];
    const add = (text, origin = null) => {
      lines.push(text);
      text.split('\n').forEach((_, index) => origins.push(origin && { path: origin.path, line: origin.line + index }));
    };
    add(`// chunk: ${chunk.name} (${chunk.reason})`);

    // Stylesheet: concatenated in module order. Chunks that no page loads eagerly inject theirs when they load.
    let stylesheet = null;
    let stylesheetFile = null;
    if (chunk.stylesheets.length) {
      stylesheet = chunk.stylesheets
        .map((path) => `/* ${path} */\n${(cssOverrides.get(path) ?? readFileSync(resolve(projectRoot, path), 'utf8')).trim()}\n`)
        .join('\n');
      stylesheet = finish(stylesheet, 'css', chunk.name).code;
      stylesheetFile = fileNameFor(chunk.name, '.css', stylesheet);
      if (!eagerChunkNames.has(chunk.name)) {
        add(['document.head.append(Object.assign(document.createElement("link"), {', `  rel: "stylesheet", href: new URL("./${stylesheetFile}", import.meta.url).href,`, '}));'].join('\n'));
      }
    }

    for (const [dependencyChunk, paths] of chunk.staticDependencies) {
      const names = [...paths].map((path) => variableOfModule.get(path));
      const dependencyFile = generated.get(dependencyChunk).javascriptFile;
      add(`import { ${names.join(', ')} } from "./${dependencyFile}";`);
    }

    for (const path of chunk.modulePaths) {
      const record = modules.get(path);
      const exportList = [...record.exportedBindings].map(([exportedName, localName]) =>
        exportedName === localName ? exportedName : `${exportedName}: ${localName}`,
      );
      add(['', `// ---- ${path} ----`, `const ${variableOfModule.get(path)} = (() => {`, ...record.importStatements].join('\n'));
      add(record.body, { path, line: record.firstLine });
      add([exportList.length ? `return { ${exportList.join(', ')} };` : 'return {};', '})();'].join('\n'));
    }

    const exported = [...exportedModulesOfChunk.get(chunk.name)].map((path) => variableOfModule.get(path));
    if (exported.length) add(`\nexport { ${exported.join(', ')} };`);

    const { input, code: javascript, map: transformMap } = finish(
      lines
        .join('\n')
        .replace(MARKER, (marker, kind, modulePath) => {
          if (kind === 'module') return variableOfModule.get(modulePath);
          if (chunkNameOfModule.get(modulePath) === chunk.name) return `Promise.resolve(${variableOfModule.get(modulePath)})`; // a manual chunk that holds it: nothing to fetch
          const targetFile = generated.get(chunkNameOfModule.get(modulePath)).javascriptFile;
          return `import("./${targetFile}").then((chunk) => chunk.${variableOfModule.get(modulePath)})`;
        }) + '\n',
      'javascript',
      chunk.name,
    );

    const javascriptFile = fileNameFor(chunk.name, '.js', javascript);
    let sourceMap = null;
    if (sourceMaps) {
      const inputLines = input.split('\n').length - 1; // the text ends with a newline
      if (inputLines !== origins.length) throw new Error(`chunk ${chunk.name}: the output has ${inputLines} lines and the source map expects ${origins.length}. This is a bug in the bundler: report it with the module list ${chunk.modulePaths.join(', ')}`);
      const sources = Object.fromEntries(chunk.modulePaths.map((path) => [path, { text: modules.get(path).sourceText, file: modules.get(path).sourcePath }]));
      sourceMap = JSON.stringify(
        transformMap
          ? composeSourceMap({ file: javascriptFile, lines: origins, sources, map: transformMap })
          : createSourceMap({ file: javascriptFile, lines: origins, sources }),
      );
    }

    generated.set(chunkName, {
      javascriptFile,
      // The comment that points to the map comes after the name is fixed: the name is the hash of the code, and the map follows from the code.
      javascript: sourceMap ? `${javascript}${javascript.endsWith('\n') ? '' : '\n'}//# sourceMappingURL=${javascriptFile}.map\n` : javascript,
      sourceMap,
      stylesheetFile,
      stylesheet,
    });
  }
  return generated;
};
