// `agent-ui dev` rebuilds when any source the build read changes, wherever it is in the project: a page, a module two folders
// down that a page imports, and a new page folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { startDev } from '../cli/dev.mjs';
import { portFromOptions, UsageError } from '../cli/arguments.mjs';

const repository = resolve(import.meta.dirname, '..');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const waitFor = async (check, what) => {
  for (let attempt = 0; attempt < 240; attempt++) {
    if (check()) return;
    await sleep(50);
  }
  assert.fail(`timed out waiting for ${what}`);
};

test('a first build that fails stops the dev server instead of serving an empty output directory', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-ui-dev-failed-'));
  const write = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  mkdirSync(join(root, 'node_modules/@ehtb'), { recursive: true });
  symlinkSync(repository, join(root, 'node_modules/@ehtb/agent-ui'));
  write('package.json', '{"name":"dev-failure","private":true,"type":"module"}');
  write('build.config.mjs', `
    import { frameworkBuildOptions } from '@ehtb/agent-ui/build/presets.mjs';
    export default ({ dev }) => ({ ...frameworkBuildOptions({ dev, projectRoot: import.meta.dirname }), outDir: 'dist' });
  `);
  write('pages/page.js', "export const page = { head: { title: 'Home' } };\n");
  write('pages/view.js', "import { missing } from '../src/missing.js';\nexport const view = { tag: 'p', id: 'message', children: missing };\n");
  const originalError = console.error;
  console.error = () => {}; // the failed build is expected: keep the test output clean
  try {
    await assert.rejects(startDev({ root, port: 0, quiet: true }), /the first build failed, so there is no site to serve/);
  } finally {
    console.error = originalError;
    rmSync(root, { recursive: true, force: true });
  }
});

test('the port is --port, then PORT, then 8080; an empty PORT is unset and a bad one is a usage problem', () => {
  const saved = process.env.PORT;
  try {
    delete process.env.PORT;
    assert.equal(portFromOptions({}), 8080);
    process.env.PORT = '';
    assert.equal(portFromOptions({}), 8080, 'an empty PORT counts as unset');
    process.env.PORT = '9000';
    assert.equal(portFromOptions({}), 9000);
    assert.equal(portFromOptions({ port: 3000 }), 3000, '--port wins over PORT');
    process.env.PORT = '8O80';
    assert.throws(
      () => portFromOptions({}),
      (error) => error instanceof UsageError && error.message === 'PORT must be a whole number from 1 to 65535, got "8O80". Write PORT=8080, or pass --port=<number>',
    );
    for (const outside of ['0', '65536', '99999']) {
      process.env.PORT = outside;
      assert.throws(() => portFromOptions({}), (error) => error instanceof UsageError && error.message.includes(`PORT must be a whole number from 1 to 65535, got "${outside}"`), outside);
    }
    process.env.PORT = '65535';
    assert.equal(portFromOptions({}), 65535, 'the last valid port');
    for (const outside of [0, 65536]) {
      assert.throws(() => portFromOptions({ port: outside }), (error) => error instanceof UsageError && error.message.includes(`--port must be a whole number from 1 to 65535, got ${outside}. Write --port=8080`), String(outside));
    }
  } finally {
    if (saved === undefined) delete process.env.PORT;
    else process.env.PORT = saved;
  }
});

test('agent-ui dev with a PORT that is not a number stops with exit code 2 and the fix, before it builds anything', () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-ui-dev-port-env-'));
  try {
    const run = spawnSync(process.execPath, [join(repository, 'cli/dev.mjs')], { cwd: root, env: { ...process.env, PORT: 'http' }, encoding: 'utf8' });
    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /agent-ui dev: PORT must be a whole number from 1 to 65535, got "http"\. Write PORT=8080, or pass --port=<number>/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a port that is taken is a clear error with the port and the way to change it, and the watchers are closed', async () => {
  const { createServer } = await import('node:http');
  const root = mkdtempSync(join(tmpdir(), 'agent-ui-dev-port-'));
  const write = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  mkdirSync(join(root, 'node_modules/@ehtb'), { recursive: true });
  symlinkSync(repository, join(root, 'node_modules/@ehtb/agent-ui'));
  write('package.json', '{"name":"dev-port","private":true,"type":"module"}');
  write('build.config.mjs', `
    import { frameworkBuildOptions } from '@ehtb/agent-ui/build/presets.mjs';
    export default ({ dev }) => ({ ...frameworkBuildOptions({ dev, projectRoot: import.meta.dirname }), outDir: 'dist' });
  `);
  write('pages/page.js', "export const page = { head: { title: 'Home' } };\n");
  write('pages/view.js', "export const view = { tag: 'p', id: 'message', children: 'hi' };\n");
  const occupied = createServer();
  await new Promise((done) => occupied.listen(0, '127.0.0.1', done));
  const port = occupied.address().port;
  try {
    await assert.rejects(startDev({ root, port, quiet: true }), new RegExp(`agent-ui dev: cannot listen on 127\\.0\\.0\\.1:${port}: address already in use 127\\.0\\.0\\.1:${port}\\. Choose another port with --port=<number>`));
  } finally {
    await new Promise((done) => occupied.close(done));
    rmSync(root, { recursive: true, force: true });
  }
});

test('the dev server rebuilds when a module deep in the pages changes, and when a page is added', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-ui-dev-'));
  const write = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  mkdirSync(join(root, 'node_modules'), { recursive: true });
  mkdirSync(join(root, 'node_modules/@ehtb'), { recursive: true });
  symlinkSync(repository, join(root, 'node_modules/@ehtb/agent-ui'));
  write('package.json', '{"name":"dev-site","private":true,"type":"module"}');
  write('build.config.mjs', `
    import { frameworkBuildOptions } from '@ehtb/agent-ui/build/presets.mjs';
    export default ({ dev }) => ({ ...frameworkBuildOptions({ dev, projectRoot: import.meta.dirname }), outDir: 'dist' });
  `);
  write('pages/page.js', "export const page = { head: { title: 'Home' } };\n");
  write('pages/view.js', "import { message } from '../src/deep/er/message.js';\nexport const view = { tag: 'p', id: 'message', children: message };\n");
  write('src/deep/er/message.js', "export const message = 'first version';\n");
  const dev = await startDev({ root, port: 0, quiet: true });
  // dist/ is rewritten by every rebuild: a read in the middle of one sees a folder or a file that is not there yet, which is "not built yet".
  const builtText = () => {
    try {
      return readdirSync(join(root, 'dist/assets')).filter((name) => name.endsWith('.js')).map((name) => readFileSync(join(root, 'dist/assets', name), 'utf8')).join('\n');
    } catch (error) {
      if (error.code === 'ENOENT') return '';
      throw error;
    }
  };
  try {
    assert.ok(builtText().includes('first version'));
    await sleep(300); // a file system watcher can miss a change made in the first instants after it was created
    write('src/deep/er/message.js', "export const message = 'second version';\n");
    await waitFor(() => builtText().includes('second version'), 'the rebuild after editing a module two folders down');
    assert.equal(builtText().includes('first version'), false);
    // A new page folder is found by the next build.
    write('pages/about/page.js', "export const page = { head: { title: 'About' } };\n");
    write('pages/about/view.js', "export const view = { tag: 'p', id: 'about', children: 'about' };\n");
    await waitFor(() => existsSync(join(root, 'dist/about.html')), 'the rebuild after adding pages/about');
    // The build writes dist/ inside the project: that must not trigger another rebuild by itself.
    const marker = join(root, 'dist/rebuild-marker');
    writeFileSync(marker, 'x');
    await sleep(500);
    assert.ok(existsSync(marker), 'a file written to the output directory started a rebuild');
  } finally {
    dev.stop();
    rmSync(root, { recursive: true, force: true });
  }
});
