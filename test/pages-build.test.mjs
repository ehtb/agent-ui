// What `agent-ui build` says about the page/view split, in a throwaway project: a page without a view.js, a page that cannot be
// loaded, a spec that is not valid, a misspelt export of view.js, and a second build in one process after an edit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { discoverPages } from '../build/pages.mjs';
import { loadConfig } from '../build/config.mjs';

const repository = resolve(import.meta.dirname, '..');

// A project with one page at "/". `@ehtb/agent-ui/pages` resolves through a link to this repository, as in an installed copy.
const withProject = async (files, run) => {
  const project = mkdtempSync(join(tmpdir(), 'agent-ui-split-'));
  try {
    mkdirSync(join(project, 'pages'), { recursive: true });
    mkdirSync(join(project, 'node_modules'), { recursive: true });
    mkdirSync(join(project, 'node_modules/@ehtb'), { recursive: true });
    symlinkSync(repository, join(project, 'node_modules/@ehtb/agent-ui'), 'dir');
    writeFileSync(join(project, 'build.config.mjs'), 'export default () => ({});');
    for (const [name, text] of Object.entries(files)) writeFileSync(join(project, 'pages', name), text);
    return await run(project);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
};

const page = "export const page = { head: { title: 'Home' } };";
const view = "export const view = { tag: 'p', id: 'home', children: 'home' };";
const build = (project) => loadConfig({ root: project, mode: { dev: false } });

test('a page folder without a view.js is refused with the file to create', async () => {
  await withProject({ 'page.js': page }, (project) => {
    assert.throws(() => discoverPages(project), /pages\/page\.js: there is no view\.js next to it\. Create pages\/view\.js and export the page's content: `export const view = section\(\{ \.\.\. \}\)`/);
  });
});

test('a production build names the page that cannot be loaded', async () => {
  await withProject({ 'page.js': page, 'view.js': "throw new Error('boom');" }, async (project) => {
    await assert.rejects(build(project), /pages\/page\.js: the page could not be loaded to build its spec: boom\. Fix the error in page\.js or view\.js/);
  });
});

test('a production build refuses a finished spec that is not valid, with the validator\'s problems', async () => {
  await withProject({ 'page.js': page, 'view.js': "export const view = { tag: 'blink', children: 'x' };" }, async (project) => {
    await assert.rejects(build(project), /pages\/page\.js: the finished spec is not valid:\n {2}\$: bad tag blink.*Fix view\.js, its layout or its pending view/s);
  });
});

test('a misspelt export of view.js is refused with the nearest valid name', async () => {
  await withProject({ 'page.js': page, 'view.js': `${view}\nexport const layuot = (content) => content;` }, async (project) => {
    await assert.rejects(build(project), /pages\/view\.js: unknown export "layuot"\. Did you mean "layout"\? Export only view, layout, pending, shell from view\.js/);
  });
});

test('a second build in the same process evaluates an edited view.js again', async () => {
  await withProject({ 'page.js': page, 'view.js': view }, async (project) => {
    await build(project);
    assert.match(readFileSync(join(project, '.agent-ui/index/spec.js'), 'utf8'), /"children":"home"/);
    writeFileSync(join(project, 'pages/view.js'), "export const view = { tag: 'p', id: 'home', children: 'edited' };");
    await build(project);
    assert.match(readFileSync(join(project, '.agent-ui/index/spec.js'), 'utf8'), /"children":"edited"/);
  });
});
