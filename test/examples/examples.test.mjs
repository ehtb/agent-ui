// The examples (examples/) as the documentation and standalone projects they are. These are not tests of the framework: they run with
// `npm run test:examples`, and nothing in test/*.test.mjs depends on an example.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyProject } from '../copy-fixture.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const examplesRoot = join(root, 'examples');
const exampleDirectories = readdirSync(examplesRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
const sourceFilesOf = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', 'dist'].includes(entry.name) || entry.name.startsWith('.output')) return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFilesOf(path) : /\.(js|mjs)$/.test(entry.name) ? [path] : [];
  });

test('every example is a standalone project: own package.json, framework as a dependency, no import leaving its folder', () => {
  assert.ok(exampleDirectories.length >= 10);
  for (const name of exampleDirectories) {
    const directory = join(examplesRoot, name);
    const exampleManifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
    assert.equal(exampleManifest.dependencies['@ehtb/agent-ui'], 'file:../..', `${name}: depends on the framework as a package`);
    assert.equal(exampleManifest.type, 'module', name);
    assert.ok(exampleManifest.scripts.test, `${name}: has its own test script`);
    assert.ok(existsSync(join(directory, 'README.md')), `${name}: own README`);
    // An example that uses the agent-ui command has its own build config; one that uses the framework as a library (islands) has no build.
    const usesCommand = Object.values(exampleManifest.scripts).some((script) => /\bagent-ui\b/.test(script));
    assert.equal(existsSync(join(directory, 'build.config.mjs')), usesCommand, `${name}: ${usesCommand ? 'uses the agent-ui command, so it has its own build.config.mjs' : 'has no agent-ui script, so it has no build.config.mjs'}`);
    for (const file of sourceFilesOf(directory)) {
      // Lines that are comments are not imports (a converted example may quote the original it came from).
      const text = readFileSync(file, 'utf8').split('\n').filter((line) => !line.trimStart().startsWith('//')).join('\n');
      for (const match of text.matchAll(/(?:from|import\()\s*'([^']+)'/g)) {
        const specifier = match[1];
        if (specifier.startsWith('.')) {
          const target = resolve(dirname(file), specifier);
          assert.ok(target.startsWith(directory), `${name}: ${file.slice(directory.length + 1)} imports ${specifier}, which leaves the example`);
        } else if (specifier === '@ehtb/agent-ui' || specifier.startsWith('@ehtb/agent-ui/')) {
          assert.ok(true);
        } else if (!specifier.startsWith('node:')) {
          // A package other than the framework must be one the example declares itself.
          const packageName = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
          assert.ok(packageName in { ...exampleManifest.dependencies, ...exampleManifest.devDependencies }, `${name}: imports "${specifier}" without declaring it`);
        }
      }
    }
  }
});

test('examples/README.md lists every example in both tables, with its run command and the number that need no registry', () => {
  const text = readFileSync(join(root, 'examples/README.md'), 'utf8');
  const examples = readdirSync(join(root, 'examples'), { withFileTypes: true }).filter((entry) => entry.isDirectory() && existsSync(join(root, 'examples', entry.name, 'package.json')));
  const own = (name) => {
    const exampleManifest = JSON.parse(readFileSync(join(root, 'examples', name, 'package.json'), 'utf8'));
    return Object.keys({ ...exampleManifest.dependencies, ...exampleManifest.devDependencies }).filter((dependency) => dependency !== manifest.name);
  };
  for (const { name } of examples) {
    assert.ok(new RegExp(`\\| \`${name}\`\\s+\\|`).test(text), `${name} is missing from the table of what each example shows`);
    assert.ok(text.includes(`\`npm run example -- ${name}\``), `${name} is missing from the table of run commands`);
  }
  const offline = examples.filter(({ name }) => own(name).length === 0).length;
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  assert.ok(text.includes(`no network for the first ${words[offline]}`), `examples/README.md should say "no network for the first ${words[offline]}" (${offline} examples need no registry)`);
});

test('the chunk table of examples/shop/README.md matches a real production build of the example (size and gzip, within 3%)', async () => {
  const { build } = await import('../../build/build.mjs');
  const { loadConfig } = await import('../../build/config.mjs');
  const projectRoot = join(root, 'examples/shop');
  const copy = copyProject(projectRoot, 'shop'); // a build writes .agent-ui/ and dist/: build a copy, which needs no install
  let chunks;
  try {
    chunks = build({ ...(await loadConfig({ root: copy.root })), projectRoot: copy.root, outDir: 'dist' }).chunks;
  } finally {
    copy.cleanup();
  }
  const readme = readFileSync(join(projectRoot, 'README.md'), 'utf8');
  const number = (text) => Number(text.replace(/,/g, ''));
  const rows = [...readme.matchAll(/^\| `([a-z0-9-]+)`\s+\| .* \|\s+([\d,]+) \|\s+([\d,]+) \|\s+[\d,]+ \|\s+[\d,]+ \|$/gm)].filter(([, name]) => name in chunks);
  assert.deepEqual(rows.map(([, name]) => name).sort(), Object.keys(chunks).sort(), 'every chunk of the build has a row in the first table');
  for (const [, name, size, gzip] of rows) {
    for (const [column, documented, measured] of [['Size', number(size), chunks[name].size.bytes], ['Gzip', number(gzip), chunks[name].size.gzipBytes]]) {
      assert.ok(Math.abs(documented - measured) <= Math.max(60, measured * 0.03), `examples/shop/README.md: ${name} ${column} says ${documented}, a build measures ${measured}. Re-measure the tables of the README`);
    }
  }
});
