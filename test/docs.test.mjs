// The documentation and code comments are checked against the repository, so they cannot silently go stale:
// every file path they mention exists, every `npm run` script and `agent-ui` command exists, and every
// `@ehtb/agent-ui/...` import specifier resolves through package.json "exports".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFixture } from './copy-fixture.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const commands = ['build', 'dev', 'serve', 'check', 'schema', 'explain', 'init'];

const walk = (directory) =>
  readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.output') || name.startsWith('.')) return [];
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

// Framework text: sources, build tools, docs, entry points and the top-level guides (examples and test fixtures excluded).
const frameworkFiles = ['src', 'server', 'build', 'cli', 'bin', 'test/support', 'docs']
  .flatMap((directory) => walk(join(root, directory)))
  .concat(['README.md', 'AGENTS.md'].map((name) => join(root, name)))
  .filter((file) => /\.(js|mjs|ts|md)$/.test(file));

const mentions = (pattern) =>
  frameworkFiles.flatMap((file) => [...readFileSync(file, 'utf8').matchAll(pattern)].map((match) => ({ file: relative(root, file), match })));

test('every repository path mentioned in docs and comments exists', () => {
  // Paths such as src/ui.js or docs/BUILD.md; placeholders (<name>, *) and the examples' own files are not checked.
  const pattern = /(?<![\w/.@-])((?:src|server|cli|cookbook|skills|build|docs|testing|bin|test|examples)\/[A-Za-z0-9_./-]*[A-Za-z0-9_]\.(?:js|mjs|ts|md|css|json))(?![\w-])/g;
  const missing = mentions(pattern)
    .filter(({ match }) => !match[1].startsWith('examples/') || match[1].split('/').length <= 3)
    .filter(({ match }) => !existsSync(join(root, match[1])))
    .map(({ file, match }) => `${file}: ${match[1]}`);
  assert.deepEqual([...new Set(missing)], []);
});

test('every npm script mentioned exists', () => {
  const missing = mentions(/npm run ([a-z:-]+)/g).filter(({ match }) => !(match[1] in manifest.scripts)).map(({ file, match }) => `${file}: npm run ${match[1]}`);
  assert.deepEqual([...new Set(missing)], []);
});

test('every agent-ui command mentioned exists', () => {
  const unknown = mentions(/`agent-ui ([a-z]+)[`\s|]/g).filter(({ match }) => !commands.includes(match[1])).map(({ file, match }) => `${file}: agent-ui ${match[1]}`);
  assert.deepEqual([...new Set(unknown)], []);
});

test('every agent-ui import specifier mentioned resolves through "exports"', () => {
  const exported = Object.keys(manifest.exports);
  const resolves = (specifier) => {
    const subpath = specifier === manifest.name ? '.' : `.${specifier.slice(manifest.name.length)}`;
    return exported.some((key) => (key.includes('*') ? subpath.startsWith(key.slice(0, key.indexOf('*'))) && subpath.endsWith(key.slice(key.indexOf('*') + 1)) : key === subpath));
  };
  const name = manifest.name.replace(/[\\^$.*+?()[\]{}|/-]/g, '\\$&');
  const specifiers = mentions(new RegExp(`from '(${name}(?:\\/[A-Za-z0-9._/-]+)?)'|import\\('(${name}(?:\\/[A-Za-z0-9._/-]+)?)'\\)`, 'g'));
  assert.ok(specifiers.length > 10, `only ${specifiers.length} import specifiers of ${manifest.name} found: the pattern no longer matches how the docs write them`);
  const bad = specifiers
    .map(({ file, match }) => ({ file, specifier: match[1] ?? match[2] }))
    .filter(({ specifier }) => !resolves(specifier))
    .map(({ file, specifier }) => `${file}: ${specifier}`);
  assert.deepEqual([...new Set(bad)], []);
});

test('the sizes in the README match a real production build of test/fixtures/shell-site (within 1 KB)', async () => {
  const { build } = await import('../build/build.mjs');
  const { loadConfig } = await import('../build/config.mjs');
  const project = copyFixture('shell-site');
  let chunks;
  try {
    chunks = build({ ...(await loadConfig({ root: project.root })), projectRoot: project.root, outDir: 'dist' }).chunks;
  } finally {
    project.cleanup();
  }
  const runtime = chunks['agent-ui'];
  assert.ok(runtime, `no runtime chunk among ${Object.keys(chunks).join(', ')}`);
  const raw = runtime.size.bytes / 1024;
  const gzip = runtime.size.gzipBytes / 1024;
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  const [, documentedRaw, documentedGzip] = readme.match(/about (\d+) KB, (\d+) KB gzipped/) ?? [];
  assert.ok(documentedRaw, 'README.md: the runtime size sentence "about N KB, M KB gzipped" is missing');
  assert.ok(Math.abs(raw - Number(documentedRaw)) <= 1, `README says ${documentedRaw} KB raw, a build measures ${raw.toFixed(1)} KB. Update README.md and docs/DESIGN.md`);
  assert.ok(Math.abs(gzip - Number(documentedGzip)) <= 1, `README says ${documentedGzip} KB gzipped, a build measures ${gzip.toFixed(1)} KB. Update README.md and docs/DESIGN.md`);
});

