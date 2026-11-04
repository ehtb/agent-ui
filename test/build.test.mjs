// Tests for the build pipeline (build/*.mjs): chunking rules, caching behaviour, error reporting,
// and the development and production framework presets. Uses throwaway projects and test/fixtures only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRoot, shimDocument } from './support/dom-shim.mjs';
import { build } from '../build/build.mjs';
import { frameworkBuildOptions } from '../build/presets.mjs';
import { BuildError, parseModule } from '../build/parse-module.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Creates a throwaway project (an ES module package, so built chunks can be imported by Node).
const createProject = (files) => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agent-ui-build-'));
  const write = (path, text) => {
    mkdirSync(dirname(join(projectRoot, path)), { recursive: true });
    writeFileSync(join(projectRoot, path), text);
  };
  write('package.json', '{"type":"module"}');
  for (const [path, text] of Object.entries(files)) write(path, text);
  return { projectRoot, write, cleanup: () => rmSync(projectRoot, { recursive: true, force: true }) };
};

const twoPagesAndALazyPanel = {
  'vendor/engine.js': 'export const engine = () => "engine";',
  'lib/shared.js': 'import { engine } from "../vendor/engine.js";\nexport const shared = () => `shared+${engine()}`;',
  'a/a.css': '.a { color: red; }',
  'a/a.js': 'import { shared } from "../lib/shared.js";\nexport const pageA = () => `A:${shared()}`;',
  'a/main.js': [
    'import "./a.css";',
    'import { pageA } from "./a.js";',
    'globalThis.results.a = pageA();',
    'import("../lazy/panel.js").then((panelModule) => { globalThis.results.panel = panelModule.panel(); });',
  ].join('\n'),
  'b/main.js': 'import { shared } from "../lib/shared.js";\nglobalThis.results.b = `B:${shared()}`;',
  'lazy/panel.css': '.panel { color: blue; }',
  'lazy/panel.js': 'import "./panel.css";\nimport { shared } from "../lib/shared.js";\nexport const panel = () => `panel:${shared()}`;',
};
const twoPageConfig = (projectRoot, overrides = {}) => ({
  projectRoot,
  entries: [{ name: 'a', path: 'a/main.js' }, { name: 'b', path: 'b/main.js' }],
  manualChunks: { vendor: ['vendor/**'] },
  outDir: 'out',
  ...overrides,
});

test('chunking: vendor (manual), per-page, shared-by-several, and lazy chunks', () => {
  const project = createProject(twoPagesAndALazyPanel);
  try {
    const { chunks, pages } = build(twoPageConfig(project.projectRoot));

    assert.deepEqual(Object.keys(chunks).sort(), ['a', 'b', 'panel', 'shared-a-b-panel', 'vendor']);
    assert.equal(chunks.vendor.reason, 'manual');
    assert.deepEqual(chunks.vendor.modules, ['vendor/engine.js']);
    assert.deepEqual(chunks['shared-a-b-panel'].modules, ['lib/shared.js']); // needed by both pages and the lazy panel
    assert.deepEqual(chunks.a.modules, ['a/a.js', 'a/main.js']);
    assert.deepEqual(chunks.b.modules, ['b/main.js']);
    assert.match(chunks.panel.reason, /lazy/);

    // A page loads exactly what it needs at startup; the lazy chunk is not part of that.
    assert.deepEqual(new Set(pages.a.chunksLoadedAtStartup), new Set(['vendor', 'shared-a-b-panel', 'a']));
    assert.equal(pages.a.chunksLoadedAtStartup.at(-1), 'a');
    assert.deepEqual(new Set(pages.b.chunksLoadedAtStartup), new Set(['vendor', 'shared-a-b-panel', 'b']));
    assert.deepEqual(pages.a.lazyChunks, ['panel']);

    // Stylesheets are separate files. Eager CSS is linked in the page; lazy CSS is injected by its chunk.
    const pageA = readFileSync(join(project.projectRoot, 'out/a.html'), 'utf8');
    assert.match(pageA, /<link rel="stylesheet" href="\/assets\/a\.[0-9a-f]{8}\.css">/);
    assert.doesNotMatch(pageA, /assets\/panel\./); // the lazy chunk and its CSS are not referenced by the page
    assert.match(pageA, /<link rel="modulepreload" href="\/assets\/vendor\.[0-9a-f]{8}\.js">/);
    assert.match(pageA, /<script type="module" src="\/assets\/a\.[0-9a-f]{8}\.js"><\/script>/);
    const panelSource = readFileSync(join(project.projectRoot, 'out', chunks.panel.javascript), 'utf8');
    assert.match(panelSource, /document\.head\.append/);
    assert.match(panelSource, /panel\.[0-9a-f]{8}\.css/);
    assert.equal(chunks.vendor.stylesheet, undefined);
  } finally {
    project.cleanup();
  }
});

test('output is readable: original names kept, no minification, one function scope per module', () => {
  const project = createProject(twoPagesAndALazyPanel);
  try {
    const { chunks } = build(twoPageConfig(project.projectRoot));
    const sharedSource = readFileSync(join(project.projectRoot, 'out', chunks['shared-a-b-panel'].javascript), 'utf8');
    assert.match(sharedSource, /\/\/ ---- lib\/shared\.js ----/);
    assert.match(sharedSource, /const module_shared = \(\(\) => \{/);
    assert.match(sharedSource, /const \{ engine \} = module_engine;/);
    assert.match(sharedSource, /export const shared = \(\) =>|const shared = \(\) =>/);
    assert.match(sharedSource, /import \{ module_engine \} from "\.\/vendor\.[0-9a-f]{8}\.js";/);
  } finally {
    project.cleanup();
  }
});

test('built chunks run: modules, shared code and lazy chunk with injected CSS all work', async () => {
  const project = createProject(twoPagesAndALazyPanel);
  const appendedElements = [];
  Object.assign(globalThis, {
    results: {},
    document: { head: { append: (element) => appendedElements.push(element) }, createElement: () => ({}) },
  });
  try {
    const { chunks, pages } = build(twoPageConfig(project.projectRoot));
    const entryFile = join(project.projectRoot, 'out', chunks[pages.a.entryChunk].javascript);
    await import(pathToFileURL(entryFile));
    assert.equal(globalThis.results.a, 'A:shared+engine');
    await new Promise((done) => setTimeout(done, 20)); // let the dynamic import resolve
    assert.equal(globalThis.results.panel, 'panel:shared+engine');
    assert.match(appendedElements[0].href, /panel\.[0-9a-f]{8}\.css$/);
  } finally {
    globalThis.document = shimDocument;
    project.cleanup();
  }
});

test('caching: changing app code leaves the vendor chunk file name untouched; changing it changes dependents', () => {
  const project = createProject(twoPagesAndALazyPanel);
  try {
    const first = build(twoPageConfig(project.projectRoot)).chunks;
    assert.deepEqual(build(twoPageConfig(project.projectRoot)).chunks.vendor.javascript, first.vendor.javascript);

    project.write('b/main.js', 'import { shared } from "../lib/shared.js";\nglobalThis.results.b = `B2:${shared()}`;');
    const afterAppChange = build(twoPageConfig(project.projectRoot)).chunks;
    assert.equal(afterAppChange.vendor.javascript, first.vendor.javascript);
    assert.equal(afterAppChange['shared-a-b-panel'].javascript, first['shared-a-b-panel'].javascript);
    assert.equal(afterAppChange.a.javascript, first.a.javascript);
    assert.notEqual(afterAppChange.b.javascript, first.b.javascript);

    project.write('vendor/engine.js', 'export const engine = () => "engine v2";');
    const afterVendorChange = build(twoPageConfig(project.projectRoot)).chunks;
    assert.notEqual(afterVendorChange.vendor.javascript, first.vendor.javascript);
    assert.notEqual(afterVendorChange['shared-a-b-panel'].javascript, first['shared-a-b-panel'].javascript); // it imports vendor by file name
  } finally {
    project.cleanup();
  }
});

test('hash:false produces stable file names for debugging', () => {
  const project = createProject(twoPagesAndALazyPanel);
  try {
    const { chunks } = build(twoPageConfig(project.projectRoot, { hash: false }));
    assert.equal(chunks.vendor.javascript, '/assets/vendor.js');
    assert.equal(chunks.a.stylesheet, '/assets/a.css');
  } finally {
    project.cleanup();
  }
});

test('the dialect is read from code only: comments, strings, template literals and regular expressions are skipped', () => {
  const parse = (sourceText) => parseModule({ path: 'lib.js', sourceText, resolveImport: (specifier) => specifier.replace('./', '') });
  const source = [
    '/*',
    'import thing from "./nope.js";',
    'export default 1;',
    'export * from "./nope.js";',
    '*/',
    'import { a } from "./a.js"; // import other from "./nope.js";',
    'const documentation = `',
    'import another from "./nope.js";',
    'export default 2;',
    'export let counter = 0;',
    '`;',
    'const pattern = /x/;',
    'export const b = a + documentation.length;',
    'export { b as c };',
  ].join('\n');
  const record = parse(source);
  assert.deepEqual(record.staticDependencies, ['a.js']);
  assert.deepEqual(record.importStatements, ['const { a } = ⟦module:a.js⟧;']);
  assert.deepEqual([...record.exportedBindings], [['c', 'b'], ['b', 'b']]);
  assert.ok(record.body.includes('import another from "./nope.js";'), 'the text of the template literal is left alone');
  assert.ok(!record.body.includes('export const'), 'the export keyword is taken off the declaration');
  const bodyLines = record.body.split('\n');
  assert.equal(bodyLines[source.split('\n').indexOf('export const b = a + documentation.length;') - (record.firstLine - 1)], 'const b = a + documentation.length;', 'lines stay where they were');

  // A real statement after the same kind of text is still found, with the line it is on.
  assert.throws(() => parse('/* import a from "x"; */\nexport default 1;'), /lib\.js:2: default exports/);
  assert.throws(() => parse('const text = `\nexport default 1;\n`;\nimport thing from "./a.js";'), /lib\.js:4: default imports are not supported/);
  assert.throws(() => parse('const text = "a";\n`\n`;\nexport let counter = 0;'), /lib\.js:4: "export let counter"/);
  // A block comment between the parts of an import statement is a comment.
  assert.deepEqual(parse('import /* why */ { a } from "./a.js" /* and why */;').staticDependencies, ['a.js']);
});

test('default imports and exports are accepted in package files only', () => {
  const parseIn = (path, sourceText, inPackage = false) => parseModule({ path, sourceText, inPackage, resolveImport: (specifier) => specifier.replace(/^\.\//, '') });
  const parsePackage = (sourceText) => parseIn('node_modules/pkg/index.js', sourceText, true);

  // Imports: every form binds the key `default` of the module's exports.
  assert.deepEqual(parsePackage('import thing from "./a.js";').importStatements, ['const { default: thing } = ⟦module:a.js⟧;']);
  assert.deepEqual(parsePackage('import thing, { b, c as d } from "./a.js";').importStatements, ['const { default: thing, b, c: d } = ⟦module:a.js⟧;']);
  assert.deepEqual(parsePackage('import thing, * as all from "./a.js";').importStatements, ['const thing = ⟦module:a.js⟧.default;', 'const all = ⟦module:a.js⟧;']);
  assert.deepEqual(parsePackage('import { default as thing } from "./a.js";').importStatements, ['const { default: thing } = ⟦module:a.js⟧;']);
  assert.deepEqual(parsePackage('import thing from "./a.js"; // import other from "./b.js"').staticDependencies, ['a.js']);

  // Exports: a named declaration keeps its name, anything else becomes the value of one local.
  const exportsOf = (sourceText) => [...parsePackage(sourceText).exportedBindings];
  assert.deepEqual(exportsOf('export default function make() {}'), [['default', 'make']]);
  assert.deepEqual(exportsOf('export default async function* make() {}'), [['default', 'make']]);
  assert.deepEqual(exportsOf('export default class Panel {}'), [['default', 'Panel']]);
  assert.deepEqual(exportsOf('export default function () {}'), [['default', 'moduleDefault']]);
  assert.deepEqual(exportsOf('export default class extends Base {}'), [['default', 'moduleDefault']]);
  assert.deepEqual(exportsOf('export default classy;'), [['default', 'moduleDefault']]);
  assert.deepEqual(exportsOf('export default { a: 1 };\nexport const b = 2;'), [['b', 'b'], ['default', 'moduleDefault']]);
  assert.deepEqual(exportsOf('const x = 1;\nexport { x as default };'), [['default', 'x']]);
  assert.equal(parsePackage('export default function make() {}').body, 'function make() {}');
  assert.equal(parsePackage('export default async () => 1;').body, 'const moduleDefault = async () => 1;');
  assert.equal(parsePackage('export default\n  42;\nexport const b = 2;').body.split('\n').length, 3, 'lines stay where they were');
  assert.throws(() => parsePackage('export default 1;\nexport default 2;'), /node_modules\/pkg\/index\.js:2: duplicate export default/);
  assert.throws(() => parsePackage('const x = 1;\nexport { x as default };\nexport default 2;'), /:3: duplicate export default/);
  // The local of an unnamed default is a name the file does not use, so a package can always be bundled.
  assert.deepEqual(exportsOf('const moduleDefault = 1;\nexport default moduleDefault + 1;'), [['default', 'moduleDefault2']]);
  assert.equal(parsePackage('const moduleDefault = 1, moduleDefault2 = 2;\nexport default 3;').body.split('\n')[1], 'const moduleDefault3 = 3;');
  assert.deepEqual(exportsOf('const state = { moduleDefault: 1 };\nexport const a = state.moduleDefault;'), [['a', 'a']]); // no default export: nothing is injected, nothing is refused
  assert.deepEqual(exportsOf('export default function moduleDefault() {}'), [['default', 'moduleDefault']]);
  // Two export lists, and a list and a declaration, cannot both name the same export.
  assert.throws(() => parsePackage('const a = 1, b = 2;\nexport { a as default };\nexport { b as default };'), /node_modules\/pkg\/index\.js:3: duplicate export default/);
  assert.throws(() => parseIn('lib.js', 'const a = 1;\nexport { a };\nexport { a };'), /lib\.js:3: duplicate export a\. Export each name once/);
  assert.throws(() => parseIn('lib.js', 'const a = 1;\nexport { a, a };'), /lib\.js:2: duplicate export a/);
  // A statement that does not start its line is not understood, and that is a build error, not a chunk that fails to load.
  assert.throws(() => parsePackage('const a = 1; export default 2;'), /index\.js:1: unsupported import\/export syntax: const a = 1; export default 2;/);
  assert.throws(() => parseIn('lib.js', 'if (true) { import { a } from "./a.js"; }'), /lib\.js:1: unsupported import\/export syntax/);
  assert.throws(() => parsePackage('function f() {\n  return 1;\n}\n  export const indented = 1;'), /index\.js:4: unsupported import\/export syntax: export const indented = 1;/);
  assert.throws(() => parsePackage('/* note */ export default 2;'), /index\.js:1: unsupported import\/export syntax/);
  for (const fields of ['class A { export = 1; import = 2; }', 'class A { export; }', 'class A { import; }', 'class A { export }', 'class A {\n  export\n  import\n}', 'class A { static export = 1; get import() { return 1; } }']) {
    assert.doesNotThrow(() => parsePackage(`${fields}\nexport const a = A;`), fields);
  }
  assert.deepEqual([...parseIn('lib.js', 'class Box {\n  import = 1;\n  export = 2;\n  export;\n}\nexport const b = Box;').exportedBindings], [['b', 'b']]); // class fields named import and export
  assert.deepEqual([...parseIn('lib.js', 'const table = { import: 1, export: 2 };\nexport const b = table.import;').exportedBindings], [['b', 'b']]); // property names are not statements
  // A removed import over several lines leaves its lines, so what follows is on the line it was written on.
  const multiLine = parseIn('lib.js', 'import {\n  a,\n  b as c,\n} from "./a.js";\nexport const d = a + c;');
  assert.deepEqual(multiLine.importStatements, ['const { a, b: c } = ⟦module:a.js⟧;']);
  assert.equal(multiLine.body.split('\n')[multiLine.body.split('\n').length - 1], 'const d = a + c;');
  assert.equal(multiLine.firstLine + multiLine.body.split('\n').length - 1, 5, 'the last line of the body is line 5 of the source');
  assert.deepEqual([...parsePackage('// export default 1;\nexport const a = 1;').exportedBindings], [['a', 'a']]);

  // What a package may not do is the same as for project files.
  assert.throws(() => parsePackage('export * from "./a.js";'), /node_modules\/pkg\/index\.js:1: "export \*" and re-exports are not supported/);
  assert.throws(() => parsePackage('export { default } from "./a.js";'), /re-exports are not supported/);
  assert.throws(() => parsePackage('export let counter = 0;'), /"export let counter" is not supported/);
  assert.throws(() => parsePackage('import thing from "./a.css";'), /a stylesheet import cannot have bindings/);

  // The project's own files keep the one form, and the message says where the rule differs.
  assert.throws(() => parseIn('src/lib.js', 'import thing from "./a.js";'),
    /^Error: src\/lib\.js:1: default imports are not supported in the project's own files \(only files of a package may use them\)\. Use a named import/);
  assert.throws(() => parseIn('src/lib.js', 'import thing, { b } from "./a.js";'), /default imports are not supported in the project's own files/);
  assert.throws(() => parseIn('src/lib.js', 'const x = 1;\nexport default x;'),
    /^Error: src\/lib\.js:2: default exports are not supported in the project's own files \(only files of a package may use them\)\. Export a named value/);
  assert.throws(() => parseIn('node_modules/pkg/index.js', 'export default 1;'), /default exports are not supported/, 'a path says nothing: the module graph says what a package file is');
});

test('a package with a default export is bundled and runs; the project imports it by name or by default only in the package', async () => {
  const project = createProject({
    'node_modules/greeter/package.json': '{"name":"greeter","version":"1.0.0","type":"module","exports":{".":"./index.js"}}',
    'node_modules/greeter/helper.js': 'export default function helper(name) { return `hello ${name}`; }',
    'node_modules/greeter/index.js': [
      'import helper from "./helper.js";',
      'import prefix, { suffix } from "./affixes.js";',
      'export default (name) => prefix + helper(name) + suffix;',
      'export const version = 2;',
    ].join('\n'),
    'node_modules/greeter/affixes.js': 'export const suffix = "!";\nexport default "> ";',
    'main.js': 'import * as greeter from "greeter";\nglobalThis.results.greeting = greeter.default("web") + greeter.version;',
  });
  Object.assign(globalThis, { results: {} });
  try {
    const { chunks, pages } = build({ projectRoot: project.projectRoot, entries: [{ name: 'main', path: 'main.js' }], outDir: 'out' });
    await import(pathToFileURL(join(project.projectRoot, 'out', chunks[pages.main.entryChunk].javascript)));
    assert.equal(globalThis.results.greeting, '> hello web!2');

    // The project's own code cannot import that default by the short form.
    project.write('main.js', 'import greet from "greeter";\nglobalThis.results.greeting = greet("web");');
    assert.throws(() => build({ projectRoot: project.projectRoot, entries: [{ name: 'main', path: 'main.js' }], outDir: 'out' }),
      /main\.js:1: default imports are not supported in the project's own files/);
  } finally {
    delete globalThis.results;
    project.cleanup();
  }
});

test('a linked package (file:, npm link, workspaces) is a package: its path has no node_modules, the import that reached it does', async () => {
  const external = mkdtempSync(join(tmpdir(), 'agent-ui-linked-'));
  const writeExternal = (path, text) => {
    mkdirSync(dirname(join(external, path)), { recursive: true });
    writeFileSync(join(external, path), text);
  };
  writeExternal('package.json', '{"name":"linked","version":"1.0.0","type":"module","exports":{".":"./index.js"}}');
  writeExternal('index.js', 'import twice from "./lib/twice.js";\nconst moduleDefault = 1;\nexport default (n) => twice(n) + moduleDefault;');
  writeExternal('lib/twice.js', 'export default function twice(n) { return n * 2; }');
  const project = createProject({ 'main.js': 'import * as linked from "linked";\nglobalThis.results.value = linked.default(5);' });
  mkdirSync(join(project.projectRoot, 'node_modules'));
  symlinkSync(external, join(project.projectRoot, 'node_modules/linked'), 'junction'); // a junction needs no privilege on Windows, and is a plain link elsewhere
  Object.assign(globalThis, { results: {} });
  try {
    const { chunks, pages } = build({ projectRoot: project.projectRoot, entries: [{ name: 'main', path: 'main.js' }], outDir: 'out' });
    await import(pathToFileURL(join(project.projectRoot, 'out', chunks[pages.main.entryChunk].javascript)));
    assert.equal(globalThis.results.value, 11);
  } finally {
    delete globalThis.results;
    project.cleanup();
    rmSync(external, { recursive: true, force: true });
  }
});

test('the project importing itself by its own name is still the project: no default exports there', () => {
  const project = createProject({
    'package.json': '{"name":"own","version":"1.0.0","type":"module","exports":{".":"./lib.js"}}',
    'lib.js': 'export default 1;\nexport const x = 2;',
    'main.js': 'import { x } from "own";\nglobalThis.x = x;',
    'relative.js': 'import { x } from "./lib.js";\nglobalThis.x = x;',
  });
  try {
    for (const entry of ['main.js', 'relative.js']) {
      assert.throws(() => build({ projectRoot: project.projectRoot, entries: [{ name: 'main', path: entry }], outDir: 'out' }),
        /lib\.js:1: default exports are not supported in the project's own files/, `${entry}: both ways to reach the file give the same answer`);
    }
  } finally {
    project.cleanup();
  }
});

test('commented-out imports are not dependencies: a file or package that does not exist there is never looked up', () => {
  const project = createProject({
    'main.js': [
      '// import { gone } from "./missing.js";',
      '/* import "not-installed-package"; */',
      '/*',
      'import { gone } from "./also-missing.js";',
      'import("./lazy-missing.js");',
      '*/',
      'const text = `',
      'import { gone } from "./in-a-string.js";',
      '`;',
      '// import("./missing-lazy.js");',
      'import { present } from "./present.js";',
      'globalThis.present = present + text.length;',
    ].join('\n'),
    'present.js': 'export const present = 1;',
  });
  try {
    const result = build({ projectRoot: project.projectRoot, entries: [{ name: 'main', path: 'main.js' }], outDir: 'out' });
    const modulePaths = Object.values(result.chunks).flatMap((chunk) => chunk.modules).sort();
    assert.deepEqual(modulePaths, ['main.js', 'present.js']);
  } finally {
    project.cleanup();
  }
});

test('unsupported syntax and invalid graphs fail with a clear BuildError naming the file', () => {
  const expectBuildError = (files, pattern, overrides = {}) => {
    const project = createProject({ 'main.js': 'import "./other.js";', ...files });
    try {
      assert.throws(
        () => build({ projectRoot: project.projectRoot, entries: [{ name: 'main', path: 'main.js' }], outDir: 'out', ...overrides }),
        (error) => error instanceof BuildError && pattern.test(error.message),
      );
    } finally {
      project.cleanup();
    }
  };

  expectBuildError({ 'other.js': 'import "./main.js";' }, /import cycle: main\.js -> other\.js -> main\.js/);
  expectBuildError({ 'other.js': 'import thing from "./x.js";' }, /other\.js:\d+: default imports are not supported/);
  expectBuildError({ 'other.js': 'export default 1;' }, /other\.js:\d+: default exports/);
  expectBuildError({ 'other.js': 'export * from "./x.js";' }, /re-exports are not supported/);
  expectBuildError({ 'other.js': 'export let counter = 0;' }, /other\.js:\d+: "export let counter" is not supported/);
  expectBuildError({ 'other.js': 'export const { a, b } = {};' }, /destructuring exports/);
  expectBuildError({ 'other.js': 'import { x } from "lit";' }, /other\.js:\d+: cannot find package "lit".*Install it.*or import a relative file/);
  expectBuildError({ 'other.js': 'import { x } from "node:fs";' }, /other\.js:\d+: "node:fs" is a Node\.js built-in/);
  expectBuildError({ 'other.js': 'import "./missing.js";' }, /cannot find "\.\/missing\.js"/);
  expectBuildError({ 'other.js': 'import "./a.js" from "./b.js";' }, /other\.js:\d+: unsupported import\/export syntax: import "\.\/a\.js" from "\.\/b\.js";/);
  expectBuildError({ 'other.js': 'import "./data.json";' }, /only \.js, \.mjs and \.css/);
  expectBuildError({ 'other.js': 'export const a = 1;', 'main.js': 'import { a } from "./other.js";\nexport const b = a;' },
    /manual chunk "main" has the same name/, { manualChunks: { main: ['other.js'] } });
  expectBuildError(
    {
      'main.js': 'import { core } from "./core.js";\nexport const app = core;',
      'core.js': 'import { helper } from "./helper.js";\nexport const core = helper;',
      'helper.js': 'import { app } from "./main.js";\nexport const helper = 1;',
    },
    /import cycle/,
  );
  // No module cycle, but a bad manual split: chunk x holds a.js and c.js while b.js (between them) lands elsewhere,
  // so x -> main -> x.
  expectBuildError(
    {
      'main.js': 'import { a } from "./a.js";\nglobalThis.result = a;',
      'a.js': 'import { b } from "./b.js";\nexport const a = b;',
      'b.js': 'import { c } from "./c.js";\nexport const b = c;',
      'c.js': 'export const c = 1;',
    },
    /chunk cycle: .*x/,
    { manualChunks: { x: ['a.js', 'c.js'] } },
  );
});

test('trailing line comments on import and export lines are fine, and the stylesheet import is still extracted', () => {
  const project = createProject({
    'main.js': 'import "./style.css"; // optional\nimport { value } from "./other.js"; // used below\nglobalThis.result = value;',
    'style.css': '.x { color: red; }',
    'other.js': 'const value = 5;\nexport { value }; // the only export',
  });
  try {
    const manifest = build({ projectRoot: project.projectRoot, entries: [{ name: 'main', path: 'main.js' }], outDir: 'out' });
    assert.ok(manifest.chunks.main.stylesheet);
    const code = readFileSync(join(project.projectRoot, 'out', manifest.chunks.main.javascript), 'utf8');
    assert.ok(!/^import '\.\/style/m.test(code) && !code.includes('// optional'.replace('// ', 'import ')));
  } finally {
    project.cleanup();
  }
});

test('publicDir: static files are copied as they are to the output root, next to the pages', () => {
  const project = createProject({ ...twoPagesAndALazyPanel, 'public/data/data.json': '[1,2,3]', 'public/robots.txt': 'ok' });
  try {
    build(twoPageConfig(project.projectRoot, { publicDir: 'public' }));
    assert.equal(readFileSync(join(project.projectRoot, 'out/data/data.json'), 'utf8'), '[1,2,3]');
    assert.equal(readFileSync(join(project.projectRoot, 'out/robots.txt'), 'utf8'), 'ok');
    assert.match(readFileSync(join(project.projectRoot, 'out/a.html'), 'utf8'), /assets\/a\./); // pages still generated
  } finally {
    project.cleanup();
  }
});

test('development build: readable, validator in its own chunk and active; production build: stripped, validator stubbed', async () => {
  const base = ({ dev }) => ({ ...frameworkBuildOptions({ dev }), entries: [{ name: 'site', path: 'test/fixtures/site/main.js' }] });
  const { build: buildWith } = await import('../build/build.mjs');
  const dev = buildWith({ ...base({ dev: true }), projectRoot: repositoryRoot, outDir: 'test/.output-dev' });
  const production = buildWith({ ...base({ dev: false }), projectRoot: repositoryRoot, outDir: 'test/.output-production' });
  try {
    assert.deepEqual([...dev.chunks.validator.modules].sort(), ['src/base-path-checks.js', 'src/error-messages.js', 'src/errors.js', 'src/grammar.js', 'src/handler-checks.js', 'src/messages.js', 'src/namespaces.js', 'src/runtime-checks.js', 'src/spec-core.js', 'src/validate.js']);
    // In development the runtime chunk is the framework's own modules and nothing else, so the hot swap never evaluates src/pages.js twice (build/presets.mjs).
    assert.ok(dev.chunks['agent-ui'].modules.includes('src/ui.js') && dev.chunks['agent-ui'].modules.every((path) => path.startsWith('src/')), dev.chunks['agent-ui'].modules.join(', '));
    assert.ok(dev.pages.site.chunksLoadedAtStartup.includes('validator'));
    assert.ok(!production.chunks.validator);
    assert.ok(production.chunks['agent-ui'].size.bytes < dev.chunks['agent-ui'].size.bytes + dev.chunks.validator.size.bytes);

    const devRuntime = readFileSync(join(repositoryRoot, 'test/.output-dev', dev.chunks['agent-ui'].javascript), 'utf8');
    const productionRuntime = readFileSync(join(repositoryRoot, 'test/.output-production', production.chunks['agent-ui'].javascript), 'utf8');
    assert.match(devRuntime, /\/\/ Resolves after all scheduled updates/); // comments kept in development
    assert.doesNotMatch(productionRuntime, /\/\/ Resolves after all scheduled updates|\n\s{2,}\S/); // stripped, no indentation
    assert.match(productionRuntime, /const module_ui = /); // names are untouched
    assert.match(productionRuntime, /validate = \(\) => \[\]/); // the stub

    // Behaviour: with the real validator an invalid spec throws at mount; with the stub it does not.
    const mountInvalid = async (outDirectory, manifest) => {
      const chunkFile = (name) => pathToFileURL(join(repositoryRoot, outDirectory, manifest.chunks[name].javascript)).href;
      const runtime = await import(chunkFile('agent-ui'));
      const exports = Object.values(runtime).find((value) => value && typeof value.app === 'function');
      return () => exports.app({ spec: { tag: 'div', chilren: 'typo' }, root: createRoot(), dev: true });
    };
    assert.throws(await mountInvalid('test/.output-dev', dev), /unknown key chilren/);
    assert.doesNotThrow(await mountInvalid('test/.output-production', production));

    // Errors: the development build says what is wrong; the production build gives the code and the details, which src/error-messages.js decodes.
    const dispatchUnknown = async (outDirectory, manifest) => {
      const runtime = await import(pathToFileURL(join(repositoryRoot, outDirectory, manifest.chunks['agent-ui'].javascript)).href);
      const exports = Object.values(runtime).find((value) => value && typeof value.app === 'function');
      const originalError = console.error;
      console.error = () => {};
      try {
        return exports.app({ spec: { tag: 'div' }, root: createRoot(), dev: true }).dispatch('todos.add', {});
      } finally {
        console.error = originalError;
      }
    };
    assert.match(await dispatchUnknown('test/.output-dev', dev), /^unknown action todos\.add\. Actions are written namespace\.verb: none$/);
    const terse = await dispatchUnknown('test/.output-production', production);
    assert.equal(terse, 'AUI0202 {"action":"todos.add"}');
    assert.doesNotMatch(productionRuntime, /Actions are written namespace\.verb|has no state key or derived value/, 'the sentences are not shipped');
    const { decodeError } = await import('../src/error-messages.js');
    assert.equal(decodeError(terse).text, 'unknown action todos.add. Actions are written namespace.verb');
  } finally {
    rmSync(join(repositoryRoot, 'test/.output-dev'), { recursive: true, force: true });
    rmSync(join(repositoryRoot, 'test/.output-production'), { recursive: true, force: true });
  }
});

test('a manualChunks pattern that matches no module fails and names the pattern', () => {
  const project = createProject({ 'main.js': 'export const one = 1;' });
  try {
    assert.throws(
      () => build({ projectRoot: project.projectRoot, entries: [{ name: 'main', path: 'main.js' }], outDir: 'out', manualChunks: { vendor: ['vendr/**'] } }),
      (error) => error instanceof BuildError && /manualChunks "vendor": the pattern "vendr\/\*\*" matches no module/.test(error.message),
    );
  } finally {
    project.cleanup();
  }
});

test('import() inside comments, strings and regular expressions is not a dependency; real ones (also in templates) are', () => {
  const project = createProject({
    'main.js': [
      '// import("./ghost-comment.js")',
      '/* import("./ghost-block.js") */',
      'export const text = "import(\'./ghost-string.js\')";',
      'export const pattern = /import\\("x"\\)/;',
      'export const load = () => import("./real.js");',
      'export const inTemplate = () => `${import("./templated.js")}`;',
    ].join('\n'),
    'real.js': 'export const real = 1;',
    'templated.js': 'export const templated = 1;',
  });
  try {
    const { chunks } = build({ projectRoot: project.projectRoot, entries: [{ name: 'main', path: 'main.js' }], outDir: 'out' });
    assert.deepEqual(Object.keys(chunks).sort(), ['main', 'real', 'templated']);
  } finally {
    project.cleanup();
  }
});

// ---- small shared chunks are folded into a bigger one ----------------------------------------------------------------

const threePages = {
  'a/main.js': 'import { everyone } from "../lib/everyone.js";\nimport { aAndB } from "../lib/a-and-b.js";\nimport { aAndC } from "../lib/a-and-c.js";\nglobalThis.a = [everyone, aAndB, aAndC];',
  'b/main.js': 'import { everyone } from "../lib/everyone.js";\nimport { aAndB } from "../lib/a-and-b.js";\nglobalThis.b = [everyone, aAndB];',
  'c/main.js': 'import { everyone } from "../lib/everyone.js";\nimport { aAndC } from "../lib/a-and-c.js";\nglobalThis.c = [everyone, aAndC];',
  'lib/everyone.js': `export const everyone = ${JSON.stringify('x'.repeat(300))};`,
  'lib/a-and-b.js': 'export const aAndB = "ab";',
  'lib/a-and-c.js': 'export const aAndC = "ac";',
};
const threePageConfig = (projectRoot, overrides = {}) => ({ projectRoot, entries: ['a', 'b', 'c'].map((name) => ({ name, path: `${name}/main.js` })), outDir: 'out', ...overrides });

test('without folding every combination of pages is a chunk of its own', () => {
  const project = createProject(threePages);
  try {
    const { chunks } = build(threePageConfig(project.projectRoot, { minSharedChunkBytes: 0 }));
    assert.deepEqual(Object.keys(chunks).sort(), ['a', 'b', 'c', 'shared-a-b', 'shared-a-b-c', 'shared-a-c']);
  } finally {
    project.cleanup();
  }
});

test('shared chunks below minSharedChunkBytes are folded into the smallest bigger shared chunk, and every page still loads what it imports', () => {
  const project = createProject(threePages);
  try {
    const { chunks, pages } = build(threePageConfig(project.projectRoot, { minSharedChunkBytes: 100 }));
    assert.deepEqual(Object.keys(chunks).sort(), ['a', 'b', 'c', 'shared-a-b-c']);
    assert.deepEqual([...chunks['shared-a-b-c'].modules].sort(), ['lib/a-and-b.js', 'lib/a-and-c.js', 'lib/everyone.js']);
    assert.match(chunks['shared-a-b-c'].reason, /shared by a, b, c \(with the smaller shared code of a, b\)/);
    for (const page of ['a', 'b', 'c']) assert.deepEqual(pages[page].chunksLoadedAtStartup, ['shared-a-b-c', page]);
    // The default is on: three tiny modules do not become three files.
    assert.deepEqual(Object.keys(build(threePageConfig(project.projectRoot)).chunks).sort(), ['a', 'b', 'c', 'shared-a-b-c']);
  } finally {
    project.cleanup();
  }
});

test('a chunk that is not small keeps its own file', () => {
  const project = createProject({ ...threePages, 'lib/a-and-b.js': `export const aAndB = ${JSON.stringify('y'.repeat(400))};` });
  try {
    const { chunks } = build(threePageConfig(project.projectRoot, { minSharedChunkBytes: 100 }));
    assert.deepEqual(Object.keys(chunks).sort(), ['a', 'b', 'c', 'shared-a-b', 'shared-a-b-c']); // a-and-c is small and folded, a-and-b is not
  } finally {
    project.cleanup();
  }
});

// ---- the framework, each package and the app are separate chunks ----------------------------------------------------

// Two pages that use the framework (linked as the package, like an installed copy), two packages and code of their own.
const layeredProject = () => {
  const project = createProject({
    'node_modules/big/package.json': '{"name":"big","version":"1.0.0","type":"module","exports":{".":"./index.js"}}',
    'node_modules/big/index.js': `export const big = ${JSON.stringify('b'.repeat(5000))};`,
    'node_modules/@scope/both/package.json': '{"name":"@scope/both","version":"1.0.0","type":"module","exports":{".":"./index.js","./extra.js":"./extra.js"}}',
    'node_modules/@scope/both/index.js': 'export const both = "both";',
    'node_modules/@scope/both/extra.js': 'export const extra = "extra";',
    'lib/shared.js': 'export const shared = "shared";',
    'a/main.js': [
      'import { memoizeItem } from "@ehtb/agent-ui/memoize";',
      'import { big } from "big";',
      'import { both } from "@scope/both";',
      'import { extra } from "@scope/both/extra.js";',
      'import { shared } from "../lib/shared.js";',
      'globalThis.results.a = [typeof memoizeItem, big.length, both, extra, shared].join();',
    ].join('\n'),
    'b/main.js': 'import { memoizeItem } from "@ehtb/agent-ui/memoize";\nimport { both } from "@scope/both";\nimport { shared } from "../lib/shared.js";\nglobalThis.results.b = [typeof memoizeItem, both, shared].join();',
  });
  mkdirSync(join(project.projectRoot, 'node_modules/@ehtb'), { recursive: true });
  symlinkSync(repositoryRoot, join(project.projectRoot, 'node_modules/@ehtb/agent-ui'), 'junction');
  return project;
};
const layeredConfig = (projectRoot, overrides = {}) => ({ projectRoot, entries: [{ name: 'a', path: 'a/main.js' }, { name: 'b', path: 'b/main.js' }], outDir: 'out', ...overrides });
const modulesOf = (chunk) => chunk.modules.map((path) => path.replace(/^.*\/src\//, 'src/'));

test('the framework\'s modules, each package and the app\'s own code are chunks of their own, so an edit to the app leaves the others cached', async () => {
  const project = layeredProject();
  Object.assign(globalThis, { results: {} });
  try {
    const first = build(layeredConfig(project.projectRoot, { minSharedChunkBytes: 0 }));
    const { chunks, pages } = first;
    assert.deepEqual(Object.keys(chunks).sort(), ['a', 'agent-ui-a-b', 'b', 'shared-a-b', 'vendor-big', 'vendor-scope-both-a', 'vendor-scope-both-a-b']);
    assert.deepEqual(modulesOf(chunks['agent-ui-a-b']), ['src/messages.js', 'src/memoize.js']);
    assert.match(chunks['agent-ui-a-b'].reason, /^framework modules used by a, b$/);
    assert.deepEqual(chunks['shared-a-b'].modules, ['lib/shared.js']);
    assert.deepEqual(chunks['vendor-big'].modules, ['node_modules/big/index.js']);
    assert.match(chunks['vendor-big'].reason, /^package big, used by a$/);
    // A package that pages use different parts of is one chunk per set of pages, named by the pages.
    assert.deepEqual(chunks['vendor-scope-both-a-b'].modules, ['node_modules/@scope/both/index.js']);
    assert.deepEqual(chunks['vendor-scope-both-a'].modules, ['node_modules/@scope/both/extra.js']);
    assert.deepEqual(chunks.a.modules, ['a/main.js']);
    assert.deepEqual(new Set(pages.b.chunksLoadedAtStartup), new Set(['agent-ui-a-b', 'vendor-scope-both-a-b', 'shared-a-b', 'b']));
    for (const page of ['a', 'b']) await import(pathToFileURL(join(project.projectRoot, 'out', chunks[page].javascript)).href);
    assert.deepEqual(globalThis.results, { a: 'function,5000,both,extra,shared', b: 'function,both,shared' });

    project.write('lib/shared.js', 'export const shared = "changed";');
    const after = build(layeredConfig(project.projectRoot, { minSharedChunkBytes: 0 })).chunks;
    assert.notEqual(after['shared-a-b'].javascript, chunks['shared-a-b'].javascript);
    for (const name of ['agent-ui-a-b', 'vendor-big', 'vendor-scope-both-a', 'vendor-scope-both-a-b']) assert.equal(after[name].javascript, chunks[name].javascript, `${name} keeps its file`);
  } finally {
    delete globalThis.results;
    project.cleanup();
  }
});

test('small chunks fold into a chunk of their own layer or the app\'s, never into the framework\'s or a package\'s, and run in import order', async () => {
  const project = layeredProject();
  Object.assign(globalThis, { results: {} });
  try {
    const { chunks } = build(layeredConfig(project.projectRoot, { minSharedChunkBytes: 1_000_000 }));
    const layerOf = (path) => (path.includes('/src/') ? 'framework' : path.startsWith('node_modules/') ? 'vendor' : 'app');
    for (const [name, chunk] of Object.entries(chunks)) {
      const layers = new Set(chunk.modules.map(layerOf));
      if (layers.has('framework') || layers.has('vendor')) assert.ok(!layers.has('app') || name === 'a' || name === 'b' || name.startsWith('shared-'), `${name} holds ${chunk.modules.join(', ')}`);
    }
    // The page's own chunk took in its small package parts: the package comes before the page code that imports it.
    assert.ok(chunks.a.modules.indexOf('node_modules/@scope/both/extra.js') < chunks.a.modules.indexOf('a/main.js'), chunks.a.modules.join(', '));
    assert.match(chunks.a.reason, /\(with package big\)/); // big had already taken in the small part of @scope/both
    assert.ok(chunks['shared-a-b'], 'the app\'s shared code is not folded into the framework chunk of the same pages');
    for (const page of ['a', 'b']) await import(pathToFileURL(join(project.projectRoot, 'out', chunks[page].javascript)).href);
    assert.deepEqual(globalThis.results, { a: 'function,5000,both,extra,shared', b: 'function,both,shared' });
  } finally {
    delete globalThis.results;
    project.cleanup();
  }
});

test('two packages that import each other become one chunk for the pages that use them', () => {
  const project = createProject({
    'node_modules/ping/package.json': '{"name":"ping","version":"1.0.0","type":"module","exports":{".":"./index.js","./tail.js":"./tail.js"}}',
    'node_modules/ping/index.js': 'import { pong } from "pong";\nexport const ping = () => `ping ${pong}`;',
    'node_modules/ping/tail.js': 'export const tail = "!";',
    'node_modules/pong/package.json': '{"name":"pong","version":"1.0.0","type":"module","exports":{".":"./index.js"}}',
    'node_modules/pong/index.js': 'import { tail } from "ping/tail.js";\nexport const pong = `pong${tail}`;',
    'main.js': 'import { ping } from "ping";\nglobalThis.result = ping();',
  });
  try {
    const { chunks } = build({ projectRoot: project.projectRoot, entries: [{ name: 'main', path: 'main.js' }], outDir: 'out', minSharedChunkBytes: 0 });
    assert.deepEqual(Object.keys(chunks).sort(), ['main', 'vendor-main']);
    assert.deepEqual(chunks['vendor-main'].modules, ['node_modules/ping/tail.js', 'node_modules/pong/index.js', 'node_modules/ping/index.js']);
    assert.match(chunks['vendor-main'].reason, /^packages ping, pong, used by main \(one chunk: they import each other\)$/);
  } finally {
    project.cleanup();
  }
});

test('the manifest lists the size of every module in every chunk', () => {
  const project = createProject(threePages);
  try {
    const { chunks } = build(threePageConfig(project.projectRoot, { minSharedChunkBytes: 100 }));
    for (const chunk of Object.values(chunks)) {
      assert.deepEqual(Object.keys(chunk.moduleSizes), chunk.modules);
      assert.ok(Object.values(chunk.moduleSizes).every((bytes) => Number.isInteger(bytes) && bytes > 0));
    }
    assert.ok(chunks['shared-a-b-c'].moduleSizes['lib/everyone.js'] > 300); // the 300 character constant plus its export
  } finally {
    project.cleanup();
  }
});

test('a file saved with CRLF line endings parses, and a dynamic import over several lines keeps the lines after it where they were', () => {
  const parse = (sourceText) => parseModule({ path: 'lib.js', sourceText, resolveImport: (specifier) => specifier.replace('./', '') });
  const crlf = parse("import { a } from './a.js';\r\nexport { a };\r\nexport const b = 1;\r\n");
  assert.deepEqual(crlf.staticDependencies, ['a.js']);
  assert.equal(crlf.body.includes('import {'), false);
  const source = "export const load = () => import(\n  './lazy.js'\n);\nexport const after = 1;\n";
  const parsed = parse(source);
  assert.deepEqual(parsed.dynamicDependencies, ['lazy.js']);
  assert.equal(parsed.body.split('\n').length, source.trimEnd().split('\n').length, 'the number of lines is the one of the source');
  assert.equal(parsed.body.split('\n').findIndex((line) => line.includes('after')), 3);
});

test('two different sets of pages whose names join to the same text get different shared chunks, and a module name that clashes repeatedly gets a flat suffix', () => {
  // Pages "a-b" and "c" share one module, pages "a" and "b-c" share another: both sets would be called "shared-a-b-c".
  const filler = (name) => `export const ${name} = ${JSON.stringify(name.repeat(2000))};`;
  const project = createProject({
    'one/x.js': filler('one'),
    'two/x.js': filler('two'),
    'three/x.js': filler('three'),
    'pages/ab.js': 'import { one } from "../one/x.js";\nglobalThis.results.ab = one.length;',
    'pages/c.js': 'import { one } from "../one/x.js";\nimport { three } from "../three/x.js";\nglobalThis.results.c = one.length + three.length;',
    'pages/a.js': 'import { two } from "../two/x.js";\nglobalThis.results.a = two.length;',
    'pages/bc.js': 'import { two } from "../two/x.js";\nimport { three } from "../three/x.js";\nglobalThis.results.bc = two.length + three.length;',
  });
  try {
    const { chunks } = build({
      projectRoot: project.projectRoot,
      entries: [{ name: 'a-b', path: 'pages/ab.js' }, { name: 'c', path: 'pages/c.js' }, { name: 'a', path: 'pages/a.js' }, { name: 'b-c', path: 'pages/bc.js' }],
      minSharedChunkBytes: 0,
      outDir: 'out',
    });
    const shared = Object.keys(chunks).filter((name) => name.startsWith('shared-'));
    const holding = (module) => Object.entries(chunks).find(([, chunk]) => chunk.modules.includes(module))[0];
    assert.notEqual(holding('one/x.js'), holding('two/x.js'), 'the modules of the two sets are in different chunks');
    assert.ok(shared.length >= 2, shared.join(', '));
    const source = readFileSync(join(project.projectRoot, 'out', chunks[holding('three/x.js')].javascript.replace(/^\//, '')), 'utf8');
    assert.doesNotMatch(source, /module_x_\d+_\d+/, 'the suffix of a clashing variable is not stacked');
  } finally {
    project.cleanup();
  }
});

test('publicDir refuses a symbolic link: the folder is copied as it is, and a link would publish the file it points to', () => {
  const project = createProject({ 'main.js': 'globalThis.results = 1;', 'secret.txt': 'private', 'public/ok.txt': 'fine' });
  try {
    symlinkSync(join(project.projectRoot, 'secret.txt'), join(project.projectRoot, 'public/linked.txt'));
    assert.throws(() => build({ projectRoot: project.projectRoot, entries: [{ name: 'main', path: 'main.js' }], publicDir: 'public', outDir: 'out' }), /publicDir: .*linked\.txt is a symbolic link\. .* Put the file itself in the folder/);
  } finally {
    project.cleanup();
  }
});
