// The point of splitting a page into page.js and view.js: a browser downloads behavior and the finished spec, never the code
// that builds the spec. Asserted once for every example that has pages and needs nothing beyond agent-ui (the others have their
// own dependencies and are built by their own tests): the spec builders (src/spec.js) are in no production chunk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../../build/build.mjs';
import { loadConfig } from '../../build/config.mjs';
import { copyProject } from '../copy-fixture.mjs';

const examplesRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../examples');

const examples = readdirSync(examplesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(examplesRoot, entry.name))
  .filter((root) => existsSync(join(root, 'pages', 'page.js')))
  .filter((root) => {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    return Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).every((name) => name === '@ehtb/agent-ui');
  });

test('there are examples to check', () => {
  assert.ok(examples.length >= 3, `found ${examples.length} examples that need nothing but agent-ui`);
});

for (const root of examples) {
  test(`${root.split('/').pop()}: no production chunk holds the spec builders`, async () => {
    const copy = copyProject(root, 'bundles'); // a build writes .agent-ui/ and dist/: build a copy, which needs no install
    let manifest;
    try {
      manifest = build({ ...(await loadConfig({ root: copy.root })), projectRoot: copy.root, outDir: 'dist' });
    } finally {
      copy.cleanup();
    }
    for (const [name, chunk] of Object.entries(manifest.chunks)) {
      const leaked = chunk.modules.filter((path) => /(^|\/)src\/spec\.js$/.test(path));
      assert.deepEqual(leaked, [], `chunk "${name}" holds ${leaked.join(', ')}: a module that page.js imports (directly or through a shared module) imports @ehtb/agent-ui/spec. Move the view-building code into a module that only view.js imports`);
    }
  });
}
