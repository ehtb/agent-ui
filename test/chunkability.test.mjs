// The package is made of entry points that can be bundled, loaded and dropped one at a time. This test builds the module
// graph of every browser-side entry and checks what it reaches: its own file and the shared primitives, nothing else.
// If a plugin starts importing another plugin, the runtime starts importing the devtools, or a browser entry reaches
// Node-side code, the list here changes and the test says which entry grew.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildModuleGraph } from '../build/module-graph.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const reached = (file) => buildModuleGraph({ projectRoot: root, entries: [{ name: 'probe', path: file }] }).order.slice().sort();

// The runtime and what it always brings: the validator (swapped for a stub in production builds) and shared primitives.
const RUNTIME = ['src/base-path.js', 'src/base-path-checks.js', 'src/devtools.js', 'src/error-messages.js', 'src/errors.js', 'src/grammar.js', 'src/handler-checks.js', 'src/messages.js', 'src/namespaces.js', 'src/runtime-checks.js', 'src/spec-core.js', 'src/ui.js', 'src/validate.js'];

// What each entry reaches. The shared primitives (spec-core, messages) are small and used by everything; the runtime and
// the validator are reached only by the entries that need them.
const PRIMITIVES = ['src/messages.js', 'src/spec-core.js'];
const EXPECTED = {
  'src/ui.js': RUNTIME,
  'src/url-pattern.js': ['src/url-pattern.js'],
  'src/resources.js': ['src/resources.js', 'src/messages.js', 'src/spec-core.js'],
  'src/window-events.js': ['src/window-events.js', 'src/window-events-checks.js', 'src/grammar.js', 'src/handler-checks.js', 'src/namespaces.js', ...PRIMITIVES],
  'src/spec-tools.js': ['src/spec-tools.js', 'src/spec-walk.js', 'src/grammar.js', 'src/handler-checks.js', 'src/error-messages.js', 'src/validate.js', 'src/namespaces.js', ...PRIMITIVES],
  'src/components.js': ['src/components.js', ...PRIMITIVES],
  // Builders: the dev checks (swapped for a stub in production) bring the tables of the grammar, not the validator.
  'src/spec.js': ['src/spec.js', 'src/spec-checks.js', 'src/handler-checks.js', 'src/hydrate.js', 'src/base-path.js', 'src/grammar.js', 'src/namespaces.js', ...PRIMITIVES],
  'src/sync-apps.js': ['src/sync-apps.js', 'src/sync-apps-checks.js', ...PRIMITIVES],
  'src/memoize.js': ['src/memoize.js', 'src/messages.js'],
  // The plugin helper for drawing into an element: only a page whose plugins import it downloads it.
  'src/mount-element.js': ['src/mount-element.js', 'src/spec-walk.js', 'src/errors.js', 'src/error-messages.js', ...PRIMITIVES],
  'src/namespaces.js': ['src/namespaces.js'],
  'src/validate.js': ['src/validate.js', 'src/grammar.js', 'src/handler-checks.js', 'src/error-messages.js', 'src/namespaces.js', ...PRIMITIVES],
  'src/hydrate.js': ['src/hydrate.js', 'src/base-path.js'],
  // A shell brings the runtime and syncApps, and the navigation plugin the pages module: only a page that lists a shell downloads them.
  'src/shell.js': ['src/shell.js', 'src/shell-checks.js', 'src/sync-apps.js', 'src/sync-apps-checks.js', 'src/hydrate.js', ...RUNTIME],
  'src/navigation.js': ['src/navigation.js', 'src/document-markup-reader.js', 'src/pages.js', 'src/pages-checks.js', 'src/pages-server.js', 'src/hot.js', 'src/head.js', 'src/head-reader.js', 'src/head-document.js', 'src/html-escape.js', 'src/url-pattern.js', 'src/hydrate.js', ...RUNTIME],
  'src/devtools.js': ['src/devtools.js'],
  // The plugins behind `follow` and the sliding of rows: only a page that lists them downloads them.
  'src/follow.js': ['src/follow.js', 'src/spec-core.js'],
  // Both motion plugins share the primitives the runtime already loads (nextFrame, the page-plugin mark).
  'src/moves.js': ['src/moves.js', 'src/spec-core.js'],
};

for (const [entry, modules] of Object.entries(EXPECTED)) {
  test(`${entry} reaches ${modules.length} module${modules.length === 1 ? '' : 's'} and nothing from the build, the server or another plugin`, () => {
    assert.deepEqual(reached(entry), modules.slice().sort());
  });
}

test('the pages entry is the app() runtime, hydration, the lazily fetched devtools (debug: true), the URL patterns, and the two halves production builds swap for stubs (page checks, server-only parts)', () => {
  assert.deepEqual(reached('src/pages.js'), ['src/base-path-checks.js', 'src/base-path.js', 'src/devtools.js', 'src/error-messages.js', 'src/errors.js', 'src/grammar.js', 'src/handler-checks.js', 'src/head-document.js', 'src/head.js', 'src/hot.js', 'src/html-escape.js', 'src/hydrate.js', 'src/messages.js', 'src/namespaces.js', 'src/pages-checks.js', 'src/pages-server.js', 'src/pages.js', 'src/runtime-checks.js', 'src/spec-core.js', 'src/ui.js', 'src/url-pattern.js', 'src/validate.js']);
});

test('no browser-side module imports Node built-ins, the server or the build', () => {
  for (const name of readdirSync(join(root, 'src')).filter((file) => file.endsWith('.js'))) {
    const text = readFileSync(join(root, 'src', name), 'utf8');
    const imports = [...text.matchAll(/^import[^'"\n]*['"]([^'"]+)['"]/gm)].map((match) => match[1]);
    for (const specifier of imports) assert.ok(!specifier.startsWith('node:') && !specifier.includes('/server/') && !specifier.includes('/build/'), `src/${name} imports ${specifier}`);
  }
});

// The runtime is the one place that names the devtools, and only through a dynamic import(): a lazy chunk, fetched by an app that is
// made with debug: true and by nobody else.
test('the devtools are named by the runtime alone, so no other module can pull them in', () => {
  for (const name of readdirSync(join(root, 'src')).filter((file) => file.endsWith('.js') && file !== 'devtools.js' && file !== 'ui.js')) {
    assert.ok(!/devtools/.test(readFileSync(join(root, 'src', name), 'utf8').replace(/^\s*\/\/.*$/gm, '')), `src/${name} mentions the devtools in code`);
  }
});

test('src/ui.js reaches the devtools only through a dynamic import', () => {
  const code = readFileSync(join(root, 'src/ui.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.equal([...code.matchAll(/devtools\.js/g)].length, 1); // the import() and nothing else
  assert.match(code, /import\('\.\/devtools\.js'\)/);
  assert.doesNotMatch(code, /^import .*devtools/m);
});

test('package.json lets bundlers drop what is not imported: only CSS files have side effects, and no JavaScript module does', () => {
  assert.deepEqual(manifest.sideEffects, ['**/*.css']);
  // A module with an effect at import time would be dropped wrongly. The browser-side modules only declare things.
  for (const name of readdirSync(join(root, 'src')).filter((file) => file.endsWith('.js'))) {
    const code = readFileSync(join(root, 'src', name), 'utf8').split('\n').filter((line) => /^[A-Za-z(]/.test(line) && !/^(export|import|const|let|var|function|class|async)\b/.test(line));
    assert.deepEqual(code, [], `src/${name} runs code when it is imported: ${code.join(' | ')}`);
  }
});

test('the build pipeline is one entry point of its own, and nothing in the runtime or the plugins can reach it', () => {
  assert.ok('./build' in manifest.exports && manifest.exports['./build'].types);
  for (const entry of Object.keys(EXPECTED)) {
    for (const path of reached(entry)) assert.ok(!path.startsWith('build/') && !path.startsWith('server/') && !path.startsWith('cli/'), `${entry} reaches ${path}`);
  }
});
