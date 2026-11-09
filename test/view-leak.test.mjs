// The build warns when a browser bundle holds the spec builders (build/leak-check.mjs); it does not stop the build.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../build/build.mjs';
import { formatReport } from '../build/write-site.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = '.output-view-leak';
after(() => rmSync(join(root, outDir), { recursive: true, force: true }));

const buildEntry = (file) => build({ projectRoot: root, outDir, entries: [{ name: 'page', path: `test/fixtures/view-leak/${file}` }] });

test('a browser entry that reaches the builders gets a warning naming the import chain', () => {
  const manifest = buildEntry('entry.js');
  assert.deepEqual(manifest.warnings, [
    'src/spec.js is in a browser bundle (test/fixtures/view-leak/entry.js -> test/fixtures/view-leak/helper.js -> src/spec.js). It builds specs and belongs to view.js only, so the page downloads code it never runs. Move what imports it into a module that only view.js imports',
  ]);
  assert.match(formatReport(manifest), /\nwarning: src\/spec\.js is in a browser bundle/);
});

test('an entry without the builders gets no warning', () => {
  assert.deepEqual(buildEntry('clean.js').warnings, []);
});

test('a production page that imports its own view.js is still warned about: only a development entry imports view.js on purpose', () => {
  const manifest = buildEntry('page-imports-view.js');
  assert.equal(manifest.warnings.length, 1, JSON.stringify(manifest.warnings));
  assert.match(manifest.warnings[0], /src\/spec\.js is in a browser bundle \(test\/fixtures\/view-leak\/page-imports-view\.js -> test\/fixtures\/view-leak\/view-in-entry\.js -> src\/spec\.js\)/);
});

test('a module reached through import() is named in the chain too: the browser downloads it as well', () => {
  const manifest = buildEntry('dynamic-entry.js');
  assert.match(manifest.warnings[0], /src\/spec\.js is in a browser bundle \(test\/fixtures\/view-leak\/dynamic-entry\.js -> test\/fixtures\/view-leak\/helper\.js -> src\/spec\.js\)/);
});
