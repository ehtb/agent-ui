// Tests for tree shaking (build/tree-shake.mjs): which exports a module keeps, which imports and modules go with them, what the build asks of
// the tool and what it says when the tool answers wrongly. The framework has no dependencies, so the tool here is a small stand-in that
// removes one-line declarations nothing mentions (esbuild's own behaviour is tested in examples/events, the one example that installs it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { build } from '../build/build.mjs';
import { esbuildTreeShake } from '../build/tree-shake.mjs';
import { checkConfig } from '../build/config-check.mjs';
import { createSourceMap } from '../build/source-map.mjs';

const createProject = (files) => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agent-ui-shake-'));
  const write = (path, text) => {
    mkdirSync(dirname(join(projectRoot, path)), { recursive: true });
    writeFileSync(join(projectRoot, path), text);
  };
  write('package.json', '{"type":"module"}');
  for (const [path, text] of Object.entries(files)) write(path, text);
  return { projectRoot, cleanup: () => rmSync(projectRoot, { recursive: true, force: true }) };
};

const mentions = (name, text) => new RegExp(`(?<![\\w$])${name.replace(/\$/g, '\\$')}(?![\\w$])`).test(text);

// A stand-in for the tool: removes `const name = ...;` and `function name(...) {...}` written on one line when the name is not in `keep` and no other
// line mentions it, until nothing more goes. Any other line stays (it might do something).
const removeUnusedLines = (code, { keep }) => {
  let lines = code.split('\n');
  for (let removed = true; removed; ) {
    removed = false;
    lines = lines.filter((line, index) => {
      const declaration = /^(?:const|function) ([\w$]+)\b/.exec(line);
      if (!declaration || keep.includes(declaration[1])) return true;
      const others = lines.filter((_, other) => other !== index).join('\n');
      if (mentions(declaration[1], others)) return true;
      removed = true;
      return false;
    });
  }
  return lines.join('\n');
};

const calls = [];
const recordingTool = (code, context) => {
  calls.push({ file: context.file, keep: context.keep });
  return removeUnusedLines(code, context);
};

const buildProject = (files, overrides = {}) => {
  const project = createProject(files);
  const config = { projectRoot: project.projectRoot, entries: [{ name: 'main', path: 'main.js' }], outDir: 'out', hash: false, treeShake: recordingTool, ...overrides };
  return { project, config, result: () => build(config) };
};

const chunkText = (project, result) => Object.values(result.chunks).map((chunk) => readFileSync(join(project.projectRoot, 'out', chunk.javascript), 'utf8')).join('\n');
const run = async (project, result) => {
  globalThis.results = {};
  await import(pathToFileURL(join(project.projectRoot, 'out', result.chunks[result.pages.main.entryChunk].javascript)));
  return globalThis.results;
};

test('an export nothing imports, and a private declaration nothing uses, are left out; what is used stays and runs', async () => {
  const { project, result } = buildProject({
    'lib/tools.js': ['export const used = () => "used";', 'export const unused = () => "UNUSED_EXPORT";', 'const privateUnused = () => "PRIVATE_UNUSED";', 'const privateUsed = () => "private";', 'export const viaPrivate = () => privateUsed();'].join('\n'),
    'main.js': 'import { used, viaPrivate } from "./lib/tools.js";\nglobalThis.results.out = used() + viaPrivate();',
  });
  try {
    const built = result();
    const text = chunkText(project, built);
    assert.doesNotMatch(text, /UNUSED_EXPORT|PRIVATE_UNUSED/);
    assert.match(text, /const used = /);
    assert.deepEqual(await run(project, built), { out: 'usedprivate' });
    assert.ok(built.treeShaking.bytesAfter < built.treeShaking.bytesBefore, JSON.stringify(built.treeShaking));
  } finally {
    project.cleanup();
  }
});

test('the tool is given each module with the names that stay: the exports something imports, all of an entry and of a namespace import', () => {
  calls.length = 0;
  const { project, result } = buildProject({
    'a.js': 'export const one = 1;\nexport const two = 2;\nexport const three = 3;',
    'b.js': 'export const x = 1;\nexport const y = 2;',
    'main.js': 'import { one } from "./a.js";\nimport * as everything from "./b.js";\nglobalThis.results.out = [one, everything.x];',
  });
  try {
    result();
    const keepOf = (file) => calls.filter((call) => call.file === file).at(-1).keep;
    assert.deepEqual(keepOf('a.js'), ['one']);
    assert.deepEqual(keepOf('b.js'), ['x', 'y']);
  } finally {
    project.cleanup();
  }
});

test('a module that was only needed by code that is gone leaves the graph with its chunk; one with an effect stays', async () => {
  const { project, result } = buildProject({
    'heavy.js': 'export const heavy = () => "HEAVY_CODE";',
    'effect.js': 'export const unusedByEffect = () => "NOT_KEPT";\nglobalThis.results.effect = "ran";',
    'lib.js': 'import { heavy } from "./heavy.js";\nimport { unusedByEffect } from "./effect.js";\nexport const wanted = () => "wanted";\nexport const wasteful = () => heavy() + unusedByEffect();',
    'main.js': 'import { wanted } from "./lib.js";\nglobalThis.results.out = wanted();',
  });
  try {
    const built = result();
    const modules = Object.values(built.chunks).flatMap((chunk) => chunk.modules);
    assert.ok(!modules.includes('heavy.js'), `heavy.js is not needed any more: ${modules}`);
    assert.ok(modules.includes('effect.js'), 'a module that does something when it is imported stays');
    const text = chunkText(project, built);
    assert.doesNotMatch(text, /HEAVY_CODE|NOT_KEPT/);
    assert.deepEqual(await run(project, built), { out: 'wanted', effect: 'ran' });
  } finally {
    project.cleanup();
  }
});

test('a side-effect import keeps the effects of the module; a stylesheet keeps its module', async () => {
  const { project, result } = buildProject({
    'effects.js': 'export const never = () => "NEVER_USED";\nglobalThis.results.effects = "ran";',
    'widget.css': '.widget { color: red; }',
    'widget.js': 'import "./widget.css";\nexport const widget = () => "WIDGET_BODY";',
    'main.js': 'import "./effects.js";\nimport { widget } from "./widget.js";\nglobalThis.results.out = 1;',
  });
  try {
    const built = result();
    const text = chunkText(project, built);
    assert.doesNotMatch(text, /NEVER_USED|WIDGET_BODY/);
    assert.ok(Object.values(built.chunks).some((chunk) => chunk.stylesheet), 'the stylesheet is still written');
    assert.deepEqual(await run(project, built), { effects: 'ran', out: 1 });
  } finally {
    project.cleanup();
  }
});

test('an import() target keeps all its exports; one whose call is left out is not built, and its chunk is not made', () => {
  const { project, result } = buildProject({
    'panel.js': 'export const render = () => "PANEL_RENDER";\nexport const other = () => "PANEL_OTHER";',
    'gone.js': 'export const gone = () => "GONE_CODE";',
    'lib.js': 'export const live = () => import("./panel.js");\nexport const dead = () => import("./gone.js");',
    'main.js': 'import { live } from "./lib.js";\nglobalThis.results.out = live;',
  });
  try {
    const built = result();
    const text = chunkText(project, built);
    assert.match(text, /PANEL_RENDER/);
    assert.match(text, /PANEL_OTHER/);
    assert.doesNotMatch(text, /GONE_CODE/);
    assert.ok(!Object.keys(built.chunks).includes('gone'), Object.keys(built.chunks).join());
  } finally {
    project.cleanup();
  }
});

test('a name a module re-exports is kept in the module that defines it, and a barrel that nothing uses drops its re-exports', () => {
  const { project, result } = buildProject({
    'ui/button.js': 'export const Button = () => "BUTTON";\nexport const ButtonSpare = () => "BUTTON_SPARE";',
    'ui/card.js': 'export const Card = () => "CARD_CODE";',
    'ui/index.js': 'export { Button } from "./button.js";\nexport { Card } from "./card.js";',
    'main.js': 'import { Button } from "./ui/index.js";\nglobalThis.results.out = Button();',
  });
  try {
    const built = result();
    const text = chunkText(project, built);
    assert.match(text, /BUTTON/);
    assert.doesNotMatch(text, /BUTTON_SPARE|CARD_CODE/);
  } finally {
    project.cleanup();
  }
});

test('with source maps, a line of the shaken code points at the line of the source it came from', () => {
  const source = ['export const gone = () => "GONE";', 'export const kept = () => "KEPT";'].join('\n');
  const standIn = (code, { keep, sourceMap }) => {
    const shaken = removeUnusedLines(code, { keep });
    if (!sourceMap) return shaken;
    // The code is the source from its first line, so a line of the answer is found in it by its text.
    const original = code.split('\n');
    const lines = shaken.split('\n').map((text) => ({ path: 'p', line: Math.max(1, original.indexOf(text) + 1) }));
    return { code: shaken, map: createSourceMap({ file: 'x', lines, sources: { p: { text: code, file: 'p' } } }) };
  };
  const { project, config } = buildProject({ 'lib.js': source, 'main.js': 'import { kept } from "./lib.js";\nglobalThis.results.out = kept();' }, { treeShake: standIn, sourceMaps: true });
  try {
    const built = build(config);
    const chunk = built.chunks[built.pages.main.entryChunk];
    const text = readFileSync(join(project.projectRoot, 'out', chunk.javascript), 'utf8');
    const map = JSON.parse(readFileSync(join(project.projectRoot, 'out', chunk.sourceMap), 'utf8'));
    const keptLine = text.split('\n').findIndex((line) => line.includes('"KEPT"'));
    assert.ok(keptLine >= 0, text);
    assert.deepEqual(map.sources, ['lib.js', 'main.js']);
    assert.match(map.mappings.split(';')[keptLine], /^AAC[A-Z]/, 'the line is mapped, to line 2 of lib.js');
    assert.doesNotMatch(text, /GONE/);
  } finally {
    project.cleanup();
  }
});

test('the build says what is wrong when the tool answers badly, naming the module and what to write', () => {
  const files = { 'lib.js': 'export const a = 1;', 'main.js': 'import { a } from "./lib.js";\nglobalThis.results.out = a;' };
  const failWith = (treeShake, overrides) => {
    const { project, result } = buildProject(files, { treeShake, ...overrides });
    try {
      return assert.throws(result, (error) => {
        failWith.message = error.message;
        return true;
      });
    } finally {
      project.cleanup();
    }
  };
  failWith(() => 42);
  assert.match(failWith.message, /^treeShake \(module "[^"]+"\): returned number, and with sourceMap: false it must return the code as a string\. Write treeShake: esbuildTreeShake\(esbuild\)/);
  failWith(async () => 'x');
  assert.match(failWith.message, /returned a Promise\. The build cannot wait here, so treeShake must be synchronous/);
  failWith((code) => `import { x } from "./y.js";\n${code}`);
  assert.match(failWith.message, /the code it returned has an import or export statement \(line 1: import \{ x \} from "\.\/y\.js";\)\. The bundler took those out of the code it gave/);
  failWith(() => {
    throw new Error('Unexpected token at line 3');
  });
  assert.match(failWith.message, /^treeShake \(module "[^"]+"\): Unexpected token at line 3\. Fix the code at the line it names/);
  failWith((code) => code, { sourceMaps: true });
  assert.match(failWith.message, /with sourceMap: true \(sourceMaps is on\) it must return \{ code, map \}/);
  failWith((code) => ({ code, map: { version: 2, mappings: '' } }), { sourceMaps: true });
  assert.match(failWith.message, /"map" must be a source map of version 3/);
});

test('treeShake is checked in the configuration, and esbuildTreeShake checks what it is given', () => {
  assert.deepEqual(checkConfig({ treeShake: null }), []);
  assert.deepEqual(checkConfig({ treeShake: () => '' }), []);
  assert.equal(checkConfig({ treeShake: true })[0], 'build config "treeShake": must be a function. Write treeShake: esbuildTreeShake(esbuild), with import { esbuildTreeShake } from \'@ehtb/agent-ui/build/tree-shake.mjs\' (docs/BUILD.md, "Tree shaking")');
  assert.match(checkConfig({ treeshake: () => '' })[0], /unknown option\. Did you mean "treeShake"\?/);
  assert.throws(() => esbuildTreeShake({}), { message: "esbuildTreeShake: the first argument must be the esbuild module (it has no transformSync). Write: import * as esbuild from 'esbuild'; esbuildTreeShake(esbuild)" });
  assert.throws(() => esbuildTreeShake({ transformSync() {} }, { pure: 'defineElement' }), /pure must be a list of the names of calls that have no effect/);
});

test('esbuildTreeShake gives esbuild the names to keep as a call at the end, and returns the code without it', () => {
  const seen = [];
  const esbuild = {
    transformSync(input, options) {
      seen.push({ input, options });
      return { code: `const a = 1;\n${input.slice(input.lastIndexOf('__agentUiKeep__('))}`, map: '{"version":3,"mappings":""}' };
    },
  };
  const shake = esbuildTreeShake(esbuild, { pure: ['makeThing'] });
  assert.equal(shake('const a = 1;\nconst b = 2;', { file: 'lib.js', keep: ['a', 'reexport$c'], sourceMap: false }), 'const a = 1;\n');
  assert.match(seen[0].input, /\n__agentUiKeep__\(a, reexport\$c\);\n$/);
  assert.deepEqual({ ...seen[0].options }, { loader: 'js', treeShaking: true, pure: ['makeThing'], sourcefile: 'lib.js', sourcemap: false, legalComments: 'none', logLevel: 'silent' });
  assert.deepEqual(shake('', { file: 'lib.js', keep: [], sourceMap: true }), { code: 'const a = 1;\n', map: '{"version":3,"mappings":""}' });
  assert.equal(seen[1].options.sourcemap, 'external');
  const broken = esbuildTreeShake({ transformSync: () => ({ code: 'const a = 1;\n' }) });
  assert.throws(() => broken('', { file: 'lib.js', keep: [], sourceMap: false }), /did not keep the call that lists the names to keep \(module lib\.js\)/);
});
