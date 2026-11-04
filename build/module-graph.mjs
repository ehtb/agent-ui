// Stage 1b: load every module reachable from the entry files and put them in dependency order.
//
// Result:
//   projectRoot the real path every module path is relative to
//   modules  Map(path -> parsed module), with `sourcePath` (the file read) and `packageName` (the npm package it is part of, or null)
//   order    paths in an order where every module comes after the modules it imports (valid for all chunks)
//   roots    the places execution can start: one per entry page, one per dynamic import() target
//            [{ id, path, kind: 'entry' | 'dynamic' }]
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, extname, relative, resolve } from 'node:path';
import { BuildError, parseModule } from './parse-module.mjs';
import { findPackageDirectory, resolvePackageImport, splitSpecifier } from './resolve-package.mjs';
import { toPosixPath } from './import-path.mjs';
const SUPPORTED_EXTENSIONS = ['.js', '.mjs', '.css'];

// `replacements` maps a module path to another file whose source is used instead ({ 'src/validate.js': 'build/stubs/validate-omitted.js' }).
export const buildModuleGraph = ({ projectRoot: givenRoot, entries, replacements = {} }) => {
  // Real path, because package files are found by real path; module paths are relative to this root.
  const projectRoot = realpathSync(givenRoot);
  const modules = new Map();
  const order = [];
  const visitState = new Map(); // path -> 'visiting' | 'done'
  // Files of a package: what a bare specifier resolves to (also through a link, which has a real path outside node_modules)
  // and what those files import by relative path. Only they may use default imports and exports (parse-module.mjs).
  // The project importing itself by its own name is not a package: those files are the project's own.
  const projectDirectory = realpathSync(projectRoot);
  const packagePaths = new Set();
  const packageOfPath = new Map(); // module path -> the name of the npm package it belongs to (what assign-chunks.mjs splits by)

  const loadModule = (path) => {
    if (modules.has(path)) return modules.get(path);
    const absolutePath = resolve(projectRoot, path);
    const resolveImport = (specifier) => {
      // "./file.js" and "../file.js" are files; anything else names a package (node_modules, or this package itself).
      if (!specifier.startsWith('.')) {
        const resolved = toPosixPath(relative(projectRoot, resolvePackageImport(specifier, path, dirname(absolutePath))));
        if (!SUPPORTED_EXTENSIONS.includes(extname(resolved))) {
          throw new BuildError(`${path}: "${specifier}" resolves to ${resolved}, which is not a .js, .mjs or .css file. Import a .js, .mjs or .css file`);
        }
        const { packageName } = splitSpecifier(specifier);
        if (findPackageDirectory(packageName, dirname(absolutePath)) !== projectDirectory) {
          packagePaths.add(resolved);
          if (!packageOfPath.has(resolved)) packageOfPath.set(resolved, packageName);
        }
        return resolved;
      }
      const importedPath = toPosixPath(relative(projectRoot, resolve(dirname(absolutePath), specifier)));
      if (!SUPPORTED_EXTENSIONS.includes(extname(importedPath))) {
        throw new BuildError(`${path}: cannot import "${specifier}" (only .js, .mjs and .css files, with the extension). Write the extension, for example "./${specifier.replace(/^\.\//, '')}.js"`);
      }
      if (!existsSync(resolve(projectRoot, importedPath))) {
        throw new BuildError(`${path}: cannot find "${specifier}" (looked for ${importedPath}). Check the path, the extension and the spelling of the file name`);
      }
      if (packagePaths.has(path)) {
        packagePaths.add(importedPath);
        if (!packageOfPath.has(importedPath)) packageOfPath.set(importedPath, packageOfPath.get(path));
      }
      return importedPath;
    };
    const sourcePath = replacements[path] ?? path; // the file whose text is used: a replaced module is read from its replacement
    const record = { ...parseModule({ path, sourceText: readFileSync(resolve(projectRoot, sourcePath), 'utf8'), resolveImport, inPackage: packagePaths.has(path) }), sourcePath, packageName: packageOfPath.get(path) ?? null };
    modules.set(path, record);
    return record;
  };

  const visit = (path, trail) => {
    const state = visitState.get(path);
    if (state === 'done') return;
    if (state === 'visiting') {
      const cycle = [...trail.slice(trail.indexOf(path)), path].join(' -> ');
      throw new BuildError(`import cycle: ${cycle} (cycles are not supported: imports are bound once). Move what both modules need into a third module that they import`);
    }
    visitState.set(path, 'visiting');
    for (const dependency of loadModule(path).staticDependencies) visit(dependency, [...trail, path]);
    visitState.set(path, 'done');
    order.push(path);
  };

  const roots = [];
  const usedRootIds = new Set();
  const addRoot = (preferredId, path, kind) => {
    let id = preferredId;
    for (let suffix = 2; usedRootIds.has(id); suffix++) id = `${preferredId}-${suffix}`;
    usedRootIds.add(id);
    roots.push({ id, path, kind });
    visit(path, []);
  };

  for (const entry of entries) addRoot(entry.name, entry.path, 'entry');

  // Dynamic imports (found while loading) become extra roots, which may reveal more dynamic imports.
  for (let index = 0; index < order.length; index++) {
    for (const dynamicPath of modules.get(order[index]).dynamicDependencies) {
      if (!roots.some((root) => root.path === dynamicPath)) {
        addRoot(basename(dynamicPath, extname(dynamicPath)), dynamicPath, 'dynamic');
      }
    }
  }
  return { projectRoot, modules, order, roots };
};
