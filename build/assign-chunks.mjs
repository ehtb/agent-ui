// Stage 2: decide which modules are bundled together into which chunk.
//
// Rules, in order:
//   1. manual chunks: modules matching a pattern in `manualChunks` go to the named chunk. Use this for code that
//      should be cached and loaded separately from the app (the agent-ui runtime is configured this way).
//   2. everything else is grouped by *who needs it* and *whose code it is*: every module is tagged with the set of roots
//      (entry pages and dynamic import() targets) that statically reach it, and with its layer: the framework (agent-ui's
//      own src/), one npm package, or the app. Modules with the same set and the same layer share one chunk:
//        - the root's own code              -> a chunk named after that root (e.g. "alpha", or "devtools" for a lazy chunk)
//        - app code of several roots        -> "shared-<roots>"
//        - framework code outside the core  -> "agent-ui-<roots>"
//        - a package                        -> "vendor-<package>" ("vendor-<package>-<roots>" when pages use different parts of it)
//      A page therefore loads exactly the code it uses, nothing more, and no module is ever duplicated. Because the layers are
//      separate files, an edit to the app changes neither the framework's chunks nor a package's, so those stay cached.
//   3. small chunks are folded into a bigger one. Grouping by the exact set of roots and the layer makes up to one chunk per
//      combination, so a site of many pages would download dozens of tiny files. A chunk that is not a root's own chunk and is
//      below `minSharedChunkBytes` (default 4096 bytes of source, JavaScript and CSS; 0 turns it off) joins a chunk whose roots
//      include all of its roots: one of the same layer if there is one, else one of the app's (never the framework's or a
//      package's, which only take in their own code), the one with the fewest roots, then the biggest. The pages that did not need that code download it too: a few kilobytes, in exchange for one request fewer. A
//      fold that would make the chunk graph cyclic is skipped.
//   4. the chunk graph must be acyclic (guaranteed for automatic chunks; checked for manual ones).
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BuildError } from './parse-module.mjs';
import { toPosixPath } from './import-path.mjs';

// The framework's own modules: everything below its src/, wherever the package is (installed, linked or this repository).
const frameworkSourceDirectory = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src'));

const globToRegExp = (pattern) =>
  new RegExp(
    '^' +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '\u0000')
        .replace(/\*/g, '[^/]*')
        .replace(/\u0000/g, '.*') +
      '$',
  );

// A file name made of root ids gets long on a site of many pages: past 48 characters the list is replaced by its hash.
const listName = (prefix, rootIds) => {
  const readable = `${prefix}-${rootIds.join('-')}`;
  return readable.length <= 48 ? readable : `${prefix}-${createHash('sha1').update(rootIds.join()).digest('hex').slice(0, 8)}`;
};
const packageChunkName = (packageName) => `vendor-${packageName.replace(/^@/, '').replace(/\//g, '-')}`;

export const DEFAULT_MIN_SHARED_CHUNK_BYTES = 4096;

export const assignChunks = (graph, { manualChunks = {}, minSharedChunkBytes = DEFAULT_MIN_SHARED_CHUNK_BYTES, projectRoot = graph.projectRoot ?? process.cwd() } = {}) => {
  const { modules, order, roots } = graph;

  // 1. Which roots statically reach each module?
  const rootsReaching = new Map(order.map((path) => [path, new Set()]));
  for (const root of roots) {
    const pending = [root.path];
    while (pending.length) {
      const path = pending.pop();
      if (rootsReaching.get(path).has(root.id)) continue;
      rootsReaching.get(path).add(root.id);
      pending.push(...modules.get(path).staticDependencies);
    }
  }

  // 2. Assign every module to a chunk.
  const chunks = new Map(); // name -> chunk
  const chunkNameOfModule = new Map();
  const assign = (path, name, reason, rootIds) => {
    if (!chunks.has(name)) chunks.set(name, { name, reason, rootIds, modulePaths: [] });
    chunks.get(name).modulePaths.push(path);
    chunkNameOfModule.set(path, name);
  };

  for (const [name, patterns] of Object.entries(manualChunks)) {
    if (roots.some((root) => root.id === name)) {
      throw new BuildError(`manual chunk "${name}" has the same name as an entry or lazy root. Rename it in manualChunks`);
    }
    const matchers = patterns.map(globToRegExp);
    for (const path of order) {
      if (!chunkNameOfModule.has(path) && matchers.some((matcher) => matcher.test(path))) {
        assign(path, name, 'manual', [...rootsReaching.get(path)].sort());
      }
    }
    // A pattern that matches no module is a typo or a moved file: the code would silently land in another chunk.
    patterns.forEach((pattern, position) => {
      if (!order.some((path) => matchers[position].test(path))) {
        throw new BuildError(`manualChunks "${name}": the pattern "${pattern}" matches no module in the build. Patterns are paths relative to the project root (for example "src/lib/**"); modules in this build include ${order.slice(0, 3).join(', ')}${order.length > 3 ? ', ...' : ''}`);
      }
    });
  }
  // The layer of a module: the framework, one npm package or the app (rule 2).
  const frameworkPrefix = `${toPosixPath(relative(graph.projectRoot ?? realpathSync(projectRoot), frameworkSourceDirectory))}/`;
  const layerOf = (path) => {
    if (path.startsWith(frameworkPrefix)) return { kind: 'framework', key: 'framework' };
    const packageName = modules.get(path).packageName;
    return packageName ? { kind: 'vendor', key: `package:${packageName}`, packageName } : { kind: 'app', key: 'app' };
  };
  const groups = new Map(); // layer and set of roots -> { layer, rootIds, modulePaths }
  for (const path of order) {
    if (chunkNameOfModule.has(path)) continue;
    const layer = layerOf(path);
    const rootIds = [...rootsReaching.get(path)].sort();
    const groupKey = `${layer.key}\u0000${rootIds.join('\u0000')}`;
    if (!groups.has(groupKey)) groups.set(groupKey, { layer, rootIds, modulePaths: [] });
    groups.get(groupKey).modulePaths.push(path);
  }
  // Names: a root's own chunk is the root's name; the others say whose code they hold and for which roots. Two sets that would
  // get the same name (["a-b", "c"] and ["a", "b-c"] both join to "a-b-c") get the hash of the set instead.
  const namesTaken = new Map([...chunks.keys()].map((name) => [name, `manual\u0000${name}`]));
  const uniqueName = (preferred, groupKey) => {
    let name = preferred;
    if (namesTaken.has(name) && namesTaken.get(name) !== groupKey) name = `${preferred.split('-')[0]}-${createHash('sha1').update(groupKey).digest('hex').slice(0, 8)}`;
    namesTaken.set(name, groupKey);
    return name;
  };
  const groupsOfPackage = new Map();
  for (const group of groups.values()) {
    if (group.layer.kind === 'vendor') groupsOfPackage.set(group.layer.packageName, (groupsOfPackage.get(group.layer.packageName) ?? 0) + 1);
  }
  const rootOwnGroups = new Set();
  for (const root of roots) {
    const rootPath = root.path;
    if (chunkNameOfModule.has(rootPath)) continue;
    rootOwnGroups.add(`${layerOf(rootPath).key}\u0000${root.id}`);
  }
  for (const [groupKey, { layer, rootIds, modulePaths }] of groups) {
    let name;
    let reason;
    let summary;
    if (rootIds.length === 1 && rootOwnGroups.has(groupKey)) {
      const root = roots.find((candidate) => candidate.id === rootIds[0]);
      name = rootIds[0];
      reason = root.kind === 'dynamic' ? 'lazy (dynamic import)' : 'entry';
    } else if (layer.kind === 'vendor') {
      name = groupsOfPackage.get(layer.packageName) === 1 ? packageChunkName(layer.packageName) : listName(packageChunkName(layer.packageName), rootIds);
      reason = `package ${layer.packageName}, used by ${rootIds.join(', ')}`;
      summary = `package ${layer.packageName}`;
    } else if (layer.kind === 'framework') {
      name = listName('agent-ui', rootIds);
      reason = `framework modules used by ${rootIds.join(', ')}`;
      summary = `the smaller framework code of ${rootIds.join(', ')}`;
    } else {
      name = listName('shared', rootIds);
      reason = `shared by ${rootIds.join(', ')}`;
      summary = `the smaller shared code of ${rootIds.join(', ')}`;
    }
    name = uniqueName(name, groupKey);
    for (const path of modulePaths) assign(path, name, reason, rootIds);
    Object.assign(chunks.get(name), { layer: layer.kind, foldable: summary !== undefined, summary });
  }

  // 2b. Fold small chunks into bigger ones (rule 3 above). CSS counts: a generated style module is a few bytes of
  // JavaScript around a stylesheet that can be large, and folding it into a chunk every page loads would lose the split.
  const cssBytes = new Map();
  const cssBytesOf = (path) => {
    if (!cssBytes.has(path)) cssBytes.set(path, Buffer.byteLength(readFileSync(resolve(projectRoot, path), 'utf8'), 'utf8'));
    return cssBytes.get(path);
  };
  const bytesOf = (chunk) => {
    const stylesheets = new Set();
    let bytes = 0;
    for (const path of chunk.modulePaths) {
      const record = modules.get(path);
      bytes += record.body.length;
      for (const stylesheet of record.stylesheets) stylesheets.add(stylesheet);
    }
    for (const stylesheet of stylesheets) bytes += cssBytesOf(stylesheet);
    return bytes;
  };
  const isAutomatic = (chunk) => chunk.reason !== 'manual';
  const hasChunkCycle = () => {
    const dependenciesOf = new Map([...chunks.keys()].map((name) => [name, new Set()]));
    for (const chunk of chunks.values()) {
      for (const path of chunk.modulePaths) {
        for (const dependency of [...modules.get(path).staticDependencies, ...modules.get(path).dynamicDependencies]) {
          const dependencyChunk = chunkNameOfModule.get(dependency);
          if (dependencyChunk !== chunk.name) dependenciesOf.get(chunk.name).add(dependencyChunk);
        }
      }
    }
    const done = new Set();
    const visiting = new Set();
    const visit = (name) => {
      if (done.has(name)) return false;
      if (visiting.has(name)) return true;
      visiting.add(name);
      const cyclic = [...dependenciesOf.get(name)].some(visit);
      visiting.delete(name);
      done.add(name);
      return cyclic;
    };
    return [...chunks.keys()].some(visit);
  };
  const positionInOrder = new Map(order.map((path, position) => [path, position]));
  // Two packages whose modules import each other's (no module cycle, but a cycle between the packages) cannot be two files:
  // the package code of the same roots then becomes one chunk.
  if (hasChunkCycle()) {
    const vendorChunksOfRoots = new Map();
    for (const chunk of chunks.values()) {
      if (chunk.layer !== 'vendor') continue;
      const key = chunk.rootIds.join('\u0000');
      vendorChunksOfRoots.set(key, [...(vendorChunksOfRoots.get(key) ?? []), chunk]);
    }
    for (const [key, together] of vendorChunksOfRoots) {
      if (together.length < 2) continue;
      const { rootIds } = together[0];
      const packages = together.map((chunk) => chunk.summary.replace(/^package /, ''));
      const name = uniqueName(listName('vendor', rootIds), `vendor\u0000${key}`);
      const merged = { name, reason: `packages ${packages.join(', ')}, used by ${rootIds.join(', ')} (one chunk: they import each other)`, rootIds, modulePaths: [], layer: 'vendor', foldable: true, summary: `packages ${packages.join(', ')}` };
      for (const chunk of together) {
        chunks.delete(chunk.name);
        merged.modulePaths.push(...chunk.modulePaths);
      }
      merged.modulePaths.sort((first, second) => positionInOrder.get(first) - positionInOrder.get(second));
      merged.modulePaths.forEach((path) => chunkNameOfModule.set(path, name));
      chunks.set(name, merged);
    }
  }
  if (minSharedChunkBytes > 0) {
    const small = [...chunks.values()].filter((chunk) => chunk.foldable && bytesOf(chunk) < minSharedChunkBytes).sort((first, second) => bytesOf(first) - bytesOf(second));
    for (const chunk of small) {
      // The list is computed once, but a chunk may have folded into another one since, or grown past the limit by taking one in:
      // a chunk that is no longer smaller than the limit stays as it is.
      if (chunks.get(chunk.name) !== chunk || bytesOf(chunk) >= minSharedChunkBytes) continue;
      // A chunk of the same layer, or else the app's: the framework's chunks and a package's never take in code of another layer,
      // so an edit to the app or an update of one package leaves them as they are (and cached).
      const preference = (other) => (other.layer === chunk.layer ? 0 : 1);
      const candidates = [...chunks.values()]
        .filter((other) => other !== chunk && isAutomatic(other) && (other.layer === chunk.layer || other.layer === 'app') && chunk.rootIds.every((id) => other.rootIds.includes(id)))
        .sort((first, second) => preference(first) - preference(second) || first.rootIds.length - second.rootIds.length || bytesOf(second) - bytesOf(first));
      for (const target of candidates) {
        const moved = chunk.modulePaths;
        moved.forEach((path) => chunkNameOfModule.set(path, target.name));
        target.modulePaths.push(...moved);
        chunks.delete(chunk.name);
        if (!hasChunkCycle()) {
          // A chunk runs its modules in the order it lists them: dependencies first, as in the graph (a package folded into the page
          // that imports it comes before the page's code).
          target.modulePaths.sort((first, second) => positionInOrder.get(first) - positionInOrder.get(second));
          target.reason = `${target.reason} (with ${chunk.summary})`;
          // A chunk that folded one in says so if it is folded into another later: the report keeps every chunk's name.
          if (target.summary) target.summary = `${target.summary} and ${chunk.summary}`;
          break;
        }
        // Undo: this fold would make two chunks import each other.
        target.modulePaths.splice(target.modulePaths.length - moved.length, moved.length);
        moved.forEach((path) => chunkNameOfModule.set(path, chunk.name));
        chunks.set(chunk.name, chunk);
      }
    }
  }
  // The manifest and the chunk report read these fields; the planning ones stay here.
  for (const chunk of chunks.values()) {
    delete chunk.layer;
    delete chunk.foldable;
    delete chunk.summary;
  }

  // 3. Chunk dependency graph and stylesheets.
  for (const chunk of chunks.values()) {
    chunk.staticDependencies = new Map(); // other chunk name -> Set of module paths imported from it
    chunk.dynamicDependencies = new Set(); // other chunk names loaded on demand
    chunk.stylesheets = [];
    for (const path of chunk.modulePaths) {
      const record = modules.get(path);
      for (const stylesheet of record.stylesheets) {
        if (!chunk.stylesheets.includes(stylesheet)) chunk.stylesheets.push(stylesheet);
      }
      for (const dependencyPath of record.staticDependencies) {
        const dependencyChunk = chunkNameOfModule.get(dependencyPath);
        if (dependencyChunk === chunk.name) continue;
        if (!chunk.staticDependencies.has(dependencyChunk)) chunk.staticDependencies.set(dependencyChunk, new Set());
        chunk.staticDependencies.get(dependencyChunk).add(dependencyPath);
      }
      for (const dynamicPath of record.dynamicDependencies) {
        const dynamicChunk = chunkNameOfModule.get(dynamicPath);
        if (dynamicChunk !== chunk.name) chunk.dynamicDependencies.add(dynamicChunk); // a module of the same chunk is not another file to fetch
      }
    }
  }

  // Dependencies first. A cycle would make cross-chunk imports (and content hashes) impossible.
  const chunkOrder = [];
  const state = new Map();
  const visitChunk = (name, trail) => {
    if (state.get(name) === 'done') return;
    if (state.get(name) === 'visiting') {
      const cycle = [...trail.slice(trail.indexOf(name)), name].join(' -> ');
      throw new BuildError(`chunk cycle: ${cycle}. Adjust manualChunks so shared code does not import app code.`);
    }
    state.set(name, 'visiting');
    const chunk = chunks.get(name);
    for (const dependency of [...chunk.staticDependencies.keys(), ...chunk.dynamicDependencies]) {
      visitChunk(dependency, [...trail, name]);
    }
    state.set(name, 'done');
    chunkOrder.push(name);
  };
  for (const name of chunks.keys()) visitChunk(name, []);

  // Chunks needed at startup by each entry page (its own chunk plus static dependencies, dependencies first).
  const staticClosure = (startName) => {
    const closure = [];
    const visit = (name) => {
      if (closure.includes(name)) return;
      for (const dependency of chunks.get(name).staticDependencies.keys()) visit(dependency);
      closure.push(name);
    };
    visit(startName);
    return closure;
  };
  const entryChunkNames = roots
    .filter((root) => root.kind === 'entry')
    .map((root) => chunkNameOfModule.get(root.path));
  const eagerChunkNames = new Set(entryChunkNames.flatMap(staticClosure));

  return { chunks, chunkNameOfModule, chunkOrder, staticClosure, eagerChunkNames };
};
