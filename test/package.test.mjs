// The framework as a package: what package.json promises, and a project that installs it under node_modules, imports it
// by name and builds with the command line tool.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8'));

test('the package has no dependencies of any kind (a requirement of the project)', () => {
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies', 'bundledDependencies']) {
    assert.equal(manifest[field], undefined, `${field} must not exist`);
  }
});

test('package.json describes an importable ES module package', () => {
  assert.equal(manifest.type, 'module');
  assert.notEqual(manifest.private, true);
  assert.ok(manifest.name && manifest.version && manifest.description);
  assert.equal(manifest.main, './src/ui.js');
  assert.ok(manifest.engines.node);
  // Every export target and every published path exists.
  for (const [subpath, target] of Object.entries(manifest.exports)) {
    const files = typeof target === 'string' ? [target] : Object.values(target);
    for (const file of files) {
      if (file.includes('*')) assert.ok(existsSync(join(repositoryRoot, dirname(file))), `${subpath}: ${file}`);
      else assert.ok(existsSync(join(repositoryRoot, file)), `${subpath} -> ${file} is missing`);
    }
  }
  for (const entry of manifest.files) assert.ok(existsSync(join(repositoryRoot, entry)), `files: ${entry} is missing`);
  assert.ok(!manifest.files.includes('AGENTS.md'), 'the root AGENTS.md is for work on the framework and is not published; app authors read docs/AGENT-RULES.md');
  assert.ok(existsSync(join(repositoryRoot, manifest.bin['agent-ui'])));
  // Every public module with a declaration file is exported, so nothing documented is unreachable.
  const exported = new Set(Object.values(manifest.exports).flatMap((target) => (typeof target === 'string' ? [target] : Object.values(target))));
  for (const file of readdirSync(join(repositoryRoot, 'src')).filter((name) => name.endsWith('.d.ts'))) {
    assert.ok(exported.has(`./src/${file}`), `src/${file} is not reachable through "exports"`);
  }
});

test('every export resolves to a module that loads', async () => {
  for (const subpath of Object.keys(manifest.exports).filter((key) => !key.includes('*') && key !== './package.json' && key !== './devtools')) {
    const module = await import(`${manifest.name}${subpath === '.' ? '' : subpath.slice(1)}`);
    assert.ok(Object.keys(module).length > 0, subpath);
  }
});

// A project with the framework installed the way a package manager does it: a copy under node_modules.
const createInstalledProject = () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-ui-installed-'));
  const installed = join(root, 'node_modules/@ehtb/agent-ui');
  mkdirSync(installed, { recursive: true });
  for (const entry of [...manifest.files, 'package.json']) cpSync(join(repositoryRoot, entry), join(installed, entry), { recursive: true });
  const write = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write('package.json', '{"name":"my-site","private":true,"type":"module"}');
  write('pages/page.js', [
    "export const page = { head: { title: 'Home' } };",
    "if (typeof location !== 'undefined' && location.search.includes('debug')) import('@ehtb/agent-ui/devtools');",
  ].join('\n'));
  write('pages/view.js', "import { p } from '@ehtb/agent-ui/spec';\nexport const view = p({ id: 'home' }, 'home');");
  write('pages/style.css', 'p { color: red; }');
  write('pages/about/page.js', "export const page = { head: { title: 'About' } };");
  write('pages/about/view.js', "import { p } from '@ehtb/agent-ui/spec';\nexport const view = p({ id: 'about' }, 'about');");
  write('build.config.mjs', [
    "import { frameworkBuildOptions } from '@ehtb/agent-ui/build/presets.mjs';",
    "export default ({ dev = false, validator } = {}) => ({ ...frameworkBuildOptions({ dev, validator }), outDir: 'dist' });",
  ].join('\n'));
  return { root, write, cleanup: () => rmSync(root, { recursive: true, force: true }) };
};
const runTool = (root, ...args) =>
  spawnSync(process.execPath, [join(root, 'node_modules/@ehtb/agent-ui/bin/agent-ui.mjs'), ...args], { cwd: root, encoding: 'utf8' });

test('an installed copy builds with the agent-ui command: imports by package name, runtime in its own chunk', () => {
  const project = createInstalledProject();
  try {
    const built = runTool(project.root, 'build');
    assert.equal(built.status, 0, built.stderr + built.stdout);
    const output = JSON.parse(readFileSync(join(project.root, 'dist/manifest.json'), 'utf8'));
    assert.deepEqual(Object.keys(output.pages).sort(), ['about', 'index']); // the page "/" is index.html
    assert.equal('rewrites' in output, false, 'the manifest holds no rewrite rules: a server always runs and renders the URLs itself');
    // The runtime (and, in production, the validator's primitives) sit in one shared chunk named agent-ui, loaded by both pages.
    assert.deepEqual(output.chunks['agent-ui'].modules.map((path) => path.split('/').slice(-3).join('/')).sort(), ['agent-ui/src/error-messages.js', 'agent-ui/src/errors.js', 'agent-ui/src/messages.js', 'agent-ui/src/namespaces.js', 'agent-ui/src/runtime-checks.js', 'agent-ui/src/spec-core.js', 'agent-ui/src/ui.js', 'agent-ui/src/validate.js']);
    assert.ok(output.pages.index.chunksLoadedAtStartup.includes('agent-ui') && output.pages.about.chunksLoadedAtStartup.includes('agent-ui'));
    assert.ok(output.chunks.devtools && !output.chunks.devtools.loadsEagerly); // import('@ehtb/agent-ui/devtools') is a lazy chunk
    assert.match(readFileSync(join(project.root, 'dist', output.chunks['agent-ui'].javascript), 'utf8'), /validate = \(\) => \[\]/); // the stub: validator omitted
    for (const chunk of Object.values(output.chunks)) {
      const check = spawnSync(process.execPath, ['--check', join(project.root, 'dist', chunk.javascript)], { encoding: 'utf8' });
      assert.equal(check.status, 0, `${chunk.javascript}: ${check.stderr}`);
    }

    const development = runTool(project.root, 'build', '--dev', '--out=dist-dev');
    assert.equal(development.status, 0, development.stderr + development.stdout);
    const devOutput = JSON.parse(readFileSync(join(project.root, 'dist-dev/manifest.json'), 'utf8'));
    assert.ok(devOutput.chunks.validator, 'development keeps the validator as its own chunk');
  } finally {
    project.cleanup();
  }
});

test('an installed copy writes the agent block from the docs/AGENT-RULES.md it ships', () => {
  const project = createInstalledProject();
  try {
    const init = runTool(project.root, 'init');
    assert.equal(init.status, 0, init.stderr + init.stdout);
    const text = readFileSync(join(project.root, 'AGENTS.md'), 'utf8');
    assert.match(text, new RegExp(`node_modules/${manifest.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/docs/AGENT-RULES\\.md`));
    assert.ok(!text.includes(`node_modules/${manifest.name}/AGENTS.md`), 'the root AGENTS.md is for the framework, not an installed project');
  } finally {
    project.cleanup();
  }
});

test('the command line tool names its commands and rejects unknown ones', () => {
  const unknown = spawnSync(process.execPath, [join(repositoryRoot, 'bin/agent-ui.mjs'), 'launch'], { encoding: 'utf8' });
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /unknown command "launch"\. Commands: build, dev, serve, check, schema, explain, init\n$/);
});

test('a package that is not installed, or an export that does not exist, fails with the fix in the message', async () => {
  const { build } = await import('../build/build.mjs');
  const project = createInstalledProject();
  try {
    project.write('extra/main.js', "import { nothing } from '@ehtb/agent-ui/missing';\nnothing();");
    assert.throws(
      () => build({ projectRoot: project.root, entries: [{ name: 'extra', path: 'extra/main.js' }], outDir: 'out' }),
      /extra\/main\.js:\d+: package "@ehtb\/agent-ui" does not export "\.\/missing" \(import "@ehtb\/agent-ui\/missing"\)\. Exported: \./,
    );
  } finally {
    project.cleanup();
  }
});

// ---- every command of the installed tool starts ---------------------------------------------------------------------------

const freePort = async () => {
  const { createServer } = await import('node:http');
  const probe = createServer();
  await new Promise((resolveListening) => probe.listen(0, resolveListening));
  const { port } = probe.address();
  await new Promise((resolveClosed) => probe.close(resolveClosed));
  return port;
};

const runUntilAnswered = async (root, args, path) => {
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, [join(root, 'node_modules/@ehtb/agent-ui/bin/agent-ui.mjs'), ...args], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  const port = Number(args.find((argument) => argument.startsWith('--port=')).split('=')[1]);
  try {
    for (let attempt = 0; attempt < 60; attempt++) {
      if (child.exitCode !== null) assert.fail(`${args[0]} exited early: ${output}`);
      try {
        return (await fetch(`http://localhost:${port}${path}`)).status;
      } catch {
        await new Promise((wait) => setTimeout(wait, 50));
      }
    }
    assert.fail(`${args[0]} never answered: ${output}`);
  } finally {
    child.kill();
  }
};

test('agent-ui serve refuses a build that is older than the sources, and a missing one, and says how to fix it; --out names the build', () => {
  const project = createInstalledProject();
  try {
    const missing = runTool(project.root, 'serve', '--port=1');
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /agent-ui serve: the build in dist\/ cannot be served: dist\/manifest\.json does not exist\. Run agent-ui build first/);
    const built = runTool(project.root, 'build', '--out=elsewhere');
    assert.equal(built.status, 0, built.stderr);
    assert.match(built.stdout, /Serve it: agent-ui serve --out=elsewhere/);
    const stamped = JSON.parse(readFileSync(join(project.root, 'elsewhere/manifest.json'), 'utf8')).sources.files;
    assert.ok(stamped.includes('pages/view.js') && stamped.includes('build.config.mjs'), `the stamp names the view and the configuration, not only the browser modules: ${stamped}`);
    project.write('pages/style.css', 'p { color: blue; }');
    const styled = runTool(project.root, 'serve', '--out=elsewhere', '--port=1');
    assert.match(styled.stderr, /the build in elsewhere\/ cannot be served: a source file changed after it was built/, 'a shared stylesheet is part of the stamp');
    project.write('pages/style.css', 'p { color: red; }');
    project.write('pages/view.js', "import { p } from '@ehtb/agent-ui/spec';\nexport const view = p({ id: 'home' }, 'changed after the build');");
    const stale = runTool(project.root, 'serve', '--out=elsewhere', '--port=1');
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /the build in elsewhere\/ cannot be served: a source file changed after it was built.* Run agent-ui build --out=elsewhere first/);
  } finally {
    project.cleanup();
  }
});

test('agent-ui serve refuses a build that lacks a page added since, and one whose page file is gone', () => {
  const project = createInstalledProject();
  try {
    const built = runTool(project.root, 'build');
    assert.equal(built.status, 0, built.stderr);
    project.write('pages/team/page.js', "export const page = { head: { title: 'Team' } };");
    project.write('pages/team/view.js', "import { p } from '@ehtb/agent-ui/spec';\nexport const view = p({ id: 'team' }, 'team');");
    const added = runTool(project.root, 'serve', '--port=1');
    assert.equal(added.status, 1);
    assert.match(added.stderr, /cannot be served: the page team is not in it\. Run agent-ui build first/);
    rmSync(join(project.root, 'pages/team'), { recursive: true });
    rmSync(join(project.root, 'dist/index.html'));
    const gone = runTool(project.root, 'serve', '--port=1');
    assert.equal(gone.status, 1);
    assert.match(gone.stderr, /cannot be served: index\.html is missing from it\. Run agent-ui build first/);
  } finally {
    project.cleanup();
  }
});

test('agent-ui build --static writes every page as a file; without the flag nothing is rendered at build time', () => {
  const project = createInstalledProject();
  try {
    const plain = runTool(project.root, 'build', '--out=plain');
    assert.equal(plain.status, 0, plain.stderr + plain.stdout);
    assert.equal(existsSync(join(project.root, 'plain/about/index.html')), false);
    const built = runTool(project.root, 'build', '--static', '--out=static');
    assert.equal(built.status, 0, built.stderr + built.stdout);
    assert.match(built.stdout, /static pages: .*\/about/);
    assert.match(readFileSync(join(project.root, 'static/about/index.html'), 'utf8'), /<!--ssr:start-->/);
  } finally {
    project.cleanup();
  }
});

test('agent-ui serve, dev and check run from an installed copy', async () => {
  const project = createInstalledProject();
  try {
    const rebuilt = runTool(project.root, 'build');
    assert.equal(rebuilt.status, 0, rebuilt.stderr + rebuilt.stdout);
    const checked = runTool(project.root, 'check');
    assert.equal(checked.status, 0, checked.stderr + checked.stdout);
    assert.match(checked.stdout, /ok: 2 pages rendered and checked/);
    assert.equal(await runUntilAnswered(project.root, ['serve', `--port=${await freePort()}`], '/about'), 200);
    assert.equal(await runUntilAnswered(project.root, ['dev', `--port=${await freePort()}`], '/about.html'), 200);
    const schema = runTool(project.root, 'schema', join(project.root, 'out.schema.json'));
    assert.equal(schema.status, 0, schema.stderr);
    assert.equal(JSON.parse(readFileSync(join(project.root, 'out.schema.json'), 'utf8')).$schema.includes('2020-12'), true);
  } finally {
    project.cleanup();
  }
});
