// Resolves a bare import ("@ehtb/agent-ui", "@ehtb/agent-ui/router", "@scope/name/sub") to a file, the way Node does for ES
// modules, for the bundler. Supported: packages in a node_modules directory above the importing file, a package
// importing itself by name (needs an "exports" field), and the "exports" field with subpaths, one "*" wildcard and the
// "import"/"default" conditions. Not supported: "imports" (#private), "require" conditions, CommonJS.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { BuildError } from './parse-module.mjs';

export const splitSpecifier = (specifier) => {
  const parts = specifier.split('/');
  const nameLength = specifier.startsWith('@') ? 2 : 1;
  return { packageName: parts.slice(0, nameLength).join('/'), subpath: parts.length > nameLength ? `./${parts.slice(nameLength).join('/')}` : '.' };
};

// The directory of the package `packageName` as seen from `fromDirectory`: the nearest enclosing package that is
// `packageName` itself (with exports), or the nearest node_modules/<packageName>. Real path, symlinks resolved.
export const findPackageDirectory = (packageName, fromDirectory) => {
  for (let directory = resolve(fromDirectory); ; directory = dirname(directory)) {
    const ownManifest = join(directory, 'package.json');
    if (existsSync(ownManifest)) {
      const manifest = JSON.parse(readFileSync(ownManifest, 'utf8'));
      if (manifest.name === packageName && manifest.exports) return realpathSync(directory);
    }
    const installed = join(directory, 'node_modules', packageName);
    if (existsSync(join(installed, 'package.json'))) return realpathSync(installed);
    if (dirname(directory) === directory) return null;
  }
};

const CONDITIONS = ['import', 'default'];
const pickTarget = (target) => {
  if (typeof target === 'string') return target;
  if (Array.isArray(target)) return target.map(pickTarget).find(Boolean) ?? null;
  if (target && typeof target === 'object') {
    for (const condition of CONDITIONS) if (condition in target) return pickTarget(target[condition]);
  }
  return null;
};

const resolveExports = (exportsField, subpath) => {
  const isSubpathMap = exportsField && typeof exportsField === 'object' && !Array.isArray(exportsField) && Object.keys(exportsField).every((key) => key.startsWith('.'));
  const map = isSubpathMap ? exportsField : { '.': exportsField };
  if (subpath in map) return pickTarget(map[subpath]);
  for (const [key, target] of Object.entries(map)) {
    const star = key.indexOf('*');
    if (star < 0) continue;
    const prefix = key.slice(0, star);
    const suffix = key.slice(star + 1);
    if (subpath.startsWith(prefix) && subpath.endsWith(suffix) && subpath.length >= key.length - 1) {
      const resolved = pickTarget(target);
      return resolved && resolved.replace('*', subpath.slice(prefix.length, subpath.length - suffix.length));
    }
  }
  return null;
};

export const listExportedSubpaths = (manifest) => {
  const field = manifest.exports;
  if (!field || typeof field !== 'object' || Array.isArray(field)) return ['.'];
  return Object.keys(field).every((key) => key.startsWith('.')) ? Object.keys(field) : ['.'];
};

// Returns the absolute real path of the file the specifier names. Throws BuildError with the fix in the message.
export const resolvePackageImport = (specifier, importerPath, fromDirectory) => {
  if (specifier.startsWith('node:')) {
    throw new BuildError(`${importerPath}: "${specifier}" is a Node.js built-in and cannot be bundled for the browser. Move that code to a server-only module that no browser entry imports`);
  }
  const { packageName, subpath } = splitSpecifier(specifier);
  const directory = findPackageDirectory(packageName, fromDirectory);
  if (!directory) {
    throw new BuildError(`${importerPath}: cannot find package "${packageName}" (looked in node_modules directories above ${fromDirectory}). Install it with your package manager, or import a relative file`);
  }
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  let target;
  if (manifest.exports !== undefined) {
    target = resolveExports(manifest.exports, subpath);
    if (!target) {
      throw new BuildError(`${importerPath}: package "${packageName}" does not export "${subpath}" (import "${specifier}"). Exported: ${listExportedSubpaths(manifest).join(', ')}`);
    }
  } else {
    target = subpath === '.' ? (manifest.module ?? manifest.main ?? 'index.js') : subpath;
  }
  const file = resolve(directory, target);
  if (!file.startsWith(directory + sep) || !existsSync(file)) {
    throw new BuildError(`${importerPath}: package "${packageName}" maps "${subpath}" to "${target}", which does not exist inside the package. Report it to the package, or import a file it does export`);
  }
  return realpathSync(file);
};
