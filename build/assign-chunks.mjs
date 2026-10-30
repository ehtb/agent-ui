// Stage 2: decide which modules are bundled together into which chunk.
//
// Rules, in order:
//   1. manual chunks: modules matching a pattern in `manualChunks` go to the named chunk. Use this for code that
//      should be cached and loaded separately from the app (the agent-ui runtime is configured this way).
//   2. everything else is grouped by *who needs it*: every module is tagged with the set of roots (entry pages and
//      dynamic import() targets) that statically reach it, and modules with the same set share one chunk.
//        - needed by one root        -> a chunk named after that root (e.g. "alpha", or "devtools" for a lazy chunk)
//        - needed by several roots   -> a "shared-..." chunk, so the code is downloaded once and cached
//      A page therefore loads exactly the code it uses, nothing more, and no module is ever duplicated.
//   3. small shared chunks are folded into a bigger one. Grouping by the exact set of roots makes up to one chunk per
//      combination of pages, so a site of many pages would download dozens of tiny files. A shared chunk below
//      `minSharedChunkBytes` (default 4096 bytes of source, JavaScript and CSS; 0 turns it off) joins the smallest shared
//      chunk whose pages include all of its pages. The pages that did not need that code download it too: a few kilobytes,
//      in exchange for one request fewer. A fold that would make the chunk graph cyclic is skipped.
//   4. the chunk graph must be acyclic (guaranteed for automatic chunks; checked for manual ones).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BuildError } from './parse-module.mjs';

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

const sharedChunkName = (rootIds) => {
  const readable = `shared-${rootIds.join('-')}`;
  return readable.length <= 48 ? readable : `shared-${createHash('sha1').update(rootIds.join()).digest('hex').slice(0, 8)}`;
};
// The same name for two different sets of roots (["a-b", "c"] and ["a", "b-c"] both join to "a-b-c") gets the hash of the set instead.
const uniqueSharedChunkName = (rootIds, namesTaken) => {
  const setKey = rootIds.join('\u0000');
  let name = sharedChunkName(rootIds);
  if (namesTaken.has(name) && namesTaken.get(name) !== setKey) name = `shared-${createHash('sha1').update(setKey).digest('hex').slice(0, 8)}`;
  namesTaken.set(name, setKey);
  return name;
};

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
  const sharedNamesTaken = new Map(); // shared chunk name -> the set of roots it is for
  for (const path of order) {
    if (chunkNameOfModule.has(path)) continue;
    const rootIds = [...rootsReaching.get(path)].sort();
    if (rootIds.length === 1) {
      const root = roots.find((candidate) => candidate.id === rootIds[0]);
      assign(path, rootIds[0], root.kind === 'dynamic' ? 'lazy (dynamic import)' : 'entry', rootIds);
    } else {
      assign(path, uniqueSharedChunkName(rootIds, sharedNamesTaken), `shared by ${rootIds.join(', ')}`, rootIds);
    }
  }

  // 2b. Fold small shared chunks into bigger ones (rule 3 above). CSS counts: a generated style module is a few bytes of
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
  const isAutomaticShared = (chunk) => chunk.reason.startsWith('shared by');
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
  if (minSharedChunkBytes > 0) {
    const small = [...chunks.values()].filter((chunk) => isAutomaticShared(chunk) && bytesOf(chunk) < minSharedChunkBytes).sort((first, second) => bytesOf(first) - bytesOf(second));
    for (const chunk of small) {
      const candidates = [...chunks.values()]
        .filter((other) => other !== chunk && isAutomaticShared(other) && chunk.rootIds.every((id) => other.rootIds.includes(id)))
        .sort((first, second) => first.rootIds.length - second.rootIds.length || bytesOf(second) - bytesOf(first));
      for (const target of candidates) {
        const moved = chunk.modulePaths;
        moved.forEach((path) => chunkNameOfModule.set(path, target.name));
        target.modulePaths.push(...moved);
        chunks.delete(chunk.name);
        if (!hasChunkCycle()) {
          target.reason = `${target.reason} (with the smaller shared code of ${chunk.rootIds.join(', ')})`;
          break;
        }
        // Undo: this fold would make two chunks import each other.
        target.modulePaths.length -= moved.length;
        moved.forEach((path) => chunkNameOfModule.set(path, chunk.name));
        chunks.set(chunk.name, chunk);
      }
    }
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
