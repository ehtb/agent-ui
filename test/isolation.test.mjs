// The framework's tests stand on their own: they use test/fixtures and never open anything below examples/ or cookbook/
// (those are checked by `npm run test:examples`, test/examples/). A framework test that starts to read one fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const testDirectory = import.meta.dirname;
const files = [...readdirSync(testDirectory).filter((name) => /\.mjs$/.test(name)), ...readdirSync(join(testDirectory, 'support')).filter((name) => /\.mjs$/.test(name)).map((name) => `support/${name}`)]
  .filter((name) => name !== 'run-examples.mjs'); // it runs the examples; that is its job

test('no framework test or helper reads examples/ or cookbook/', () => {
  const offenders = [];
  for (const name of files) {
    if (name === 'isolation.test.mjs') continue;
    const text = readFileSync(join(testDirectory, name), 'utf8');
    // Code, not comments: a line comment may say where something used to come from.
    const code = text.split('\n').filter((line) => !line.trimStart().startsWith('//')).join('\n');
    // docs.test.mjs only lets documentation mention example paths (its path pattern and the filter for them) and checks that they exist; it builds nothing from them.
    for (const match of code.matchAll(/(?:'|"|`|\/)(examples|cookbook)(?:\/|'|"|`)/g)) {
      const line = code.slice(code.lastIndexOf('\n', match.index) + 1, code.indexOf('\n', match.index));
      if (name === 'docs.test.mjs' && line.includes("!match[1].startsWith('examples/')")) continue; // the one filter that skips example paths
      offenders.push(`${name}: ${match[0]}`);
    }
  }
  assert.deepEqual(offenders, [], 'Use a fixture from test/fixtures (test/copy-fixture.mjs). Tests of examples and the cookbook live in test/examples/');
});
