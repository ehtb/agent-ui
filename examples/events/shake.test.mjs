// Tree shaking with the real tool: this example's production build leaves out what no page uses (esbuild, `treeShake` in build.config.mjs), and a
// page's startup code is smaller for it. The framework's own tests use a stand-in tool; this is the one that runs esbuild itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { loadConfig } = await import('@ehtb/agent-ui/build/config.mjs');
const { build } = await import('@ehtb/agent-ui/build/build.mjs');
const projectRoot = dirname(fileURLToPath(import.meta.url));

test('the production build with tree shaking is smaller than the same build without it, and says by how much', async () => {
  const config = await loadConfig({ root: projectRoot, mode: { dev: false } });
  assert.equal(typeof config.treeShake, 'function', 'build.config.mjs turns tree shaking on for a production build');
  const outDirectories = ['.output-shaken', '.output-whole'];
  try {
    const shaken = build({ ...config, projectRoot, outDir: outDirectories[0] });
    const whole = build({ ...config, treeShake: null, projectRoot, outDir: outDirectories[1] });
    assert.ok(shaken.treeShaking.bytesAfter < shaken.treeShaking.bytesBefore, JSON.stringify(shaken.treeShaking));
    assert.equal(whole.treeShaking, undefined);
    for (const [name, page] of Object.entries(shaken.pages)) {
      assert.ok(page.startupSize.bytes < whole.pages[name].startupSize.bytes, `${name}: ${page.startupSize.bytes} bytes shaken, ${whole.pages[name].startupSize.bytes} whole`);
    }
  } finally {
    for (const directory of outDirectories) rmSync(join(projectRoot, directory), { recursive: true, force: true });
  }
});
