// Source maps: the bundler keeps the lines of every module and writes a map that says which is which. The test builds a small
// project with comments, multi-line imports and a template literal that spans lines, then decodes the map and checks that every
// line it names holds the code the output line holds. The mapping is read back by a decoder written here, not the one under test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from '../build/build.mjs';
import { BuildError } from '../build/parse-module.mjs';
import { checkConfig } from '../build/config-check.mjs';
import { encodeVlq } from '../build/source-map.mjs';

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const decodeVlq = (text) => {
  const numbers = [];
  let value = 0;
  let shift = 0;
  for (const character of text) {
    const digit = BASE64.indexOf(character);
    value += (digit & 31) << shift;
    if (digit & 32) shift += 5;
    else {
      numbers.push(value & 1 ? -(value >> 1) : value >> 1);
      value = 0;
      shift = 0;
    }
  }
  return numbers;
};
// Per output line: { source, line } (line from 1) or null.
const decodeMappings = (mappings) => {
  let source = 0;
  let line = 0;
  return mappings.split(';').map((segment) => {
    if (!segment) return null;
    const [, sourceDelta, lineDelta] = decodeVlq(segment);
    source += sourceDelta;
    line += lineDelta;
    return { source, line: line + 1 };
  });
};

const files = {
  'package.json': '{"type":"module"}',
  'main.js': [
    '// the entry',
    'import {',
    '  first,',
    '  second,',
    '} from "./lib.js";   // multi-line import',
    '',
    '/* a block',
    '   comment */',
    'globalThis.result = [first(), second(), `a',
    'b`].join("|");',
  ].join('\n'),
  'lib.js': [
    '/** Documented. */',
    'export const first = () => {',
    '  // inside',
    '  return "one"; // trailing',
    '};',
    '',
    'export const second = () => "two";',
  ].join('\n'),
};

const makeProject = () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agent-ui-maps-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(projectRoot, path)), { recursive: true });
    writeFileSync(join(projectRoot, path), text);
  }
  return { projectRoot, cleanup: () => rmSync(projectRoot, { recursive: true, force: true }) };
};

test('encodeVlq writes the numbers the format defines', () => {
  assert.deepEqual([0, 1, -1, 15, 16, -16, 123, 1000].map(encodeVlq), ['A', 'C', 'D', 'e', 'gB', 'hB', '2H', 'w+B']);
});

for (const minify of [false, true]) {
  test(`${minify ? 'production' : 'development'} build with sourceMaps: every mapped line holds the code of the line it names, and the map is linked`, async () => {
    const { projectRoot, cleanup } = makeProject();
    try {
      const manifest = build({ projectRoot, entries: [{ name: 'main', path: 'main.js' }], outDir: 'out', hash: false, minify, sourceMaps: true });
      const chunk = manifest.chunks.main;
      assert.equal(chunk.sourceMap, '/assets/main.js.map');
      const code = readFileSync(join(projectRoot, 'out/assets/main.js'), 'utf8');
      const map = JSON.parse(readFileSync(join(projectRoot, 'out/assets/main.js.map'), 'utf8'));
      assert.ok(code.endsWith('//# sourceMappingURL=main.js.map\n'), 'the code points to its map');
      assert.equal(map.version, 3);
      assert.deepEqual(map.sources, ['lib.js', 'main.js']);
      assert.deepEqual(map.sourcesContent, [files['lib.js'], files['main.js']]);

      const outputLines = code.split('\n').slice(0, -2); // the pointer comment and the newline after it
      const mapped = decodeMappings(map.mappings);
      assert.equal(mapped.length, outputLines.length, 'one entry per output line');
      let checked = 0;
      mapped.forEach((origin, index) => {
        const output = outputLines[index].trim();
        if (!origin || !output) return;
        const original = map.sourcesContent[origin.source].split('\n')[origin.line - 1];
        const expected = original.replace(/^\s*export\s+/, '').trim();
        // The output line is the source line without its comments and indentation (and without `export`, or the import).
        assert.ok(expected.startsWith(output) || output.startsWith(expected.split('//')[0].trim()), `output line ${index + 1} "${output}" does not come from ${map.sources[origin.source]}:${origin.line} "${original}"`);
        checked++;
      });
      assert.ok(checked >= 6, `only ${checked} lines were compared`);
      // The two things a reader looks for: where `second` is defined, and where the string that spans lines starts.
      const lineOf = (text) => outputLines.findIndex((line) => line.includes(text));
      assert.deepEqual(mapped[lineOf('const second')], { source: 0, line: 7 });
      assert.deepEqual(mapped[lineOf('globalThis.result')], { source: 1, line: 9 });
    } finally {
      cleanup();
    }
  });
}

test('without sourceMaps there is no map, no pointer, and a production build is as small as it was', () => {
  const { projectRoot, cleanup } = makeProject();
  try {
    const plain = build({ projectRoot, entries: [{ name: 'main', path: 'main.js' }], outDir: 'out', hash: false, minify: true });
    assert.equal(plain.chunks.main.sourceMap, undefined);
    assert.ok(!readFileSync(join(projectRoot, 'out/assets/main.js'), 'utf8').includes('sourceMappingURL'));
    assert.doesNotMatch(readFileSync(join(projectRoot, 'out/assets/main.js'), 'utf8'), /\n\n/);
  } finally {
    cleanup();
  }
});

// A minifier for the tests, with no dependency: it drops empty lines and indents the others by two spaces, and writes its own map
// (from its output to the chunk it was given) with a column and a name for every `second`, the way a real minifier does.
const reflow = (code) => {
  const inputLines = code.split('\n');
  const kept = inputLines.map((text, line) => ({ text, line })).filter(({ text }) => text.trim());
  let previous = [0, 0, 0];
  const mappings = kept.map(({ text, line }) => {
    const segments = [[2, 0, line, 0]];
    const column = text.indexOf('second');
    if (column >= 0) segments.push([2 + column, 0, line, column, 0]);
    let previousColumn = 0;
    return segments.map((segment) => {
      let encoded = encodeVlq(segment[0] - previousColumn);
      previousColumn = segment[0];
      encoded += encodeVlq(segment[1] - previous[0]) + encodeVlq(segment[2] - previous[1]) + encodeVlq(segment[3] - previous[2]);
      previous = [segment[1], segment[2], segment[3]];
      if (segment.length === 5) encoded += encodeVlq(0); // names[0], relative to nothing before it in this small map
      return encoded;
    }).join(',');
  }).join(';');
  return { code: `${kept.map(({ text }) => `  ${text}`).join('\n')}\n`, map: JSON.stringify({ version: 3, sources: ['<stdin>'], names: ['second'], mappings }) };
};
// Per output line, every segment: { column, source, line (from 1), sourceColumn, name? }.
const decodeSegments = (map) => {
  const state = [0, 0, 0, 0];
  return map.mappings.split(';').map((lineText) => {
    let column = 0;
    return lineText.split(',').filter(Boolean).map((text) => {
      const numbers = decodeVlq(text);
      column += numbers[0];
      numbers.slice(1).forEach((number, index) => { state[index] += number; });
      return { column, source: state[0], line: state[1] + 1, sourceColumn: state[2], ...(numbers.length === 5 && { name: map.names[state[3]] }) };
    });
  });
};

for (const minify of [false, true]) {
  test(`sourceMaps with a transform (minify: ${minify}): the transform returns its own map, and the map written points at the source files`, () => {
    const { projectRoot, cleanup } = makeProject();
    const calls = [];
    try {
      const transform = (code, context) => {
        calls.push(context);
        return reflow(code);
      };
      assert.deepEqual(checkConfig({ sourceMaps: true, transform }), [], 'the two options go together');
      build({ projectRoot, entries: [{ name: 'main', path: 'main.js' }], outDir: 'out', hash: false, minify, sourceMaps: true, transform });
      assert.deepEqual(calls, [{ file: 'main', kind: 'javascript', sourceMap: true }]);
      const code = readFileSync(join(projectRoot, 'out/assets/main.js'), 'utf8');
      const map = JSON.parse(readFileSync(join(projectRoot, 'out/assets/main.js.map'), 'utf8'));
      assert.ok(code.endsWith('//# sourceMappingURL=main.js.map\n'), 'the build adds the pointer after the transform');
      assert.ok(!code.includes('\n\n'), 'the code written is the transform\'s');
      assert.deepEqual(map.sources, ['lib.js', 'main.js']);
      assert.deepEqual(map.sourcesContent, [files['lib.js'], files['main.js']]);

      const outputLines = code.split('\n');
      const segments = decodeSegments(map);
      const lineOf = (text) => outputLines.findIndex((line) => line.includes(text));
      assert.deepEqual(segments[lineOf('const second')][0], { column: 2, source: 0, line: 7, sourceColumn: 0 });
      assert.deepEqual(segments[lineOf('globalThis.result')][0], { column: 2, source: 1, line: 9, sourceColumn: 0 });
      // A position inside a line keeps its column in the output and its name; in the source it is the start of the line it names.
      const named = segments[lineOf('const second')][1];
      assert.deepEqual(named, { column: outputLines[lineOf('const second')].indexOf('second'), source: 0, line: 7, sourceColumn: 0, name: 'second' });
      // Lines the bundler wrote itself (the module wrapper) are in no source file and are not mapped.
      assert.deepEqual(segments[lineOf('const module_lib = (() => {')], []);
    } finally {
      cleanup();
    }
  });
}

test('a transform\'s result has one form for each call: the code, or { code, map } when sourceMap is true', () => {
  const { projectRoot, cleanup } = makeProject();
  const buildWith = (options) => () => build({ projectRoot, entries: [{ name: 'main', path: 'main.js' }], outDir: 'out', hash: false, ...options });
  const rejects = (options, pattern) => assert.throws(buildWith(options), (error) => error instanceof BuildError && pattern.test(error.message), String(pattern));
  try {
    assert.match(checkConfig({ sourceMaps: 'yes' })[0], /"sourceMaps": must be true or false/);
    rejects({ sourceMaps: true, transform: (code) => code }, /transform \(javascript of chunk "main"\): returned string, and with sourceMap: true \(sourceMaps is on\) it must return \{ code, map \}.*Write transform:/);
    rejects({ transform: (code) => ({ code, map: '{}' }) }, /transform \(javascript of chunk "main"\): returned object, and with sourceMap: false it must return the code as a string/);
    rejects({ sourceMaps: true, transform: (code) => ({ code, map: reflow(code).map, mapping: 1 }) }, /unknown key "mapping" in the result\. Return \{ code, map \} and nothing else/);
    rejects({ sourceMaps: true, transform: (code) => ({ code: 7, map: reflow(code).map }) }, /"code" must be the minified code as a string/);
    rejects({ sourceMaps: true, transform: (code) => ({ code, map: 'not json' }) }, /"map" is a string but not JSON/);
    rejects({ sourceMaps: true, transform: (code) => ({ code, map: { version: 2, mappings: '' } }) }, /"map" must be a source map of version 3/);
    rejects({ sourceMaps: true, transform: (code) => ({ code, map: { version: 3, mappings: '', sources: ['a.js', 'b.js'] } }) }, /"map" names 2 sources, and a transform of one chunk has one input/);
    rejects({ sourceMaps: true, transform: (code) => ({ code: `${code}//# sourceMappingURL=x.map\n`, map: reflow(code).map }) }, /ends with its own "\/\/# sourceMappingURL=" comment.*sourcemap: 'external'/);
  } finally {
    cleanup();
  }
});

test('a syntax the bundler does not support is reported with the file and the line', () => {
  const { projectRoot, cleanup } = makeProject();
  try {
    writeFileSync(join(projectRoot, 'lib.js'), 'export const a = 1;\n\n// text\nexport default 2;\n');
    assert.throws(() => build({ projectRoot, entries: [{ name: 'main', path: 'main.js' }], outDir: 'out' }), (error) => error instanceof BuildError && /^lib\.js:4: default exports/.test(error.message));
    writeFileSync(join(projectRoot, 'lib.js'), 'export const a = 1;\nexport let counter = 0;\n');
    assert.throws(() => build({ projectRoot, entries: [{ name: 'main', path: 'main.js' }], outDir: 'out' }), (error) => /^lib\.js:2: "export let counter"/.test(error.message));
    writeFileSync(join(projectRoot, 'lib.js'), 'export const a = 1;\nconst b = 2;\nimport { x } from "./nowhere.js";\n');
    assert.throws(() => build({ projectRoot, entries: [{ name: 'main', path: 'main.js' }], outDir: 'out' }), (error) => /^lib\.js:3: cannot find "\.\/nowhere\.js"/.test(error.message));
  } finally {
    cleanup();
  }
});
