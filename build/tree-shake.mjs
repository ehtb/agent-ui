// Stage 1c (optional): leave out what no page uses, with a tool the project plugs in (`treeShake` in build.config.mjs).
//
// The bundler has no JavaScript parser and the framework has no dependencies, so the part that needs to understand code, "this declaration
// is never used and calling it would do nothing", is the project's tool (esbuild: `esbuildTreeShake`, below). The part that needs to understand
// the module graph stays here, because only the bundler knows which names every page imports and how a module is wrapped:
//
//   1. Every module has a list of exports that something uses: the names the modules that import it bind, all of them for a namespace import,
//      for an entry and for a module a dynamic import() loads. The other exports are not needed.
//   2. The tool gets the module's code (no import or export statement: the bundler took those out) and the names that must stay, and returns
//      the code without the declarations nothing needs. What it cannot show to be harmless stays: a call at the top level of a module stays.
//   3. Imports that the remaining code no longer mentions are dropped, which makes more exports of the modules they came from unused. Steps 1 to 3
//      repeat until nothing changes (every pass starts again from the original code of the modules whose list changed, so the result does not
//      depend on the order).
//   4. A module with nothing left (no code, no export that is used, no stylesheet, no import it needs) and an import() target that nothing loads
//      any more are left out of the graph, and with them the chunks they would have made.
//
// Shaking is done once, on the whole graph, before chunks are planned: a module shared by several pages keeps what any of them uses.
import { BuildError, dynamicImportMarker, findModuleSyntax, moduleMarker } from './parse-module.mjs';
import { maskNonCode } from './strip.mjs';
import { decodeMappings } from './source-map.mjs';

// What the bundler writes for an import (parse-module.mjs): `const { a, b: c } = ⟦module:path⟧;`, `const ns = ⟦module:path⟧;` and
// `const name = ⟦module:path⟧.default;`.
const NAMED_IMPORT = /^const \{ (.*) \} = ⟦module:([^⟧]+)⟧;$/;
const DEFAULT_IMPORT = /^const ([\w$]+) = ⟦module:([^⟧]+)⟧\.default;$/;
const NAMESPACE_IMPORT = /^const ([\w$]+) = ⟦module:([^⟧]+)⟧;$/;
const DYNAMIC_MARKER = /⟦dynamic:([^⟧]+)⟧/g;
// The tool is given a call it cannot know in place of a marker, and the marker is put back: a dynamic import is an effect it must keep.
const DYNAMIC_CALL = /__agentUiDynamic__\((\d+)\)/g;
const FIX = "Write treeShake: esbuildTreeShake(esbuild), with import { esbuildTreeShake } from '@ehtb/agent-ui/build/tree-shake.mjs', or a function (code, { file, keep, sourceMap }) => code that returns the code without the top-level declarations it can show to be unused, keeping the names in keep";

const readImport = (statement, path) => {
  let found = DEFAULT_IMPORT.exec(statement);
  if (found) return { kind: 'default', local: found[1], path: found[2] };
  found = NAMED_IMPORT.exec(statement);
  if (found) {
    const bindings = found[1].split(',').map((entry) => {
      const [imported, local = imported] = entry.split(':').map((part) => part.trim());
      return { imported, local };
    });
    return { kind: 'named', bindings, path: found[2] };
  }
  found = NAMESPACE_IMPORT.exec(statement);
  if (found) return { kind: 'namespace', local: found[1], path: found[2] };
  throw new Error(`tree shaking: the import of ${path} is written in a form the bundler does not make: ${statement}. This is a bug in the bundler: report it`);
};

const writeImport = (record) => {
  const marker = moduleMarker(record.path);
  if (record.kind === 'default') return `const ${record.local} = ${marker}.default;`;
  if (record.kind === 'namespace') return `const ${record.local} = ${marker};`;
  return `const { ${record.bindings.map(({ imported, local }) => (imported === local ? imported : `${imported}: ${local}`)).join(', ')} } = ${marker};`;
};

// What the tool returned: the code, or { code, map } when the build asked for a source map.
const readShakeResult = (result, { path, sourceMap }) => {
  const where = `treeShake (module "${path}")`;
  if (result !== null && typeof result === 'object' && typeof result.then === 'function') {
    throw new BuildError(`${where}: returned a Promise. The build cannot wait here, so treeShake must be synchronous: call the tool's synchronous entry (esbuild: transformSync, not transform). ${FIX}`);
  }
  if (!sourceMap) {
    if (typeof result === 'string') return { code: result, map: null };
    throw new BuildError(`${where}: returned ${result === null ? 'null' : typeof result}, and with sourceMap: false it must return the code as a string. ${FIX}`);
  }
  if (result === null || typeof result !== 'object' || Array.isArray(result) || typeof result.code !== 'string') {
    throw new BuildError(`${where}: returned ${result === null ? 'null' : Array.isArray(result) ? 'an array' : typeof result}, and with sourceMap: true (sourceMaps is on) it must return { code, map }, the code and its source map. ${FIX}`);
  }
  let map = result.map;
  if (typeof map === 'string') {
    try {
      map = JSON.parse(map);
    } catch (error) {
      throw new BuildError(`${where}: "map" is a string but not JSON (${error.message}). Return the map as the tool gives it (esbuild: result.map)`);
    }
  }
  if (map === null || typeof map !== 'object' || map.version !== 3 || typeof map.mappings !== 'string') {
    throw new BuildError(`${where}: "map" must be a source map of version 3 (an object or its JSON, with "version": 3 and "mappings"). Ask the tool for one (esbuild: sourcemap: 'external') and return result.map`);
  }
  return { code: result.code, map };
};

// For every line of the code the tool returned, the line of the source file it came from (counted from 1), or null before the first mapped line.
// The code the tool was given starts at the module's own line, so a position of its map is a line of the source file.
const sourceLinesOf = (code, map, path) => {
  const segments = decodeMappings(map.mappings, `the source map of the tree shaking of ${path}`);
  let previous = null;
  return code.split('\n').map((_, index) => {
    const mapped = (segments[index] ?? []).find((segment) => segment.length > 1);
    if (mapped) previous = mapped[2] + 1;
    return previous;
  });
};

const WORD = /[A-Za-z_$][\w$]*/g;

export const shakeGraph = ({ graph, treeShake, sourceMaps = false }) => {
  const { modules, order, roots } = graph;
  // What each module imports, as the bundler read it: every pass starts from this, so what a module keeps depends only on the names that are used.
  const originalImports = new Map([...modules].map(([path, record]) => [path, record.importStatements.map((statement) => readImport(statement, path))]));
  // What each module imports now: the original list, replaced by the pruned one when the module has been shaken.
  const importsOf = new Map(originalImports);
  const shaken = new Map(); // path -> { body, lines, imports, exportedBindings, dynamicDependencies }
  const shakenFor = new Map(); // path -> the exports it was shaken to keep, as a key
  const rootPaths = new Set(roots.map((root) => root.path));

  // The exports of every module that the rest of the graph uses: a Set of names, or 'all'.
  const usedExports = () => {
    const used = new Map([...modules.keys()].map((path) => [path, rootPaths.has(path) ? 'all' : new Set()]));
    for (const imports of importsOf.values()) {
      for (const record of imports) {
        const names = used.get(record.path);
        if (names === 'all') continue;
        if (record.kind === 'namespace') used.set(record.path, 'all');
        else if (record.kind === 'default') names.add('default');
        else for (const { imported } of record.bindings) names.add(imported);
      }
    }
    return used;
  };

  const shakeModule = (path, record, exportNames) => {
    const keep = exportNames.map((name) => record.exportedBindings.get(name));
    // The marker of a dynamic import is not code a tool can read; the call stands in for it.
    const code = record.body.replace(DYNAMIC_MARKER, (marker, target) => `__agentUiDynamic__(${record.dynamicDependencies.indexOf(target)})`);
    // The code starts at its own line, so a tool's messages and its source map name the lines of the source file.
    const padded = '\n'.repeat(record.firstLine - 1) + code;
    let answer;
    try {
      answer = readShakeResult(treeShake(padded, { file: path, keep, sourceMap: sourceMaps }), { path, sourceMap: sourceMaps });
    } catch (error) {
      if (error instanceof BuildError) throw error;
      throw new BuildError(`treeShake (module "${path}"): ${String(error?.message ?? error).split('\n').slice(0, 6).join(' ')}. Fix the code at the line it names, or write the module so the tool can read it. ${FIX}`);
    }
    const returned = answer.code.replace(DYNAMIC_CALL, (call, index) => dynamicImportMarker(record.dynamicDependencies[Number(index)]));
    const leftover = findModuleSyntax(returned);
    if (leftover) throw new BuildError(`treeShake (module "${path}"): the code it returned has an import or export statement (line ${leftover.line}: ${leftover.text}). The bundler took those out of the code it gave; return only that code, without adding one`);
    const lines = answer.map ? sourceLinesOf(returned, answer.map, path) : null;
    const leadingLines = returned.slice(0, returned.length - returned.trimStart().length).split('\n').length - 1;
    const body = returned.trim();
    // What the code that is left mentions: an import it does not mention is not needed, and the exports that stay need theirs. A word that is
    // a property name or a local of the same name counts too, which can keep an import that is not needed but never drops one that is.
    const mentioned = new Set(maskNonCode(body).match(WORD) ?? []);
    for (const local of keep) mentioned.add(local);
    const imports = [];
    for (const imported of originalImports.get(path)) {
      if (imported.kind === 'named') {
        const bindings = imported.bindings.filter(({ local }) => mentioned.has(local));
        if (bindings.length) imports.push({ ...imported, bindings });
      } else if (mentioned.has(imported.local)) imports.push(imported);
    }
    return {
      body,
      lines: lines && lines.slice(leadingLines, leadingLines + body.split('\n').length),
      imports,
      exportedBindings: new Map(exportNames.map((name) => [name, record.exportedBindings.get(name)])),
      dynamicDependencies: record.dynamicDependencies.filter((target) => body.includes(dynamicImportMarker(target))),
    };
  };

  let changed = true;
  while (changed) {
    changed = false;
    const used = usedExports();
    for (const [path, record] of modules) {
      const names = used.get(path);
      const exportNames = [...record.exportedBindings.keys()].filter((name) => names === 'all' || names.has(name));
      const key = exportNames.join('\0');
      if (shakenFor.get(path) === key) continue;
      shakenFor.set(path, key);
      changed = true;
      const result = shakeModule(path, record, exportNames);
      shaken.set(path, result);
      importsOf.set(path, result.imports);
    }
  }

  // The graph that is left: the shaken records, minus modules with nothing in them.
  const records = new Map();
  for (const path of order) {
    const record = modules.get(path);
    const result = shaken.get(path);
    records.set(path, {
      ...record,
      body: result.body,
      firstLine: 1,
      lines: result.lines,
      importStatements: result.imports.map(writeImport),
      exportedBindings: result.exportedBindings,
      dynamicDependencies: result.dynamicDependencies,
      staticDependencies: [...record.staticDependencies],
    });
  }
  const bound = new Set();
  for (const imports of importsOf.values()) for (const record of imports) bound.add(record.path);
  const removed = new Set();
  for (const path of order) {
    const record = records.get(path);
    record.staticDependencies = record.staticDependencies.filter((dependency) => !removed.has(dependency));
    const empty = record.body === '' && record.exportedBindings.size === 0 && record.stylesheets.length === 0 && record.dynamicDependencies.length === 0 && record.staticDependencies.length === 0;
    if (empty && !rootPaths.has(path) && !bound.has(path)) removed.add(path);
  }
  for (const path of removed) records.delete(path);

  // An import() whose call was left out loads nothing: its target and what only it reaches are not part of the site.
  const reachable = new Set();
  const lazyTargets = new Set();
  const visit = (path) => {
    if (reachable.has(path)) return;
    reachable.add(path);
    const record = records.get(path);
    for (const dependency of record.staticDependencies) visit(dependency);
    for (const target of record.dynamicDependencies) {
      lazyTargets.add(target);
      visit(target);
    }
  };
  for (const root of roots) if (root.kind === 'entry') visit(root.path);
  const keptRoots = roots.filter((root) => root.kind === 'entry' || lazyTargets.has(root.path));
  const keptOrder = order.filter((path) => reachable.has(path));
  const keptModules = new Map(keptOrder.map((path) => [path, records.get(path)]));
  const bytes = (list, source) => list.reduce((sum, path) => sum + Buffer.byteLength(source.get(path).body), 0);
  return {
    ...graph,
    modules: keptModules,
    order: keptOrder,
    roots: keptRoots,
    treeShaking: { bytesBefore: bytes(order, modules), bytesAfter: bytes(keptOrder, keptModules), modulesBefore: order.length, modulesAfter: keptOrder.length },
  };
};

// The tool for `treeShake`: esbuild, which the project installs and passes in (the framework has no dependencies and never imports it).
//
//   import * as esbuild from 'esbuild';
//   import { esbuildTreeShake } from '@ehtb/agent-ui/build/tree-shake.mjs';
//   export default () => ({ treeShake: esbuildTreeShake(esbuild, { pure: ['defineElement'] }) });
//
// `pure` lists calls esbuild may drop when their result is unused (it knows a few built-ins; a call it does not know stays, and so does the
// declaration that holds its result). `/* @__PURE__ */` before a call says the same at the place.
const KEEP_CALL = '__agentUiKeep__';
export const esbuildTreeShake = (esbuild, { pure = [] } = {}) => {
  if (typeof esbuild?.transformSync !== 'function') throw new BuildError('esbuildTreeShake: the first argument must be the esbuild module (it has no transformSync). Write: import * as esbuild from \'esbuild\'; esbuildTreeShake(esbuild)');
  if (!Array.isArray(pure) || !pure.every((name) => typeof name === 'string' && name !== '')) throw new BuildError('esbuildTreeShake: pure must be a list of the names of calls that have no effect, for example pure: [\'defineElement\', \'Object.freeze\']');
  return (code, { file, keep, sourceMap }) => {
    // The names that stay are passed to a call at the end, which esbuild must keep: that is what makes them used, whatever the code is.
    const result = esbuild.transformSync(`${code}\n${KEEP_CALL}(${keep.join(', ')});\n`, {
      loader: 'js',
      treeShaking: true,
      pure,
      sourcefile: file,
      sourcemap: sourceMap ? 'external' : false,
      legalComments: 'none',
      logLevel: 'silent',
    });
    const cut = result.code.lastIndexOf(`${KEEP_CALL}(`);
    if (cut < 0 || !/^__agentUiKeep__\([^;]*\);\s*$/.test(result.code.slice(cut))) throw new Error(`esbuild did not keep the call that lists the names to keep (module ${file})`);
    const shaken = result.code.slice(0, cut);
    return sourceMap ? { code: shaken, map: result.map } : shaken;
  };
};
