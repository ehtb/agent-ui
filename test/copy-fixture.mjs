// A fixture of test/fixtures copied into a temporary project that links to this repository's package, so a test can build, serve or edit
// it without touching the fixture or depending on anything outside test/. (Not in test/support: that folder is published.)
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

const repository = resolve(import.meta.dirname, '..');

// Copies `directory` into a new temporary project (without installed packages and build output) and links the package into it.
export const copyProject = (directory, name) => {
  const root = mkdtempSync(join(tmpdir(), `agent-ui-${name}-`));
  // Only the top level of the project is skipped: a folder of that name deeper down (public/dist/) is part of the project.
  cpSync(directory, root, { recursive: true, filter: (path) => !/^(node_modules|dist|\.agent-ui|\.output[^/]*)$/.test(relative(directory, path)) });
  mkdirSync(join(root, 'node_modules/@ehtb'), { recursive: true });
  symlinkSync(repository, join(root, 'node_modules/@ehtb/agent-ui'));
  const write = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  const read = (path) => readFileSync(join(root, path), 'utf8');
  return { root, write, read, cleanup: () => rmSync(root, { recursive: true, force: true }) };
};

export const copyFixture = (name) => copyProject(join(repository, 'test/fixtures', name), name);
