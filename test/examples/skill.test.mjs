// The migration skill is checked against the repository like the docs are: it is shipped, its front matter is valid, and
// every file, command and import specifier it mentions exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const skillDirectory = join(root, 'skills/migrate-to-agent-ui');
const skillFiles = ['SKILL.md', ...readdirSync(join(skillDirectory, 'references')).map((name) => `references/${name}`)];
const text = (file) => readFileSync(join(skillDirectory, file), 'utf8');

test('the skills folder is part of the published package', () => {
  assert.ok(manifest.files.includes('skills'));
});

test('SKILL.md has front matter whose name is its folder and whose description says when to use it', () => {
  const [, front] = text('SKILL.md').match(/^---\n([\s\S]*?)\n---\n/) ?? [];
  assert.ok(front, 'SKILL.md must start with a front matter block');
  assert.equal(front.match(/^name: (.+)$/m)?.[1], 'migrate-to-agent-ui');
  const description = front.match(/^description: (.+)$/m)?.[1] ?? '';
  assert.ok(description.length > 80 && description.length <= 1024, `description is ${description.length} characters`);
  assert.match(description, /Use when/);
});

test('every reference SKILL.md names exists, and every file of references/ is named', () => {
  const skill = text('SKILL.md');
  for (const file of skillFiles.slice(1)) assert.ok(skill.includes(`\`${file}\``), `${file} is not mentioned in SKILL.md`);
  for (const [, file] of skill.matchAll(/`(references\/[\w.-]+)`/g)) assert.ok(existsSync(join(skillDirectory, file)), file);
});

test('repository paths, agent-ui commands, npm scripts and import specifiers in the skill exist', () => {
  const commands = ['build', 'dev', 'serve', 'check', 'schema', 'explain', 'init'];
  const exported = Object.keys(manifest.exports);
  for (const file of skillFiles) {
    const content = text(file);
    for (const [, path] of content.matchAll(/(?<![\w/.@-])((?:src|build|docs|testing|bin|test|examples)\/[A-Za-z0-9_./-]*[A-Za-z0-9_]\.(?:js|mjs|ts|md|css|json))(?![\w-])/g)) {
      if (path.startsWith('examples/') && path.split('/').length > 3) continue;
      assert.ok(existsSync(join(root, path)), `${file}: ${path}`);
    }
    for (const [, command] of content.matchAll(/`agent-ui ([a-z]+)[`\s|]/g)) assert.ok(commands.includes(command), `${file}: agent-ui ${command}`);
    for (const [, script] of content.matchAll(/npm run ([a-z:-]+)/g)) assert.ok(script in manifest.scripts, `${file}: npm run ${script}`);
    for (const [, specifier] of content.matchAll(/from '(@ehtb\/agent-ui(?:\/[A-Za-z0-9._/-]+)?)'/g)) {
      const subpath = specifier === manifest.name ? '.' : `.${specifier.slice(manifest.name.length)}`;
      assert.ok(exported.some((key) => (key.includes('*') ? subpath.startsWith(key.slice(0, key.indexOf('*'))) : key === subpath)), `${file}: ${specifier}`);
    }
  }
});

test('the recipes and topics the skill names exist in the cookbook', async () => {
  const { recipes } = await import('../../cookbook/recipes.mjs');
  const names = new Set((Array.isArray(recipes) ? recipes : Object.values(recipes)).map((recipe) => recipe.name));
  for (const file of skillFiles) {
    for (const [, name] of text(file).matchAll(/[Rr]ecipe `([a-z-]+)`/g)) assert.ok(names.has(name), `${file}: recipe ${name}`);
  }
});
