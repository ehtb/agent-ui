// Stage 1a: parse one source module into a record the bundler can transform.
//
// The bundler understands a deliberately small dialect of ES modules, so that it needs no JavaScript parser and
// every limitation is a clear error instead of a silent miscompile:
//   import './file.js';                          side-effect import
//   import './file.css';                         stylesheet (extracted into a .css file per chunk)
//   import { a, b as c } from './file.js';       named imports (may span lines)
//   import * as namespace from './file.js';      namespace import
//   import('./file.js')                          dynamic import with a string literal (becomes a lazy chunk)
//   export const|function|class name ...         export declarations
//   export { a, b as c };                        export list
// Only in files of a package (reached by a package import or from a file of one, module-graph.mjs; the project's own files keep the one form above):
//   import name from './file.js';                default import (also `import name, { a } from`, `import name, * as ns from`)
//   export default expression;                   default export (a named function or class declaration keeps its name)
// Not supported (reported with the file name): default imports/exports in the project's own files, `export * from`,
// re-exports, `export let/var` (imports are bound once, so exported bindings must not be reassigned), destructuring
// exports, bare specifiers that cannot be resolved to a package file (see resolve-package.mjs), and import cycles.
// Statements must start at the beginning of a line.
// Comments, strings, template literals and regular expressions are skipped when statements are looked for.

import { maskNonCode } from './strip.mjs';

export class BuildError extends Error {}

const IMPORT_STATEMENT = /^import\s*(?:(\*\s*as\s+([\w$]+)|\{([^}]*)\})\s*from\s*)?(['"])([^'"\n]+)\4[ \t]*;?[ \t]*$/gm;
const DEFAULT_IMPORT = /^import\s+[\w$]+\s*(?:,|\bfrom\b)/m;
// `import name from 'x'`, `import name, { a } from 'x'`, `import name, * as ns from 'x'`: groups 1 name, 2 namespace, 3 list, 4 quote, 5 specifier.
const DEFAULT_IMPORT_STATEMENT = /^import\s+([\w$]+)\s*(?:,\s*(?:\*\s*as\s+([\w$]+)|\{([^}]*)\})\s*)?from\s*(['"])([^'"\n]+)\4[ \t]*;?[ \t]*$/gm;
const DEFAULT_EXPORT = /^export\s+default\b/m;
const UNSUPPORTED_EXPORT = /^export\s+(?:\*|\{[^}]*\}\s*from\b)/m;
// `export default ` and what follows it: a declaration with a name keeps it, anything else becomes the value of DEFAULT_LOCAL.
const EXPORT_DEFAULT = /^export\s+default\s+/gm;
const DEFAULT_DECLARATION = /^(?:async\s+function\*?|function\*?|class)(?![\w$])\s*([\w$]*)/;
const DEFAULT_LOCAL = 'moduleDefault';
// The local that holds an unnamed default export: the first of moduleDefault, moduleDefault2, ... the file does not mention.
const freeDefaultLocal = (maskedSource) => {
  let name = DEFAULT_LOCAL;
  for (let suffix = 2; new RegExp(`\\b${name}\\b`).test(maskedSource); suffix++) name = `${DEFAULT_LOCAL}${suffix}`;
  return name;
};
const EXPORT_LIST = /^export\s*\{([^}]*)\}[ \t]*;?[ \t]*$/gm;
const EXPORT_DECLARATION = /^export\s+(async\s+function\*?|function\*?|class|const|let|var)\s*([\w$]*)/gm;
// All of these run on the masked copy (see maskNonCode), where comments and the text of strings are blanked to spaces.
const DYNAMIC_IMPORT = /\bimport\(\s*(['"])[ ]*\1\s*\)/g;

// Markers are replaced during code generation, when the chunk layout (and so every variable name) is known.
export const moduleMarker = (modulePath) => `⟦module:${modulePath}⟧`;
export const dynamicImportMarker = (modulePath) => `⟦dynamic:${modulePath}⟧`;

const countLines = (text) => text.split('\n').length - 1;
// The line (counting from 1) where a match starts, for the messages.
export const lineOf = (text, index) => countLines(text.slice(0, index)) + 1;

const parseNamedBindings = (text) =>
  text
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [imported, local = imported] = entry.split(/\s+as\s+/);
      return { imported, local };
    });

// `resolveImport(specifier)` returns the project-relative path of the imported file (or throws a BuildError).
//
// Every pattern runs on a masked copy of the source (maskNonCode: same offsets, with comments, strings, template text
// and regular expression literals blanked), so a line in a comment or a template literal that looks like
// `import x from` or `export default` is not mistaken for a statement. The text of an import specifier is blanked in the
// masked copy too, so it is read back from the original at the same offsets. All the changes are collected as edits on
// the original source and applied together at the end.
//
// `inPackage` is true for a file of a package (the module graph knows: it came from a package import, linked or not, or
// from a file of one): only there default imports and default exports are accepted, because that code is not ours to
// change. The project's own files keep one form.
export const parseModule = ({ path, sourceText: rawSourceText, resolveImport, inPackage = false }) => {
  const sourceText = rawSourceText.replace(/\r\n/g, '\n'); // the statement patterns end at a newline: a file saved with CRLF reads as LF (same lines)
  const masked = maskNonCode(sourceText);
  if (!inPackage) {
    const defaultImport = DEFAULT_IMPORT.exec(masked);
    if (defaultImport) {
      throw new BuildError(`${path}:${lineOf(sourceText, defaultImport.index)}: default imports are not supported in the project's own files (only files of a package may use them). Use a named import: import { name } from '...'`);
    }
    const defaultExport = DEFAULT_EXPORT.exec(masked);
    if (defaultExport) {
      throw new BuildError(`${path}:${lineOf(sourceText, defaultExport.index)}: default exports are not supported in the project's own files (only files of a package may use them). Export a named value: export const name = ...`);
    }
  }
  const unsupportedExport = UNSUPPORTED_EXPORT.exec(masked);
  if (unsupportedExport) {
    throw new BuildError(`${path}:${lineOf(sourceText, unsupportedExport.index)}: "export *" and re-exports are not supported. Export named values: export const name = ... If a package you import is written with them, give the browser bundle a one-file build of it (docs/BUILD.md, "Vendor files")`);
  }

  // The bundler's messages about a bad import name the line.
  const resolveImportAt = (specifier, line) => {
    try {
      return resolveImport(specifier);
    } catch (error) {
      if (!(error instanceof BuildError) || !error.message.startsWith(`${path}: `)) throw error;
      throw new BuildError(`${path}:${line}: ${error.message.slice(path.length + 2)}`);
    }
  };
  const staticDependencies = [];
  const stylesheets = [];
  const dynamicDependencies = [];
  const importStatements = [];
  const exportedBindings = new Map(); // exported name -> local name
  const edits = []; // { from, to, text }: a part of the original source that is replaced

  // A statement that is taken out leaves its lines behind, empty, so every line of the body is the line of the source it came from
  // (source maps, docs/BUILD.md). The same goes for the `export` keyword.
  const emptied = (statement) => '\n'.repeat(countLines(statement));
  const removeStatement = (from, to) => edits.push({ from, to, text: emptied(sourceText.slice(from, to)) });

  // Both import patterns put the quote in group 4 and the specifier in group 5.
  const addImport = (found, { defaultName, namespaceName, namedList }) => {
    const [statement, , , , quote, maskedSpecifier] = found;
    const line = lineOf(sourceText, found.index);
    const specifierStart = found.index + statement.indexOf(quote) + 1; // no quote comes before the opening one
    const specifier = sourceText.slice(specifierStart, specifierStart + maskedSpecifier.length);
    const importedPath = resolveImportAt(specifier, line);
    removeStatement(found.index, found.index + statement.length);
    const hasBindings = Boolean(defaultName || namespaceName || namedList !== undefined);
    if (importedPath.endsWith('.css')) {
      if (hasBindings) throw new BuildError(`${path}:${line}: a stylesheet import cannot have bindings (${specifier}). Write import '${specifier}';`);
      if (!stylesheets.includes(importedPath)) stylesheets.push(importedPath);
      return;
    }
    if (!staticDependencies.includes(importedPath)) staticDependencies.push(importedPath);
    const marker = moduleMarker(importedPath);
    // The module's value is an object of its exports, so the default export is the key `default`.
    const bindings = namedList === undefined ? [] : parseNamedBindings(namedList).map(({ imported, local }) => (imported === local ? imported : `${imported}: ${local}`));
    if (namespaceName) {
      if (defaultName) importStatements.push(`const ${defaultName} = ${marker}.default;`);
      importStatements.push(`const ${namespaceName} = ${marker};`);
    } else {
      if (defaultName) bindings.unshift(`default: ${defaultName}`);
      if (bindings.length) importStatements.push(`const { ${bindings.join(', ')} } = ${marker};`);
    }
  };
  for (const found of masked.matchAll(IMPORT_STATEMENT)) addImport(found, { namespaceName: found[2], namedList: found[3] });
  if (inPackage) {
    for (const found of masked.matchAll(DEFAULT_IMPORT_STATEMENT)) addImport(found, { defaultName: found[1], namespaceName: found[2], namedList: found[3] });
  }

  for (const found of masked.matchAll(EXPORT_LIST)) {
    for (const { imported: localName, local: exportedName } of parseNamedBindings(found[1])) {
      if (exportedBindings.has(exportedName)) throw new BuildError(`${path}:${lineOf(sourceText, found.index)}: duplicate export ${exportedName}. Export each name once`);
      exportedBindings.set(exportedName, localName);
    }
    removeStatement(found.index, found.index + found[0].length);
  }

  for (const found of masked.matchAll(EXPORT_DECLARATION)) {
    const [statement, kind, name] = found;
    const line = lineOf(sourceText, found.index);
    if (!name) throw new BuildError(`${path}:${line}: destructuring exports are not supported. Export each name on its own: export const a = ...; export const b = ...`);
    if (kind === 'let' || kind === 'var') {
      throw new BuildError(`${path}:${line}: "export ${kind} ${name}" is not supported; export a const or function: export const name = ...`);
    }
    if (exportedBindings.has(name)) throw new BuildError(`${path}:${line}: duplicate export ${name}. Export each name once`);
    exportedBindings.set(name, name);
    const keyword = statement.match(/^export\s+/)[0];
    edits.push({ from: found.index, to: found.index + keyword.length, text: emptied(keyword) });
  }

  if (inPackage) {
    for (const found of masked.matchAll(EXPORT_DEFAULT)) {
      const line = lineOf(sourceText, found.index);
      if (exportedBindings.has('default')) throw new BuildError(`${path}:${line}: duplicate export default. Export each name once`);
      const keyword = found[0];
      const declaration = DEFAULT_DECLARATION.exec(masked.slice(found.index + keyword.length));
      // `class extends Base {}` is anonymous: `extends` is not its name.
      const declaredName = declaration && declaration[1] !== 'extends' ? declaration[1] : '';
      if (declaredName) {
        exportedBindings.set('default', declaredName);
        edits.push({ from: found.index, to: found.index + keyword.length, text: emptied(keyword) });
      } else {
        const local = freeDefaultLocal(masked);
        exportedBindings.set('default', local);
        edits.push({ from: found.index, to: found.index + keyword.length, text: `const ${local} = ${emptied(keyword)}` });
      }
    }
  }

  for (const found of masked.matchAll(DYNAMIC_IMPORT)) {
    const specifierStart = found.index + found[0].indexOf(found[1]) + 1;
    const specifier = sourceText.slice(specifierStart, found.index + found[0].lastIndexOf(found[1]));
    if (/[\n]/.test(specifier) || specifier.length === 0) continue;
    const importedPath = resolveImportAt(specifier, lineOf(sourceText, found.index));
    if (!dynamicDependencies.includes(importedPath)) dynamicDependencies.push(importedPath);
    edits.push({ from: found.index, to: found.index + found[0].length, text: `${dynamicImportMarker(importedPath)}${emptied(found[0])}` }); // the lines the call spanned stay, so a source map stays true
  }

  let body = '';
  let copiedUntil = 0;
  for (const edit of edits.sort((first, second) => first.from - second.from)) {
    body += sourceText.slice(copiedUntil, edit.from) + edit.text;
    copiedUntil = edit.to;
  }
  body += sourceText.slice(copiedUntil);

  // Anything that still looks like an import or export statement was not understood by the patterns above. Emitting it
  // would produce a chunk that fails in the browser, so stop here with the file and line.
  const maskedLines = maskNonCode(body).split('\n');
  const leftoverIndex = maskedLines.findIndex((line) => /(?:^|[;{}])\s*(?:import|export)\b(?!\s*(?:[(.:=;,}]|$))/.test(line));
  if (leftoverIndex >= 0) throw new BuildError(`${path}:${leftoverIndex + 1}: unsupported import/export syntax: ${body.split('\n')[leftoverIndex].trim()}. Use import { a } from './x.js' and export const a = ...`);

  return {
    path,
    sourceText,
    importStatements,
    body: body.trim(),
    // The line of the source file (from 1) where `body` starts: what `trim` took off the front was empty lines.
    firstLine: 1 + countLines(body.slice(0, body.length - body.trimStart().length)),
    staticDependencies,
    stylesheets,
    dynamicDependencies,
    exportedBindings,
  };
};
