// `agent-ui build --static` on test/fixtures/shell-site: a shell, a page that waits for its data (`ready`) and a page that does not.
// Every named page is written as a file holding what the server sends; a page with parameters refuses the whole build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { copyFixture } from './copy-fixture.mjs';

const tool = join(import.meta.dirname, '../bin/agent-ui.mjs');
const run = (root, ...args) => spawnSync(process.execPath, [tool, ...args], { cwd: root, encoding: 'utf8' });

test('--static writes each page with its shell, and the page that is ready only after its data holds that data', () => {
  const project = copyFixture('shell-site');
  try {
    const built = run(project.root, 'build', '--static');
    assert.equal(built.status, 0, built.stderr + built.stdout);
    assert.match(built.stdout, /static pages: .*\/about/);
    const list = readFileSync(join(project.root, 'dist/index.html'), 'utf8');
    const about = readFileSync(join(project.root, 'dist/about/index.html'), 'utf8');
    for (const html of [list, about]) {
      assert.match(html, /<!--ssr:start-->/);
      assert.match(html, /id="frame-header"/, 'the shell is around the page');
    }
    assert.match(list, />Boots<\/li>/, 'the items came from public/items.json before the page was written');
    assert.match(list, />Tent &amp; fly<\/li>/);
    assert.match(about, /About us/);
  } finally {
    project.cleanup();
  }
});

test('--static refuses a project with a page that has parameters, before it writes anything', () => {
  const project = copyFixture('shell-site');
  try {
    project.write('pages/item/[id]/page.js', "export const page = { head: { title: 'Item' } };\n");
    project.write('pages/item/[id]/view.js', "import { p } from '@ehtb/agent-ui/spec';\nexport const view = p({ id: 'item' }, 'item');\n");
    const refused = run(project.root, 'build', '--static');
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /page "\/item\/:id".*has parameters, so a static site has no single file for it/);
    assert.equal(existsSync(join(project.root, 'dist')), false, 'nothing was built');
  } finally {
    project.cleanup();
  }
});
