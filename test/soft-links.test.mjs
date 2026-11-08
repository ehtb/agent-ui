// `soft: true` on a link, and what checks it: the grammar (validator and builders), the attribute the browser gets, `agent-ui check`
// (a soft link must lead to a page of the same shell, and a route.go target must exist), and the files a production build writes for a shell.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { findByTag } from './support/dom-shim.mjs';
import { mountSpec } from './support/helpers.mjs';

const { validate } = await import('../src/validate.js');
const { a, button, div, act, pageSlot } = await import('../src/spec.js');
const { loadConfig } = await import('../build/config.mjs');
const { checkProject } = await import('../cli/check.mjs');

const expectError = (action, pattern) => assert.throws(action, (error) => pattern.test(error.message), String(pattern));

// ---------------------------------------------------------------------------------------------------- the grammar

test('a soft link is a link with an href: the attribute reaches the DOM, and a bound or false value, another tag and a missing href are refused', () => {
  assert.deepEqual(a({ href: '/about', soft: true }, 'About'), { tag: 'a', props: { href: '/about', soft: true }, children: 'About' });
  const { root } = mountSpec({ spec: div(null, a({ href: '/about', soft: true }, 'About'), a({ href: '/plain' }, 'Plain')) });
  const [soft, plain] = findByTag(root, 'a');
  assert.equal(soft.getAttribute('data-soft'), '');
  assert.equal(plain.getAttribute('data-soft'), null);

  expectError(() => a({ href: '/x', soft: false }, 'x'), /a\(\.\.\.\): soft is false\. Write soft: true on a link, or leave it out/);
  expectError(() => button({ soft: true }, 'x'), /button\(\.\.\.\): soft belongs on a link, and this is a button\. Write a\(\{ href: '\/page', soft: true \}, 'text'\); for a button, use on: \{ click: act\('route\.go', \{ href: '\/page' \}\) \}/);
  expectError(() => a({ soft: true }, 'x'), /a\(\.\.\.\): a soft link has no href\. Write a\(\{ href: '\/page', soft: true \}, 'text'\)/);

  const problems = (spec) => validate(spec, { namespaces: { flag: { state: { on: true } } } });
  assert.deepEqual(problems({ tag: 'a', props: { href: '/x', soft: true }, children: 'x' }), []);
  assert.match(problems({ tag: 'a', props: { href: '/x', soft: false }, children: 'x' })[0], /\$\.props\.soft: soft is false\. Write soft: true on a link, or leave it out/);
  assert.match(problems({ tag: 'a', props: { href: '/x', soft: { state: 'flag.on' } }, children: 'x' })[0], /soft is \{"state":"flag\.on"\}.*whether a link is soft is fixed when the page is written/);
  assert.match(problems({ tag: 'button', props: { soft: true }, children: 'x' })[0], /\$: soft belongs on a link with an href, and this is a button\. Write a\(\{ href: '\/page', soft: true \}, 'text'\); for a button, use act\('route\.go'/);
  assert.match(problems({ tag: 'a', props: { soft: true }, children: 'x' })[0], /this is an a without href/);
});

test('pageSlot is one element with the explicit id "page-slot" and the HTML id "app"', () => {
  assert.deepEqual(pageSlot(), { tag: 'div', id: 'page-slot', props: { id: 'app' } });
});

// ---------------------------------------------------------------------------------------------------- check

const pagesModule = new URL('../src/pages.js', import.meta.url).href;
const shellModule = new URL('../src/shell.js', import.meta.url).href;
const specModule = new URL('../src/spec.js', import.meta.url).href;
const writeShellPage = (root, file, { path, links, shell = true, shellLinks = [] }) =>
  writeFileSync(
    join(root, file),
    [
      `import { definePage } from '${pagesModule}';`,
      `import { defineShell } from '${shellModule}';`,
      `import { pageSlot } from '${specModule}';`,
      `const shell = defineShell({ name: 'main' });`,
      `const shellContent = { name: 'main', view: { tag: 'main', id: 'frame', children: [${shellLinks.map((link) => JSON.stringify(link)).join(',')}${shellLinks.length ? ',' : ''} pageSlot()] } };`,
      `const definition = definePage({ head: { title: 'T' }${shell ? ', shell' : ''} }, { path: ${JSON.stringify(path)}, view: { tag: 'nav', id: 'nav', children: ${JSON.stringify(links)} }${shell ? ', shell: shellContent' : ''} });`,
      'export const { create, createShell, describePage, namespaces, shellContent: content, shellName, spec } = definition;',
      'export { content as shellContent };',
      '',
    ].join('\n'),
  );
const record = (name, app, path) => ({ name, path, app, file: `pages/${name}/page.js` });
const link = (href, extra = {}) => ({ tag: 'a', props: { href, ...extra }, children: 'link' });
const goTo = (href) => ({ tag: 'button', on: { click: ['route.go', { href }] }, children: 'go' });

test('check: a soft link must lead to a page of the same shell; a normal link may lead anywhere', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-ui-soft-'));
  try {
    writeShellPage(root, 'home.mjs', { path: '/', links: [link('/about', { soft: true }), link('/plain', { soft: true }), link('/plain'), link('/about'), link('/nowhere', { soft: true })] });
    writeShellPage(root, 'about.mjs', { path: '/about', links: [link('/', { soft: true })] });
    writeShellPage(root, 'plain.mjs', { path: '/plain', links: [link('/', { soft: true })], shell: false });
    const pages = [record('index', 'home.mjs', '/'), record('about', 'about.mjs', '/about'), record('plain', 'plain.mjs', '/plain')];
    const { problems } = await checkProject({ root, config: { outDir: 'dist', pages } });
    assert.equal(problems.length, 3, JSON.stringify(problems));
    assert.match(problems[0], /pages\/index\/page\.js: the soft link "\/plain" leads to \/plain, which has no shell, and this page has the shell "main"\. A soft link replaces the page inside the shell that stays: give both pages the same shell, or remove `soft` so the link is a normal page load/);
    assert.match(problems[1], /pages\/index\/page\.js: the link "\/nowhere" is no page/);
    assert.match(problems[2], /pages\/plain\/page\.js: the soft link "\/" is on a page without a shell, so nothing handles `soft` and it is a normal link\. Give the page a shell \(`shell` in page\.js and view\.js\), or remove `soft`/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('check: a soft link between two pages that have no shell is reported too, because nothing handles it', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-ui-soft-'));
  try {
    writeShellPage(root, 'home.mjs', { path: '/', links: [link('/about', { soft: true })], shell: false });
    writeShellPage(root, 'about.mjs', { path: '/about', links: [], shell: false });
    const { problems } = await checkProject({ root, config: { outDir: 'dist', pages: [record('index', 'home.mjs', '/'), record('about', 'about.mjs', '/about')] } });
    assert.equal(problems.length, 1, JSON.stringify(problems));
    assert.match(problems[0], /the soft link "\/about" is on a page without a shell/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('check reports what went wrong inside the shell\'s app, named as the shell\'s', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-ui-soft-'));
  try {
    writeFileSync(
      join(root, 'home.mjs'),
      [
        `import { definePage } from '${pagesModule}';`,
        `import { defineShell } from '${shellModule}';`,
        `import { pageSlot } from '${specModule}';`,
        `const shell = defineShell({ name: 'main', namespaces: { frame: { state: { target: 'javascript:alert(1)' } } } });`,
        `const shellContent = { name: 'main', view: { tag: 'main', id: 'frame', children: [{ tag: 'a', id: 'bad', props: { href: { state: 'frame.target' } }, children: 'x' }, pageSlot()] } };`,
        `const definition = definePage({ head: { title: 'T' }, shell }, { path: '/', view: { tag: 'p', id: 'x', children: 'x' }, shell: shellContent });`,
        'export const { create, createShell, describePage, namespaces, shellContent: content, shellName, spec } = definition;',
        'export { content as shellContent };',
        '',
      ].join('\n'),
    );
    const { problems } = await checkProject({ root, config: { outDir: 'dist', pages: [record('index', 'home.mjs', '/')] } });
    assert.deepEqual(problems, ['/ /: shell "main": blocked unsafe URL in href']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('check lists only the first ten pages a broken link might have meant and counts the rest, so a big site stays readable', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-ui-soft-'));
  try {
    const pages = [record('index', 'home.mjs', '/')];
    writeShellPage(root, 'home.mjs', { path: '/', links: [link('/nowhere')], shell: false });
    for (let number = 1; number <= 11; number++) {
      writeShellPage(root, `p${number}.mjs`, { path: `/p${number}`, links: [link('/nowhere')], shell: false });
      pages.push(record(`p${number}`, `p${number}.mjs`, `/p${number}`));
    }
    const { problems } = await checkProject({ root, config: { outDir: 'dist', pages } });
    assert.equal(problems.length, 12, JSON.stringify(problems));
    assert.ok(problems.every((problem) => problem.endsWith(', and 2 more')), problems[0]);
    assert.match(problems[0], /Pages: \/, \/p1, /);
    assert.equal(problems[0].includes('/p10'), false, 'only the first ten pages are listed');
    assert.equal(problems[0].includes('/p11'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('check reads the links of the shell\'s content and the targets of route.go, and a route.go to a place that is no page is reported', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-ui-soft-'));
  try {
    writeShellPage(root, 'home.mjs', { path: '/', links: [goTo('/about'), goTo('/abuot')], shellLinks: [link('/about', { soft: true }), link('/missing', { soft: true })] });
    writeShellPage(root, 'about.mjs', { path: '/about', links: [] });
    const pages = [record('index', 'home.mjs', '/'), record('about', 'about.mjs', '/about')];
    const { problems } = await checkProject({ root, config: { outDir: 'dist', pages } });
    assert.ok(problems.some((problem) => /pages\/index\/page\.js: the link "\/abuot" is no page, no file in publicDir and no API path\. Did you mean "\/about"\?/.test(problem)), JSON.stringify(problems));
    assert.ok(problems.some((problem) => /the link "\/missing" is no page/.test(problem)), 'the shell\'s own links are checked');
    assert.equal(problems.some((problem) => /the link "\/about" is no page/.test(problem)), false, 'a route.go to a page that exists is fine');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------------------------- the build

const repository = resolve(import.meta.dirname, '..');
const withProject = async (files, run) => {
  const project = mkdtempSync(join(tmpdir(), 'agent-ui-shell-'));
  try {
    mkdirSync(join(project, 'pages/about'), { recursive: true });
    mkdirSync(join(project, 'shared'), { recursive: true });
    mkdirSync(join(project, 'node_modules'), { recursive: true });
    mkdirSync(join(project, 'node_modules/@ehtb'), { recursive: true });
    symlinkSync(repository, join(project, 'node_modules/@ehtb/agent-ui'), 'dir');
    writeFileSync(join(project, 'build.config.mjs'), "import { frameworkBuildOptions } from '@ehtb/agent-ui/build/presets.mjs';\nexport default ({ dev = false } = {}) => ({ ...frameworkBuildOptions({ dev, projectRoot: import.meta.dirname }) });\n");
    for (const [name, text] of Object.entries(files)) writeFileSync(join(project, name), text);
    return await run(project);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
};
const shellBehavior = "import { defineShell } from '@ehtb/agent-ui/shell';\nexport const shell = defineShell({ name: 'main' });\n";
const shellView = (title) => `import { main, h1, pageSlot } from '@ehtb/agent-ui/spec';\nexport const shell = { name: 'main', view: main({ id: 'frame' }, h1({ id: 'title' }, ${JSON.stringify(title)}), pageSlot()) };\n`;
const pageWith = (shellImport = '../shared/shell.js') => `import { shell } from '${shellImport}';\nexport const page = { head: { title: 'T' }, shell };\n`;
const viewWith = (shellImport = '../shared/shell-view.js') => `import { p } from '@ehtb/agent-ui/spec';\nimport { shell } from '${shellImport}';\nexport const view = p({ id: 'x' }, 'x');\nexport { shell };\n`;

test('a production build writes the shell\'s content once, and every entry registers its page under the URL of its own file', async () => {
  await withProject(
    { 'shared/shell.js': shellBehavior, 'shared/shell-view.js': shellView('Same'), 'pages/page.js': pageWith(), 'pages/view.js': viewWith(), 'pages/about/page.js': pageWith('../../shared/shell.js'), 'pages/about/view.js': viewWith('../../shared/shell-view.js') },
    async (project) => {
      await loadConfig({ root: project, mode: { dev: false } });
      const shellFile = readFileSync(join(project, '.agent-ui/shells/main.js'), 'utf8');
      assert.match(shellFile, /^\/\/ Generated for the shell "main" \(pages\/.*page\.js\): its finished content, as data\./);
      assert.match(shellFile, /export const shell = \{"name":"main","view":\{"tag":"main"/);
      for (const name of ['index', 'about']) {
        const entry = readFileSync(join(project, `.agent-ui/${name}/main.js`), 'utf8');
        assert.match(entry, /import \{ shell \} from '\.\.\/shells\/main\.js';/);
        assert.match(entry, /startPage\(page, \{ path: '\/(about)?', spec, shell, url: import\.meta\.url, dev: false \}\);/);
        assert.equal(readFileSync(join(project, `.agent-ui/${name}/spec.js`), 'utf8').includes('"Same"'), false, 'the shell is not repeated in the page\'s spec');
      }
    },
  );
});

test('a development entry builds the shell\'s content in the browser from view.js, like the rest of the page', async () => {
  await withProject({ 'shared/shell.js': shellBehavior, 'shared/shell-view.js': shellView('Same'), 'pages/page.js': pageWith(), 'pages/view.js': viewWith() }, async (project) => {
    await loadConfig({ root: project, mode: { dev: true } });
    const entry = readFileSync(join(project, '.agent-ui/index/main.js'), 'utf8');
    assert.match(entry, /startPage\(page, \{ path: '\/', \.\.\.contentOf\(view, 'pages\/view\.js'\), url: import\.meta\.url, dev: true \}\);/);
    assert.equal(readFileSync(join(project, '.agent-ui/index/app.js'), 'utf8').includes('createShell'), true);
  });
});

test('a production build validates the shell\'s content against the shell\'s namespaces, like the page\'s spec', async () => {
  const badView = "import { main, h1, pageSlot, button, act } from '@ehtb/agent-ui/spec';\nexport const shell = { name: 'main', view: main({ id: 'frame' }, h1({ id: 'title' }, 'T'), button({ id: 'go', on: { click: act('frame.nowhere', {}) } }, 'Go'), pageSlot()) };\n";
  await withProject({ 'shared/shell.js': shellBehavior, 'shared/shell-view.js': badView, 'pages/page.js': pageWith(), 'pages/view.js': viewWith() }, async (project) => {
    await assert.rejects(loadConfig({ root: project, mode: { dev: false } }), /pages\/page\.js: the content of the shell "main" is not valid:\n {2}.*frame\.nowhere.*Fix the shell's content \(the view of "main"\)/s);
  });
});

test('two pages that give one shell different content are refused, naming both', async () => {
  await withProject(
    { 'shared/shell.js': shellBehavior, 'shared/shell-view.js': shellView('One'), 'shared/shell-view-two.js': shellView('Two'), 'pages/page.js': pageWith(), 'pages/view.js': viewWith(), 'pages/about/page.js': pageWith('../../shared/shell.js'), 'pages/about/view.js': viewWith('../../shared/shell-view-two.js') },
    async (project) => {
      await assert.rejects(loadConfig({ root: project, mode: { dev: false } }), /pages\/(about\/)?page\.js: the content of the shell "main" differs from the one pages\/(about\/)?page\.js gives it\. Every page of a shell imports the same content from one module; a different header needs a different shell name/);
    },
  );
});
