// Builds this example with the framework's bundler (production settings), checks the output, and runs the built chunk.
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { fireEvent, findByClass, findByTag, createWindow, createRoot, shimDocument } from '@ehtb/agent-ui/testing/dom-shim.mjs';
import { build } from '@ehtb/agent-ui/build/build.mjs';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const outDir = '.output-test';

test('the built page: runtime in its own chunk, entry chunk, CSS, lazy devtools (JavaScript only); the chunks run', async () => {
  const { loadConfig } = await import('@ehtb/agent-ui/build/config.mjs');
  const { chunks, pages } = build({ ...(await loadConfig({ root: projectRoot })), projectRoot, outDir });
  try {
    // The runtime is an external, cacheable chunk loaded at startup. In production the validator is replaced by a stub that
    // lives inside it, so there is no separate validator download.
    assert.ok(chunks['agent-ui'].modules.some((path) => path.endsWith('src/ui.js')));
    assert.ok(!chunks.validator);
    assert.ok(!chunks.index.modules.some((path) => path.endsWith('src/ui.js')));
    assert.ok(pages.index.chunksLoadedAtStartup.includes('agent-ui'));
    // The page and the framework code it uses are bundled into its own chunk (it is the only page); devtools is fetched on demand.
    assert.ok(chunks.index.modules.some((path) => path.endsWith('src/pages.js')));
    assert.deepEqual(pages.index.lazyChunks, ['devtools']);
    assert.ok(chunks.devtools && !chunks.devtools.loadsEagerly);
    assert.ok(chunks.index.stylesheet);
    assert.match(readFileSync(join(projectRoot, outDir, chunks.index.javascript), 'utf8'), /const module_page = /);

    const html = readFileSync(join(projectRoot, outDir, 'index.html'), 'utf8');
    assert.match(html, /<script type="module" src="\/assets\/index\.[0-9a-f]{8}\.js">/);
    assert.doesNotMatch(html, /<style|function\s*\(|=>/); // no inline CSS or JS
    assert.doesNotMatch(html, /<script(?![^>]*type="module")/); // no classic script: the page is served over http

    // Every emitted chunk must be valid JavaScript.
    for (const chunk of Object.values(chunks)) {
      const check = spawnSync(process.execPath, ['--check', join(projectRoot, outDir, chunk.javascript)], { encoding: 'utf8' });
      assert.equal(check.status, 0, `${chunk.javascript}: ${check.stderr}`);
    }

    // Behaviour: run the built entry chunk against the shim.
    const root = createRoot();
    const win = createWindow('/');
    globalThis.window = win;
    shimDocument.getElementById = () => root;
    await import(pathToFileURL(join(projectRoot, outDir, chunks.index.javascript)));
    const ui = win.__ui;
    assert.ok(ui, 'the built app registered window.__ui');
    const input = findByClass(root, 'new-todo')[0];
    input.value = 'built and shipped';
    fireEvent(input, 'input');
    fireEvent(input, 'keydown', { key: 'Enter' });
    await ui.settle();
    assert.deepEqual(findByTag(root, 'label').map((label) => label.textContent).filter((text) => text === 'built and shipped'), ['built and shipped']);
    assert.equal(ui.state().todos.items[0].title, 'built and shipped');
    assert.equal(ui.errors.length, 0);
  } finally {
    rmSync(join(projectRoot, outDir), { recursive: true, force: true });
  }
});
