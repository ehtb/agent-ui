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
import { createSourceMap } from './source-map.mjs';
import { BuildError } from './parse-module.mjs';

const contentHash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 8);
const sanitize = (name) => name.replace(/[^A-Za-z0-9_$]/g, '_');
const MARKER = /⟦(module|dynamic):([^⟧]+)⟧/g;

// minify: remove comments and layout whitespace (names are kept). transform(code, { file, kind }) runs afterwards and may
// return a replacement (plug in a real minifier here); kind is 'javascript' or 'css'.
// sourceMaps: every chunk keeps the lines of the modules in it (empty lines where a comment or an import was) and gets a
// `<file>.map` next to it, which says for each line of the chunk where it came from (build/source-map.mjs).
export const generateChunks = ({ projectRoot, graph, plan, hash = true, minify = false, transform = null, sourceMaps = false, cssOverrides = new Map() }) => {
  if (sourceMaps && transform) throw new BuildError('sourceMaps cannot be combined with transform: the map describes the lines this build writes, and a minifier rewrites them. Turn sourceMaps off and have the minifier write its own map');
  const finish = (code, kind, chunkName) => {
    const reduced = minify ? (kind === 'css' ? stripCss(code) : stripJavaScript(code, { keepLines: sourceMaps })) : code;
    return transform ? transform(reduced, { file: chunkName, kind }) : reduced;
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
      stylesheet = finish(stylesheet, 'css', chunk.name);
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

    const javascript = finish(
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
      const outputLines = javascript.split('\n').length - 1; // the text ends with a newline
      if (outputLines !== origins.length) throw new Error(`chunk ${chunk.name}: the output has ${outputLines} lines and the source map expects ${origins.length}. This is a bug in the bundler: report it with the module list ${chunk.modulePaths.join(', ')}`);
      const sources = Object.fromEntries(chunk.modulePaths.map((path) => [path, { text: modules.get(path).sourceText, file: modules.get(path).sourcePath }]));
      sourceMap = JSON.stringify(createSourceMap({ file: javascriptFile, lines: origins, sources }));
    }

    generated.set(chunkName, {
      javascriptFile,
      // The comment that points to the map comes after the name is fixed: the name is the hash of the code, and the map follows from the code.
      javascript: sourceMap ? `${javascript}//# sourceMappingURL=${javascriptFile}.map\n` : javascript,
      sourceMap,
      stylesheetFile,
      stylesheet,
    });
  }
  return generated;
};
