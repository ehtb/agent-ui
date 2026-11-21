// `checks` in build.config.mjs: the project's own rules over the finished spec of every page and shell. What a component wrote
// (`madeBy`), the shape of a check, the sentences each mistake gets, and that `agent-ui check` and a production build run them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const { defineElement, expandComponents, madeBy, markMadeBy, param, slot } = await import('../src/components.js');
const { button, div, p, span } = await import('../src/spec.js');
const { checkProjectChecks, forbidTags, runProjectChecks } = await import('../build/project-checks.mjs');
const { checkConfig } = await import('../build/config-check.mjs');
const { loadConfig } = await import('../build/config.mjs');
const { checkProject } = await import('../cli/check.mjs');

const repository = resolve(import.meta.dirname, '..');

// ----------------------------------------------------------------------------------------------- what a component wrote

const Button = defineElement('Button', { params: { label: { default: 'Go' } }, spec: button({ class: 'btn' }, param('label')) });
const Card = defineElement('Card', { spec: div({ class: 'card' }, slot()) });
const Panel = defineElement('Panel', { spec: Card(null, span(null, 'header'), slot()) }); // a component that passes its children on
const Toolbar = defineElement('Toolbar', { params: ['action'], spec: div(null, param('action')) }); // a component that takes a node as a param

test('madeBy names the component whose definition wrote a node, and is null for what a page wrote', () => {
  const page = expandComponents(div({ id: 'page' }, Button({ label: 'Save' }), button(null, 'raw')), [Button]);
  const [made, raw] = page.children;
  assert.equal(madeBy(page), null);
  assert.equal(madeBy(made), 'Button');
  assert.equal(madeBy(raw), null, 'a button the page wrote itself is not the component\'s');
});

test('what a page passes to a component as children is still the page\'s, also through a component that passes it on', () => {
  const page = expandComponents(div(null, Card(null, button(null, 'inside')), Panel(null, button(null, 'deeper'))), [Card, Panel]);
  const [card, panel] = page.children;
  assert.equal(madeBy(card), 'Card');
  assert.equal(madeBy(card.children[0]), null, 'a slot child of a Card');
  assert.equal(madeBy(panel), 'Card', 'the element Panel makes is the one of the Card it uses');
  const [header, deeper] = panel.children;
  assert.equal(madeBy(header), 'Panel', 'written in the definition of Panel');
  assert.equal(madeBy(deeper), null, 'passed through Panel into Card, and still written by the page');
});

test('a node given as a param is the page\'s too, and the copies a component makes of it keep that', () => {
  const Echo = defineElement('Echo', { params: ['action'], spec: div(null, param('action'), param('action')) });
  const page = expandComponents(div(null, Toolbar({ action: button(null, 'x') }), Echo({ action: button(null, 'y') })), [Toolbar, Echo]);
  const [toolbar, echo] = page.children;
  assert.equal(madeBy(toolbar), 'Toolbar');
  assert.equal(madeBy(toolbar.children), null, 'the one child of the Toolbar is the node that was given');
  assert.deepEqual(echo.children.map(madeBy), [null, null]);
  const Wrapper = defineElement('Wrapper', { params: ['action'], spec: Toolbar({ action: param('action') }) }); // passed on as a param, twice removed
  const wrapped = expandComponents(div(null, Wrapper({ action: button(null, 'z') })), [Wrapper, Toolbar]);
  assert.equal(madeBy(wrapped.children.children), null);
});

test('the table is not part of the spec: it expands to the same plain data as before', () => {
  const page = expandComponents(div(null, Button({ label: 'Save' })), [Button]);
  assert.deepEqual(page, { tag: 'div', children: { tag: 'button', props: { class: 'btn' }, children: 'Save' } });
  assert.equal(JSON.stringify(page), JSON.stringify({ tag: 'div', children: { tag: 'button', props: { class: 'btn' }, children: 'Save' } }));
  assert.equal(madeBy({ tag: 'button' }), null, 'a node that never went through expandComponents');
});

// A component written as a plain function: nothing reads its definition, so it says which nodes are its own.
const Dialog = (title, children) => markMadeBy('Dialog', div({ class: 'dialog' }, p(null, title), button({ id: 'close' }, 'Close'), div({ class: 'body' }, children)), children);

test('markMadeBy names a plain function component as the author of the nodes it writes, and leaves what the page passed in to the page', () => {
  const inside = button({ id: 'inside' }, 'Save');
  const dialog = Dialog('Sure?', inside);
  assert.equal(madeBy(dialog), 'Dialog');
  assert.equal(madeBy(dialog.children[1]), 'Dialog', 'its own button');
  assert.equal(madeBy(dialog.children[2]), 'Dialog', 'the div that holds the children');
  assert.equal(madeBy(inside), null, 'the page wrote this one, the Dialog only holds it');
  const several = Dialog('Sure?', [button(null, 'a'), p(null, button(null, 'b'))]);
  assert.deepEqual(several.children[2].children.map(madeBy), [null, null], 'a list of children, and what is below them');
});

test('a node that has an author keeps it: through another component the function uses, and through the copy expandComponents makes', () => {
  const Confirm = (children) => markMadeBy('Confirm', div(null, Dialog('Sure?', children), Button({ label: 'Yes' })), children);
  const confirm = Confirm(button({ id: 'page-button' }, 'raw'));
  assert.equal(madeBy(confirm), 'Confirm');
  assert.equal(madeBy(confirm.children[0]), 'Dialog', 'the Dialog marked its own nodes first');
  const page = expandComponents(div({ id: 'page' }, Card(null, Dialog('Sure?', button({ id: 'raw' }, 'raw')))), [Card, Button]);
  const dialog = page.children.children[0];
  assert.equal(madeBy(page.children), 'Card');
  assert.equal(madeBy(dialog), 'Dialog', 'the copy has the author of the original');
  assert.equal(madeBy(dialog.children[1]), 'Dialog');
  assert.equal(madeBy(dialog.children[2].children), null, 'what the page passed in is still the page\'s, through the copy');
});

test('forbidTags leaves the button a plain function component writes and fails the one a page passes into it', () => {
  const spec = expandComponents(div({ id: 'page' }, Dialog('Sure?', button({ id: 'raw' }, 'raw'))), []);
  assert.deepEqual(runProjectChecks([rawButton], { spec, file: 'pages/page.js' }), [
    'pages/page.js: $.children.children[2].children (id "raw"): a button is written directly. Use Button from ui/button.js (check "forbid-tags")',
  ]);
});

test('markMadeBy says what is wrong where it is called', () => {
  const expectError = (call, message) => assert.throws(call, { message });
  expectError(() => markMadeBy('', div(null)), "markMadeBy: the name must be the component's name, a non-empty string, got \"\". Write return markMadeBy('Dialog', node, children)");
  expectError(() => markMadeBy('Dialog', [div(null)]), "markMadeBy('Dialog'): the second argument must be the node the component returns (a plain object made with the builders), got an array. Write return markMadeBy('Dialog', div(...), children), one node; wrap several in a div or a fragment node");
  expectError(() => markMadeBy('Dialog', 'text'), /got string\. Write return markMadeBy\('Dialog', div\(\.\.\.\), children\)/);
});

// ----------------------------------------------------------------------------------------------- a check, and its report

const rawButton = forbidTags({ button: 'Use Button from ui/button.js' });
const specWithBoth = () => expandComponents(div({ id: 'page' }, Button({ label: 'Save' }), p(null, button({ id: 'raw' }, 'raw'))), [Button]);

test('forbidTags fails the tag a page writes directly, with where it is and what to write, and leaves the component\'s own', () => {
  assert.deepEqual(runProjectChecks([rawButton], { spec: specWithBoth(), file: 'pages/page.js' }), [
    'pages/page.js: $.children[1].children (id "raw"): a button is written directly. Use Button from ui/button.js (check "forbid-tags")',
  ]);
  assert.deepEqual(runProjectChecks([rawButton], { spec: expandComponents(div(null, Button(null)), [Button]), file: 'pages/page.js' }), []);
  assert.deepEqual(runProjectChecks([], { spec: specWithBoth(), file: 'x' }), []);
  assert.deepEqual(runProjectChecks(undefined, { spec: specWithBoth(), file: 'x' }), []);
});

test('a shell\'s content is named as the shell\'s', () => {
  const [problem] = runProjectChecks([rawButton], { spec: div(null, button(null, 'x')), file: 'pages/page.js', where: 'shell', owner: 'shell "main": ' });
  assert.equal(problem, 'pages/page.js: shell "main": $.children: a button is written directly. Use Button from ui/button.js (check "forbid-tags")');
});

test('a check of the project\'s own gets the node, who wrote it, its parent, its path and whose spec it is', () => {
  const seen = [];
  const spy = { name: 'spy', node: ({ node, madeBy: author, parent, path, where }) => void seen.push([node.tag ?? Object.keys(node)[0], author, parent?.tag ?? null, path, where]) };
  runProjectChecks([spy], { spec: expandComponents(div(null, Button(null), span(null, 'x')), [Button]), file: 'f' });
  assert.deepEqual(seen, [['div', null, null, '$', 'page'], ['button', 'Button', 'div', '$.children[0]', 'page'], ['span', null, 'div', '$.children[1]', 'page']]);
});

test('a finding may be a list, and a trailing full stop in the problem is not doubled', () => {
  const twice = { name: 'twice', node: ({ node }) => (node.tag === 'span' ? [{ problem: 'first.', fix: 'Fix one.' }, { problem: 'second', fix: 'Fix two.' }] : undefined) };
  assert.deepEqual(runProjectChecks([twice], { spec: span({ id: 's' }, 'x'), file: 'f' }), ['f: $ (id "s"): first. Fix one. (check "twice")', 'f: $ (id "s"): second. Fix two. (check "twice")']);
});

test('a check that throws, or returns something that is not { problem, fix }, is a problem that says so', () => {
  const throws = { name: 'throws', node: () => { throw new Error('boom'); } };
  assert.deepEqual(runProjectChecks([throws], { spec: p(null, 'x'), file: 'f' }), ['f: $: the check "throws" threw boom. Fix the check in build.config.mjs; a check must return nothing or { problem, fix }']);
  const loose = { name: 'loose', node: () => 'a string' };
  assert.match(runProjectChecks([loose], { spec: p(null, 'x'), file: 'f' })[0], /^f: \$: the check "loose" returned "a string", which is not \{ problem, fix \}\. Return nothing, or \{ problem: 'what is wrong', fix: 'what to write' \}/);
  const noFix = { name: 'no-fix', node: () => ({ problem: 'wrong' }) };
  assert.match(runProjectChecks([noFix], { spec: p(null, 'x'), file: 'f' })[0], /the check "no-fix" returned \{"problem":"wrong"\}, which is not \{ problem, fix \}/);
});

// ----------------------------------------------------------------------------------------------- the option

test('forbidTags is checked where it is written: the tags, the fixes and the name', () => {
  const expectError = (action, pattern) => assert.throws(action, (error) => pattern.test(error.message), String(pattern));
  expectError(() => forbidTags({}), /forbidTags\(\.\.\.\): the first argument must be an object of tag to what to write instead\. Write forbidTags\(\{ button: 'Use Button from ui\/button\.js' \}\)/);
  expectError(() => forbidTags({ buton: 'x' }), /"buton" is not a tag of the grammar\. Did you mean "button"\?/);
  expectError(() => forbidTags({ button: '' }), /the fix for "button" must be a sentence that says what to write instead\. Write button: 'Use Button from ui\/button\.js'/);
  expectError(() => forbidTags({ button: 'x' }, 'No Raw'), /the name "No Raw" must be lower-case words joined by dashes/);
});

test('the checks option is checked: a list of { name, node }, with the sentence to write for each mistake', () => {
  const problems = (checks) => checkConfig({ outDir: 'dist', checks });
  assert.deepEqual(problems([rawButton, { name: 'mine', node: () => undefined }]), []);
  assert.match(problems('x')[0], /^build config "checks": must be a list of checks\. Write checks: \[forbidTags\(\{ button: 'Use Button from ui\/button\.js' \}\)\]/);
  assert.match(problems([null])[0], /^build config "checks\[0\]": a check is \{ name, node \}, got null\./);
  assert.match(problems([{ name: 'a', nod: () => 1, node() {} }])[0], /"checks\[0\]": unknown key "nod"\. Did you mean "node"\? A check has name and node/);
  assert.match(problems([{ name: 'No Raw', node() {} }])[0], /"checks\[0\]": name must be lower-case words joined by dashes, got "No Raw"\. Write name: 'no-raw-button'/);
  assert.match(problems([{ node() {} }])[0], /name must be lower-case words joined by dashes, got undefined/);
  assert.match(problems([{ name: 'a', node: 'x' }])[0], /"checks\[0\]": node must be a function\. Write node: \(\{ node, madeBy \}\) =>/);
  assert.match(problems([rawButton, forbidTags({ a: 'Use Link' })])[0], /"checks\[1\]": the name "forbid-tags" is used twice\. Give each check a name of its own \(forbidTags takes it as a second argument\)/);
  assert.deepEqual(checkProjectChecks([forbidTags({ a: 'Use Link' }, 'no-raw-link'), rawButton]), []);
  assert.match(checkConfig({ outDir: 'dist', check: [] })[0], /key "check": unknown option\. Did you mean "checks"\?/);
});

// ----------------------------------------------------------------------------------------------- a project

const buttonComponent = [
  "import { button } from '@ehtb/agent-ui/spec';",
  "import { defineElement, param } from '@ehtb/agent-ui/components';",
  "export const Button = defineElement('Button', { params: ['label'], spec: button({ class: 'btn' }, param('label')) });",
  '',
].join('\n');
const pageFile = "export const page = { head: { title: 'Home' } };\n";
const viewWith = (body) => [
  "import { div, button } from '@ehtb/agent-ui/spec';",
  "import { expandComponents } from '@ehtb/agent-ui/components';",
  "import { Button } from '../ui/button.js';",
  `export const view = expandComponents(div({ id: 'home' }, ${body}), [Button]);`,
  '',
].join('\n');
const configFile = [
  "import { frameworkBuildOptions } from '@ehtb/agent-ui/build/presets.mjs';",
  "import { forbidTags } from '@ehtb/agent-ui/checks';",
  "export default ({ dev = false, validator } = {}) => ({ ...frameworkBuildOptions({ dev, validator, projectRoot: import.meta.dirname }), checks: [forbidTags({ button: 'Use Button from ui/button.js' }, 'no-raw-button')] });",
  '',
].join('\n');

const withProject = async (files, run) => {
  const project = mkdtempSync(join(tmpdir(), 'agent-ui-checks-'));
  try {
    for (const folder of ['pages', 'pages/about', 'ui', 'node_modules/@ehtb']) mkdirSync(join(project, folder), { recursive: true });
    symlinkSync(repository, join(project, 'node_modules/@ehtb/agent-ui'), 'dir');
    writeFileSync(join(project, 'package.json'), '{"name":"site","private":true,"type":"module"}');
    writeFileSync(join(project, 'build.config.mjs'), configFile);
    writeFileSync(join(project, 'ui/button.js'), buttonComponent);
    for (const [name, text] of Object.entries(files)) writeFileSync(join(project, name), text);
    return await run(project);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
};

test('agent-ui check reports a raw button of a page and passes the Button component\'s own', async () => {
  await withProject({ 'pages/page.js': pageFile, 'pages/view.js': viewWith("Button({ label: 'Save' }), button({ id: 'raw' }, 'Raw')") }, async (project) => {
    const config = await loadConfig({ root: project, mode: { dev: true } });
    const { problems } = await checkProject({ config, root: project });
    assert.equal(problems.length, 1, JSON.stringify(problems));
    assert.equal(problems[0], 'pages/page.js: $.children[1] (id "raw"): a button is written directly. Use Button from ui/button.js (check "no-raw-button")');
  });
});

test('agent-ui check passes a page whose buttons all come from the component', async () => {
  await withProject({ 'pages/page.js': pageFile, 'pages/view.js': viewWith("Button({ label: 'Save' }), Button({ label: 'Cancel' })") }, async (project) => {
    const config = await loadConfig({ root: project, mode: { dev: true } });
    assert.deepEqual((await checkProject({ config, root: project })).problems, []);
  });
});

test('a production build refuses the page with the project\'s checks listed, and a development build does not run them', async () => {
  await withProject({ 'pages/page.js': pageFile, 'pages/view.js': viewWith("button({ id: 'raw' }, 'Raw')") }, async (project) => {
    await assert.rejects(
      () => loadConfig({ root: project, mode: { dev: false } }),
      (error) => /pages\/page\.js: the project's checks found a problem:\n {2}pages\/page\.js: \$\.children \(id "raw"\): a button is written directly\. Use Button from ui\/button\.js \(check "no-raw-button"\)\. Fix what each line says; the rules are the `checks` of build\.config\.mjs/.test(error.message),
    );
    await loadConfig({ root: project, mode: { dev: true } });
  });
});

test('a shell\'s content is checked once, however many pages use it', async () => {
  const shell = [
    "import { defineShell } from '@ehtb/agent-ui/shell';",
    "export const shell = defineShell({ name: 'main' });",
    '',
  ].join('\n');
  const shellView = [
    "import { main, button, pageSlot } from '@ehtb/agent-ui/spec';",
    "export const shell = { name: 'main', view: main({ id: 'frame' }, button({ id: 'menu' }, 'Menu'), pageSlot()) };",
    '',
  ].join('\n');
  const shellPage = "import { shell } from '../shell.js';\nexport const page = { head: { title: 'T' }, shell };\n";
  const shellViewFile = "import { p } from '@ehtb/agent-ui/spec';\nimport { shell } from '../shell-view.js';\nexport const view = p({ id: 'x' }, 'x');\nexport { shell };\n";
  await withProject(
    { 'shell.js': shell, 'shell-view.js': shellView, 'pages/page.js': shellPage, 'pages/view.js': shellViewFile, 'pages/about/page.js': shellPage.replace('../', '../../'), 'pages/about/view.js': shellViewFile.replace('../', '../../') },
    async (project) => {
      const config = await loadConfig({ root: project, mode: { dev: true } });
      const { problems } = await checkProject({ config, root: project });
      const reported = problems.filter((problem) => problem.includes('shell "main"'));
      assert.equal(reported.length, 1, JSON.stringify(problems));
      assert.match(reported[0], /: shell "main": \$\.children\[0\] \(id "menu"\): a button is written directly\. Use Button from ui\/button\.js \(check "no-raw-button"\)$/);
    },
  );
});
