// `agent-ui init` writes the rules for agents into the project's AGENTS.md, and `agent-ui check` notes when they are missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { initProject } from '../cli/init.mjs';
import { packageName } from '../build/package-name.mjs';
import { mentionsAgentUi, projectBlock, PROJECT_END, PROJECT_START } from '../cli/agent-instructions.mjs';

const repository = resolve(import.meta.dirname, '..');
const withProject = (run) => {
  const project = mkdtempSync(join(tmpdir(), 'agent-ui-init-'));
  try {
    return run(project);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
};
const read = (project, name) => readFileSync(join(project, name), 'utf8');

test('the block names the package, the explain and check commands, and the rule about list keys', () => {
  const block = projectBlock();
  assert.ok(block.startsWith(PROJECT_START) && block.endsWith(PROJECT_END));
  assert.ok(block.includes(`node_modules/${packageName}/docs/AGENT-RULES.md`));
  assert.ok(block.includes(`node_modules/${packageName}/docs/GUIDE.md`));
  assert.ok(!block.includes(`node_modules/${packageName}/AGENTS.md`), 'the root AGENTS.md is for work on the framework, not for an app');
  assert.ok(!block.includes('{package}'));
  for (const text of ['agent-ui explain', 'agent-ui check', 'assertNoErrors(ui)', 'unique across the whole list']) assert.ok(block.includes(text), text);
});

test('init creates AGENTS.md when the project has none', () => {
  withProject((project) => {
    assert.deepEqual(initProject({ root: project }), { file: 'AGENTS.md', action: 'created' });
    assert.equal(read(project, 'AGENTS.md'), `${projectBlock()}\n`);
    assert.equal(existsSync(join(project, 'CLAUDE.md')), false);
  });
});

test('init adds the block to an AGENTS.md that exists and keeps the rest', () => {
  withProject((project) => {
    writeFileSync(join(project, 'AGENTS.md'), '# My project\n\nUse tabs.\n');
    assert.deepEqual(initProject({ root: project }), { file: 'AGENTS.md', action: 'updated' });
    assert.equal(read(project, 'AGENTS.md'), `# My project\n\nUse tabs.\n\n${projectBlock()}\n`);
  });
});

test('running init again replaces only its own block, so text around it stays and nothing is added twice', () => {
  withProject((project) => {
    writeFileSync(join(project, 'AGENTS.md'), `Before\n\n${PROJECT_START}\nold rules\n${PROJECT_END}\n\nAfter\n`);
    initProject({ root: project });
    const once = read(project, 'AGENTS.md');
    assert.equal(once, `Before\n\n${projectBlock()}\n\nAfter\n`);
    initProject({ root: project });
    assert.equal(read(project, 'AGENTS.md'), once);
  });
});

test('init refuses to run in the framework itself, whose docs/AGENT-RULES.md is the source of the block', () => {
  assert.throws(() => initProject({ root: repository }), /^Error: agent-ui init: this directory is the framework itself/);
});

test('the init command takes no options, and a mistake is a usage line', () => {
  const run = (...args) => spawnSync(process.execPath, [join(repository, 'bin/agent-ui.mjs'), 'init', ...args], { cwd: tmpdir(), encoding: 'utf8' });
  const result = run('--force');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /^agent-ui init: unknown option --force\. Options: none/);
});

test('check notes a project whose AGENTS.md is missing or does not mention agent-ui, and stops when it does', () => {
  withProject((project) => {
    // The smallest project `check` accepts: a build configuration and one page.
    mkdirSync(join(project, 'pages'));
    writeFileSync(join(project, 'build.config.mjs'), `import { frameworkBuildOptions } from '${repository}/build/presets.mjs';\nexport default ({ dev = false, validator } = {}) => ({ ...frameworkBuildOptions({ dev, validator, projectRoot: '${project}' }) });\n`);
    writeFileSync(join(project, 'pages/page.js'), "export const page = { head: { title: 'Home' } };\n");
    writeFileSync(join(project, 'pages/view.js'), `import { main } from '${repository}/src/spec.js';\nexport const view = main({ id: 'home' }, 'hi');\n`);
    const check = () => spawnSync(process.execPath, [join(repository, 'bin/agent-ui.mjs'), 'check'], { cwd: project, encoding: 'utf8' });
    assert.equal(mentionsAgentUi(project), false);
    assert.match(check().stdout, /note: AGENTS\.md of this project does not exist or does not mention agent-ui, so an agent working here is not told its rules\. Run `agent-ui init`/);
    writeFileSync(join(project, 'AGENTS.md'), 'Rules for agent-ui are in node_modules.\n');
    assert.equal(mentionsAgentUi(project), true);
    assert.doesNotMatch(check().stdout, /note: AGENTS\.md of this project/);
  });
});

test('init refuses a file with only one of its two markers instead of adding a second block', () => {
  withProject((project) => {
    for (const marker of [PROJECT_START, PROJECT_END]) {
      writeFileSync(join(project, 'AGENTS.md'), `Notes\n${marker}\nold rules\n`);
      assert.throws(() => initProject({ root: project }), /^Error: AGENTS\.md has <!-- agent-ui:(start|end) --> without <!-- agent-ui:(end|start) -->\. Delete the stray marker/);
      assert.equal(read(project, 'AGENTS.md'), `Notes\n${marker}\nold rules\n`, 'the file is left as it was');
    }
  });
});
