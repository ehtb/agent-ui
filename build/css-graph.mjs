// The CSS import graph of a page: `page.css` and `pages/style.css` may @import other .css files. The build turns every file
// in that graph into a browser-only module (a "style module") that imports its own imports first and its CSS last. The page
// entry imports the style module, not the CSS file directly, so the existing chunk plan shares a stylesheet by page usage:
// one imported by pages A and B lands in a shared-A-B chunk, one imported by every page is global.
//
// The JavaScript never imports CSS: page.js, view.js and component modules run in Node (build, check, serve), which cannot
// load .css. A style module is generated and is only reached by a browser entry.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { BuildError, lineOf } from './parse-module.mjs';
import { importPath, toPosixPath } from './import-path.mjs';

export const STYLES_DIRECTORY = 'styles';


const cssFail = (path, line, what, fix) => {
  throw new BuildError(`${path}${line ? `:${line}` : ''}: ${what}. ${fix}`);
};

// Whitespace and comments before a statement. An unclosed comment is an error, not a silent end of file.
const skipTrivia = (text, index, path) => {
  let current = index;
  while (current < text.length) {
    if (/\s/.test(text[current])) {
      current++;
      continue;
    }
    if (text[current] === '/' && text[current + 1] === '*') {
      const end = text.indexOf('*/', current + 2);
      if (end < 0) cssFail(path, lineOf(text, current), 'the comment is not closed', 'Close the comment with */');
      current = end + 2;
      continue;
    }
    break;
  }
  return current;
};

// A quoted CSS string. CSS strings do not span a line unless the line is escaped with a backslash; this build does not
// need that form, and refusing it gives a message instead of a path with a newline in it.
const readString = (text, index, path) => {
  const quote = text[index];
  let current = index + 1;
  let value = '';
  while (current < text.length) {
    const character = text[current];
    if (character === '\\') {
      const next = text[current + 1];
      if (next === undefined) break;
      if (next === '\n' || next === '\r') cssFail(path, lineOf(text, index), 'a CSS string cannot span lines', 'Keep the @import path on one line');
      value += next;
      current += 2;
      continue;
    }
    if (character === quote) return { value, end: current + 1 };
    if (character === '\n' || character === '\r') cssFail(path, lineOf(text, index), 'a CSS string cannot span lines', 'Keep the @import path on one line');
    value += character;
    current++;
  }
  cssFail(path, lineOf(text, index), 'the CSS string is not closed', `Close it with ${quote}`);
};

// Finds an @import after the first block of imports, so a rule in the middle of a file is reported rather than left in the
// output for the browser to fetch.
const findLateImport = (text, index, path) => {
  let current = index;
  while (current < text.length) {
    const character = text[current];
    if (character === '/' && text[current + 1] === '*') {
      const end = text.indexOf('*/', current + 2);
      if (end < 0) cssFail(path, lineOf(text, current), 'the comment is not closed', 'Close the comment with */');
      current = end + 2;
      continue;
    }
    if (character === '"' || character === "'") {
      current = readString(text, current, path).end;
      continue;
    }
    if (character === '@' && /^@import\b/i.test(text.slice(current))) return lineOf(text, current);
    current++;
  }
  return 0;
};

// The @import statements at the top of one CSS file, and the same CSS with them removed. Only `@import "./file.css";` is
// accepted: conditions and url() would let the browser fetch a file the build cannot link, cache or wait for.
export const readCssImports = (path, text) => {
  const imports = [];
  const edits = [];
  let index = 0;
  for (;;) {
    index = skipTrivia(text, index, path);
    if (!/^@import\b/i.test(text.slice(index))) break;
    const start = index;
    const line = lineOf(text, start);
    index += '@import'.length;
    index = skipTrivia(text, index, path);
    if (text[index] !== '"' && text[index] !== "'") {
      cssFail(path, line, 'the @import has no quoted path', 'Write @import "./file.css"; with a path relative to this CSS file');
    }
    const string = readString(text, index, path);
    index = skipTrivia(text, string.end, path);
    if (text[index] !== ';') {
      cssFail(path, line, `the @import "${string.value}" does not end with a semicolon`, 'Write @import "./file.css"; and put layer, supports or media queries inside the imported file');
    }
    index++;
    imports.push({ specifier: string.value, line });
    edits.push({ start, end: index });
  }
  const late = findLateImport(text, index, path);
  if (late) cssFail(path, late, 'an @import is after other CSS', 'Move every @import to the top of the file, before its rules and other at-rules');
  let css = '';
  let cursor = 0;
  for (const edit of edits) {
    css += text.slice(cursor, edit.start);
    cursor = edit.end;
  }
  css += text.slice(cursor);
  return { imports, css };
};

const resolveCssPath = (projectRoot, fromPath, specifier, line) => {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
    cssFail(fromPath, line, `the @import "${specifier}" is not a relative path`, 'Write @import "./file.css"; or @import "../shared/file.css";, not a URL or a package name');
  }
  if (!specifier.toLowerCase().endsWith('.css')) {
    cssFail(fromPath, line, `the @import "${specifier}" is not a .css file`, 'Import a .css file, with the extension');
  }
  const absolute = resolve(dirname(resolve(projectRoot, fromPath)), specifier);
  const path = toPosixPath(relative(projectRoot, absolute));
  if (path === '..' || path.startsWith('../') || isAbsolute(path)) {
    cssFail(fromPath, line, `the @import "${specifier}" points outside the project`, 'Keep imported CSS inside the project, so the build can read it, watch it and include it in the stamp');
  }
  return path;
};

// Reads the graph from the page stylesheets and pages/style.css. `entries` are project-relative CSS paths. Throws a
// BuildError (with the CSS file and line) for a missing file, a bad path, a late import or a cycle.
export const readStyleGraph = ({ projectRoot, entries }) => {
  const files = new Map();
  const order = [];
  const visiting = [];
  const visit = (givenPath, from = null) => {
    const path = toPosixPath(relative(projectRoot, resolve(projectRoot, givenPath)));
    if (path === '..' || path.startsWith('../') || isAbsolute(path)) {
      if (from) cssFail(from.path, from.line, `the @import "${from.specifier}" points outside the project`, 'Keep imported CSS inside the project, so the build can read it, watch it and include it in the stamp');
      cssFail(givenPath, 0, 'the CSS file is outside the project', 'Keep page styles and imported CSS inside the project');
    }
    if (files.has(path)) return;
    const cycleAt = visiting.indexOf(path);
    if (cycleAt >= 0) {
      const cycle = [...visiting.slice(cycleAt), path].join(' -> ');
      throw new BuildError(`${path}: the CSS imports form a cycle: ${cycle}. Import each CSS file once, in one direction`);
    }
    const absolute = resolve(projectRoot, path);
    if (!existsSync(absolute)) {
      if (from) cssFail(from.path, from.line, `the @import "${from.specifier}" points to "${path}", which does not exist`, 'Check the path and the spelling, and create the CSS file it names');
      cssFail(path, 0, 'the CSS file does not exist', 'Create it, or remove it from the page definition');
    }
    const text = readFileSync(absolute, 'utf8');
    const { imports, css } = readCssImports(path, text);
    visiting.push(path);
    const dependencies = [];
    for (const statement of imports) {
      const imported = resolveCssPath(projectRoot, path, statement.specifier, statement.line);
      dependencies.push(imported);
      visit(imported, { path, specifier: statement.specifier, line: statement.line });
    }
    visiting.pop();
    files.set(path, { path, imports: dependencies, css, source: text });
    order.push(path);
  };
  for (const entry of entries) visit(entry.path);
  return { files, order };
};

// A readable generated module name: pages-checkout-page for pages/checkout/page.css. Two paths that sanitize to the same
// name get a suffix, so every wrapper is a file of its own.
const wrapperName = (path, used) => {
  const base = path.replace(/\.css$/i, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'style';
  let name = base;
  for (let suffix = 2; used.has(name); suffix++) name = `${base}-${suffix}`;
  used.add(name);
  return name;
};

// Writes the browser-only modules under <generated>/styles and returns their absolute paths (keyed by project-relative CSS
// path), the CSS with @imports removed (keyed the same) for generateChunks to read, and every CSS source the graph read (for
// the build stamp and the dev watch list). No files are written for an app with no CSS. `globalModule` is the generated
// global.js, imported first by every style module that is not itself global, so global CSS is linked first at any import
// depth; a wrapper reachable from pages/style.css is already global and skips it.
export const writeStyleModules = ({ projectRoot, generatedDirectory, entries, globalModule = null, globalStylePath = null }) => {
  const { files, order } = readStyleGraph({ projectRoot, entries });
  const wrapperOf = new Map();
  const cssOverrides = new Map();
  if (!order.length) return { wrapperOf, cssOverrides, sources: order, files };

  // A page style that is already reachable from pages/style.css is global; importing global.js from its wrapper would make
  // a cycle (page wrapper -> global.js -> global style wrapper -> page wrapper). It is linked as global CSS instead.
  const globalFiles = new Set();
  if (globalStylePath && files.has(globalStylePath)) {
    const pending = [globalStylePath];
    while (pending.length) {
      const path = pending.pop();
      if (globalFiles.has(path)) continue;
      globalFiles.add(path);
      pending.push(...files.get(path).imports);
    }
  }

  const stylesDirectory = join(generatedDirectory, STYLES_DIRECTORY);
  mkdirSync(stylesDirectory, { recursive: true });
  const used = new Set();
  for (const path of order) {
    wrapperOf.set(path, join(stylesDirectory, `${wrapperName(path, used)}.js`));
  }
  for (const path of order) {
    const file = files.get(path);
    const wrapper = wrapperOf.get(path);
    const lines = [
      `// Generated for ${path}: the CSS file and the stylesheets it @imports.`,
      '// Do not edit; it is rewritten on every build.',
    ];
    if (globalModule && !globalFiles.has(path)) lines.push(`import '${importPath(wrapper, globalModule)}';`);
    for (const dependency of file.imports) lines.push(`import '${importPath(wrapper, wrapperOf.get(dependency))}';`);
    // Comments after the imports do not make CSS of their own: a page.css with only @imports and comments links no empty
    // stylesheet after minification.
    const hasOwnCss = skipTrivia(file.css, 0, path) < file.css.length;
    if (hasOwnCss) lines.push(`import '${importPath(wrapper, resolve(projectRoot, path))}';`);
    writeFileSync(wrapper, `${lines.join('\n')}\n`);
    if (file.imports.length && hasOwnCss) cssOverrides.set(path, file.css);
  }
  return { wrapperOf, cssOverrides, sources: order, files };
};
