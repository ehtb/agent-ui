// The build configuration and the command line are checked before anything runs: a misspelt option is an error with the fix
// in it, not a setting that is silently ignored.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { checkConfig } from '../build/config-check.mjs';
import { loadConfig } from '../build/config.mjs';
import { frameworkBuildOptions } from '../build/presets.mjs';
import { UsageError, parseArguments } from '../cli/arguments.mjs';
import { closest, didYouMean } from '../src/messages.js';

const repository = resolve(import.meta.dirname, '..');
const valid = { outDir: 'dist' };
const only = (config) => checkConfig(config);

test('a good configuration has no problems, including everything the framework preset adds', () => {
  assert.deepEqual(only(valid), []);
  assert.deepEqual(only({ ...frameworkBuildOptions({ dev: true, projectRoot: repository }), ...valid }), []);
  assert.deepEqual(only({ ...frameworkBuildOptions({ dev: false, projectRoot: repository }), publicDir: ['public', 'more'], api: 'api.js', fetchFunction: async () => ({}) }), []);
});

test('an unknown option names itself, suggests the near miss and lists the allowed ones', () => {
  const [problem] = only({ ...valid, outDirr: 'dist' });
  assert.match(problem, /^build config key "outDirr": unknown option\. Did you mean "outDir"\? Allowed options: outDir,/);
  assert.match(only({ ...valid, publicdir: 'public' })[0], /Did you mean "publicDir"\?/);
  assert.equal(only({ ...valid, zzzzzzzzzz: 1 })[0].includes('Did you mean'), false);
  assert.match(only({ ...valid, scripts: [] })[0], /key "scripts": unknown option/); // document scripts are not a framework feature
});

test('an option the config does not have is unknown, whatever it was called before: there is no list of past options', () => {
  for (const key of ['entries', 'historyPages', 'prerender', 'assetBase', 'pageBody', 'routeFolders']) {
    assert.match(only({ ...valid, [key]: true }).join('\n'), new RegExp(`key "${key}": unknown option\\. .*Allowed options: outDir, `), key);
  }
});

test('types are checked and each message says what to write', () => {
  const cases = [
    [{ outDir: 5 }, /"outDir": must be a non-empty string/],
    [{ minify: 'yes' }, /"minify": must be true or false/],
    [{ hash: 1 }, /"hash": must be true or false/],
    [{ transform: 'x' }, /"transform": must be a function/],
    [{ fetchFunction: '/data' }, /"fetchFunction": must be a function\. Write fetchFunction: \(…\) => …/],
    [{ publicDir: 7 }, /"publicDir": must be a directory name or a list of them/],
    [{ manualChunks: { vendor: 'a.js' } }, /"manualChunks": must map a chunk name to a list of module paths/],
    [{ replaceModules: { a: 1 } }, /"replaceModules": must map a module path/],
    [{ minSharedChunkBytes: -1 }, /"minSharedChunkBytes": must be a whole number of bytes, 0 or more\. Write minSharedChunkBytes: 4096/],
    [{ minSharedChunkBytes: '4096' }, /"minSharedChunkBytes": must be a whole number of bytes/],
  ];
  for (const [change, pattern] of cases) assert.match(only({ ...valid, ...change }).join('\n'), pattern, JSON.stringify(change));
});

test('a config that is not an object says what to export', () => {
  assert.match(only(null)[0], /the file must export an object, or a function that returns one \(got null\)/);
  assert.match(only('x')[0], /\(got string\)/);
});

test('loadConfig throws one error listing every problem, and fills in the default output directory', async () => {
  const project = mkdtempSync(join(tmpdir(), 'agent-ui-config-'));
  try {
    mkdirSync(join(project, 'pages/about'), { recursive: true });
    writeFileSync(join(project, 'pages/page.js'), 'export const page = {};');
    writeFileSync(join(project, 'pages/view.js'), 'export const view = { tag: "p" };');
    writeFileSync(join(project, 'pages/about/page.js'), 'export const page = {};');
    writeFileSync(join(project, 'pages/about/view.js'), 'export const view = { tag: "p" };');
    writeFileSync(join(project, 'good.config.mjs'), 'export default ({ dev }) => ({ minify: !dev });');
    writeFileSync(join(project, 'bad.config.mjs'), "export default { outDirr: 'x', minfy: true };");
    const good = await loadConfig({ root: project, file: 'good.config.mjs', mode: { dev: true } });
    assert.equal(good.outDir, 'dist');
    assert.equal(good.minify, false);
    // The pages come from the folders, with the generated modules written next to the project.
    assert.deepEqual(good.pages.map(({ name, path }) => [name, path]), [['about', '/about'], ['index', '/']]);
    assert.deepEqual(good.entries.map(({ name, path }) => [name, path]), [['about', '.agent-ui/about/main.js'], ['index', '.agent-ui/index/main.js']]);
    assert.ok(existsSync(join(project, '.agent-ui/about/main.js')) && existsSync(join(project, '.agent-ui/.gitignore')));
    await assert.rejects(() => loadConfig({ root: project, file: 'bad.config.mjs' }), (error) => /^bad\.config\.mjs has 2 problems:\n {2}build config key "outDirr".*\n {2}build config key "minfy".*Did you mean "minify"\?/s.test(error.message));
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test('frameworkBuildOptions refuses a validator value that is neither include nor omit', () => {
  assert.throws(() => frameworkBuildOptions({ validator: 'yes', projectRoot: repository }), /validator must be "include" or "omit", got "yes"/);
  assert.doesNotThrow(() => frameworkBuildOptions({ validator: 'omit', projectRoot: repository }));
});

// ---- command line --------------------------------------------------------------------------------------------------------

const build = { dev: 'flag', validator: ['include', 'omit'], out: 'text', port: 'number' };
const usage = (argv, accepted = build, settings = { command: 'agent-ui build' }) => {
  try {
    parseArguments(argv, accepted, settings);
  } catch (error) {
    assert.ok(error instanceof UsageError);
    return error.message;
  }
  return null;
};

test('command line options: values, flags, numbers and choices are parsed and checked', () => {
  assert.deepEqual(parseArguments(['--dev', '--out=build', '--port=8080', '--validator=omit'], build), { _: [], dev: true, out: 'build', port: 8080, validator: 'omit' });
  assert.deepEqual(parseArguments(['dir', '--port=1'], { port: 'number' }, { positional: true }), { _: ['dir'], port: 1 });
  assert.deepEqual(parseArguments(['--out=a=b'], build), { _: [], out: 'a=b' }); // only the first "=" separates
});

test('command line mistakes name the command, the option and the fix', () => {
  assert.match(usage(['--dve']), /^agent-ui build: unknown option --dve\. Did you mean --dev\? Options: --dev --validator=<value>/);
  assert.match(usage(['--validator=nope']), /--validator must be one of include, omit, got "nope"/);
  assert.match(usage(['--validator=incldue']), /Did you mean "include"\?/);
  assert.match(usage(['--validator']), /--validator needs a value\. Write --validator=<value>/);
  assert.match(usage(['--out=']), /--out needs a value/);
  assert.match(usage(['--dev=yes']), /--dev takes no value\. Write --dev/);
  assert.match(usage(['--port=abc']), /--port must be a whole number, got "abc"\. Write for example --port=8080/);
  assert.match(usage(['--port=-1']), /--port must be a whole number/);
  assert.match(usage(['stray']), /unexpected argument "stray"/);
  assert.match(usage(['--x'], {}), /unknown option --x\. Options: none/);
});

test('the command line tools stop with exit code 2 and one line on a usage mistake', () => {
  const project = mkdtempSync(join(tmpdir(), 'agent-ui-cli-'));
  const run = (...argv) => spawnSync(process.execPath, [join(repository, 'bin/agent-ui.mjs'), ...argv], { cwd: project, encoding: 'utf8' });
  try {
    const misspelt = run('build', '--validater=omit');
    assert.equal(misspelt.status, 2);
    assert.match(misspelt.stderr, /agent-ui build: unknown option --validater\. Did you mean --validator\?/);
    assert.equal(run('build', '--validator=nope').status, 2);
    assert.equal(run('serve', '--prot=80').status, 2);
    assert.equal(run('serve', '--port=x').status, 2);
    assert.equal(run('ssr').status, 1, 'there is one command that serves: ssr is unknown');
    assert.equal(run('check', 'extra').status, 2);
    assert.equal(run('dev', '--fallbak=x').status, 2);
    assert.equal(run('schema', '--out=x').status, 2);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

// ---- the shared wording ------------------------------------------------------------------------------------------------------

test('suggestions: transposed, missing and extra letters are near misses; unrelated words and empty lists are not', () => {
  assert.equal(didYouMean('itme', ['home', 'item']), 'Did you mean "item"? ');
  assert.equal(didYouMean('chilren', ['tag', 'children']), 'Did you mean "children"? ');
  assert.equal(didYouMean('outDirr', ['outDir']), 'Did you mean "outDir"? ');
  assert.equal(didYouMean('zzzzzzzz', ['tag', 'id']), '');
  assert.equal(didYouMean('x', []), '');
  assert.equal(closest('x', []), null);
});
