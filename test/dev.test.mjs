// `agent-ui dev` rebuilds when any source the build read changes, wherever it is in the project: a page, a module two folders
// down that a page imports, and a new page folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { startDev } from '../cli/dev.mjs';

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
