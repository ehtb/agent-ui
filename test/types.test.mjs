// Type declarations: compiled with tsc when it is installed (skipped otherwise; the repo has no dependencies).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('./types/tsconfig.json', import.meta.url));
const probe = spawnSync('tsc', ['--version'], { encoding: 'utf8' });
const major = Number(probe.stdout?.match(/Version (\d+)/)?.[1] ?? 0);
const skipReason = probe.status !== 0 ? 'tsc not installed' : major < 5 ? `tsc (${probe.stdout.trim()}) is older than TypeScript 5` : false;

test('declarations accept real usage and reject mistakes (tsc --noEmit over test/types/check.js)', { skip: skipReason }, () => {
  const result = spawnSync('tsc', ['-p', project], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

// What a project sees: the package installed in node_modules, imported by its public names, resolved through "exports".
test('every public import of the installed package has types (tsc over a throwaway consumer project)', { skip: skipReason }, () => {
  const project = mkdtempSync(join(tmpdir(), 'agent-ui-consumer-'));
  try {
    mkdirSync(join(project, 'node_modules'), { recursive: true });
    mkdirSync(join(project, 'node_modules/@ehtb'), { recursive: true });
    symlinkSync(fileURLToPath(new URL('..', import.meta.url)), join(project, 'node_modules/@ehtb/agent-ui'));
    writeFileSync(join(project, 'package.json'), '{"type":"module"}');
    writeFileSync(join(project, 'tsconfig.json'), JSON.stringify({ compilerOptions: { module: 'nodenext', moduleResolution: 'nodenext', strict: true, noEmit: true, skipLibCheck: true, allowJs: false, types: [] }, include: ['consumer.ts'] }));
    writeFileSync(join(project, 'consumer.ts'), `
import { app, validate, grammar } from '@ehtb/agent-ui';
import { validate as validateAgain } from '@ehtb/agent-ui/validate';
import { compileUrlPattern } from '@ehtb/agent-ui/url-pattern';
import { resources } from '@ehtb/agent-ui/resources';
import { windowEvents } from '@ehtb/agent-ui/window-events';
import { patchSpec, listIds } from '@ehtb/agent-ui/spec-tools';
import { expandComponents } from '@ehtb/agent-ui/components';
import { memoizeItem } from '@ehtb/agent-ui/memoize';
import { mountElement } from '@ehtb/agent-ui/mount-element';
import { definePage, type Page } from '@ehtb/agent-ui/pages';
import { fail, didYouMean } from '@ehtb/agent-ui/messages';
import { checkResponseHeaders, mergeResponseHeaders } from '@ehtb/agent-ui/http-headers';
import { renderPage } from '@ehtb/agent-ui/server';
import { browserEnvironment } from '@ehtb/agent-ui/hydrate';
import { createSpecSchema } from '@ehtb/agent-ui/spec-schema';
import { frameworkBuildOptions } from '@ehtb/agent-ui/build/presets.mjs';
import { build, prerender, discoverPages } from '@ehtb/agent-ui/build';
import { mountDevtools } from '@ehtb/agent-ui/devtools';
import { loadConfig, type BuildConfig } from '@ehtb/agent-ui/build/config.mjs';
import { createSsrHandler } from '@ehtb/agent-ui/server/ssr-handler.mjs';
import { createStaticHandler } from '@ehtb/agent-ui/cli/static-handler.mjs';
import { mountSpec, flushAsync } from '@ehtb/agent-ui/testing/helpers.mjs';
import { createRoot, fireEvent } from '@ehtb/agent-ui/testing/dom-shim.mjs';
import { matchesSchema } from '@ehtb/agent-ui/testing/json-schema.mjs';

const config: BuildConfig = { ...frameworkBuildOptions({ dev: false }), outDir: 'dist' };
const page: Page = { head: { title: 'Home' } };
definePage(page, { path: '/', view: { tag: 'p', children: 'x' } }).create({ dev: true, root: null, win: null, fetchFunction: null });
compileUrlPattern('/item/:id').match('/item/3');
loadConfig({ root: '.' }).then((loaded) => createSsrHandler({ config: loaded }));
loadConfig({ root: '.' }).then((loaded) => createSsrHandler({
  config: loaded,
  initialStateFor: (request) => ({ session: { user: request.cookies.session ?? null } }),
  transformResponse: (request, response) => ({ headers: { 'content-security-policy': 'nonce-' + request.method }, body: response.body }),
}));
checkResponseHeaders({ 'cache-control': 'no-store', 'set-cookie': ['a=1'] }, 'site');
mergeResponseHeaders({ 'set-cookie': 'a=1' }, { 'set-cookie': ['b=2'] });
createStaticHandler('dist', { assetsDir: 'assets' });
const cached = memoizeItem((item: { id: number }) => item.id);
void mountElement;
const { ui } = mountSpec({ spec: 'x', namespaces: { a: { state: { x: 1 } } } });
cached({ id: 1 });
flushAsync(ui);
fireEvent(createRoot(), 'click');
export { build, prerender, discoverPages, mountDevtools, app, validate, grammar, validateAgain, resources, windowEvents, patchSpec, listIds, expandComponents, definePage, fail, didYouMean, checkResponseHeaders, mergeResponseHeaders, renderPage, browserEnvironment, createSpecSchema, matchesSchema, config };
// @ts-expect-error a build option that does not exist
const bad: BuildConfig = { outDirr: 'dist' };
export { bad };
`);
    const result = spawnSync('tsc', ['-p', join(project, 'tsconfig.json')], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});
