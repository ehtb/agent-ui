// Each top-level folder has one responsibility, and the folders depend on each other in one direction only:
//
//   src      the runtime and the pure libraries around it (browser and server): imports only src, no Node built-ins
//   server   turning a page into an HTML document and serving it (render, document, handlers): src, server
//   build    turning source into a site (bundler, presets, static generation): src, server, build
//   cli      the `agent-ui` commands that wire the others together: everything
//
// A file that imports against this direction is in the wrong folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const allowed = { src: ['src'], server: ['src', 'server'], build: ['src', 'server', 'build'], cli: ['src', 'server', 'build', 'cli'] };

const filesOf = (directory) =>
  readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesOf(path) : /\.(js|mjs)$/.test(entry.name) ? [path] : [];
  });

test('folders import only from folders they are allowed to depend on', () => {
  const violations = [];
  for (const [folder, permitted] of Object.entries(allowed)) {
    for (const file of filesOf(folder)) {
      const text = readFileSync(join(root, file), 'utf8');
      for (const match of text.matchAll(/(?:from|import\()\s*'(\.[^']*)'/g)) {
        const target = relative(root, resolve(dirname(join(root, file)), match[1])).split(/[\\/]/)[0];
        if (!permitted.includes(target)) violations.push(`${file} imports ${match[1]} (${target}/ is not allowed from ${folder}/)`);
      }
    }
  }
  assert.deepEqual(violations, []);
});

test('the runtime in src/ never imports Node built-ins or packages: it must run in a browser', () => {
  const violations = [];
  for (const file of filesOf('src')) {
    for (const match of readFileSync(join(root, file), 'utf8').matchAll(/(?:from|import\()\s*'([^.'][^']*)'/g)) violations.push(`${file} imports ${match[1]}`);
  }
  assert.deepEqual(violations, []);
});

test('every folder is described: one line per folder in AGENTS.md', () => {
  const guide = readFileSync(join(root, 'AGENTS.md'), 'utf8');
  for (const folder of Object.keys(allowed)) assert.match(guide, new RegExp(`\`${folder}/\``), `AGENTS.md does not describe ${folder}/`);
});

test('the ids the renderer, the document builder and the browser agree on are defined once, in src/hydrate.js', () => {
  const definitions = [];
  for (const folder of ['src', 'server', 'build', 'cli']) {
    for (const file of filesOf(folder)) {
      if (file === join('src', 'hydrate.js')) continue;
      const code = readFileSync(join(root, file), 'utf8').split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
      if (/agent-ui-state/.test(code) || /id="?app"?[ >]/.test(code) || /getElementById\('app'\)/.test(code)) definitions.push(file);
    }
  }
  assert.deepEqual(definitions, []);
});
