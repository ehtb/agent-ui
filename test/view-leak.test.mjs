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
