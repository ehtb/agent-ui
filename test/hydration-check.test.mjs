// What `agent-ui check` says about hydration (cli/hydration-check.mjs): the page a browser would make from the state the document carries is
// compared with the markup the server wrote, with itself again, and with itself under another clock, time zone and locale. A page whose markup
// depends on one of them, or on a state key the document leaves out, is reported with what it depends on and where the markup first differs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const { definePage } = await import('../src/pages.js');
const { renderFirstPass, renderPage } = await import('../server/render-page.js');
const { describeDifference, findHydrationProblems } = await import('../cli/hydration-check.mjs');
const { checkProject } = await import('../cli/check.mjs');

const view = { tag: 'section', id: 'view', children: [{ tag: 'p', id: 'label', children: { state: 'page.label' } }, { tag: 'p', id: 'plain', children: { state: 'page.plain' } }] };
// A page whose derived value `label` is whatever `compute(get)` says.
const pageWith = (compute, extra = {}) =>
  definePage({ head: { title: 'A page' }, namespaces: { page: { state: { timestamp: Date.UTC(2026, 10, 11, 23, 30), amount: 1234567.891, plain: 'stays', ...extra.state }, derive: { label: compute } } } }, { path: '/', view });
const problemsOf = async (definition, options = {}) => {
  const result = await renderPage(definition.create, { url: '/', dev: true, ...options });
  try {
    return findHydrationProblems({ create: definition.create, createShell: definition.createShell, url: '/', result, where: '/ /' });
  } finally {
    result.ui.destroy();
  }
};
const only = (problems) => {
  assert.equal(problems.length, 1, problems.join('\n'));
  return problems[0];
};

test('a page that is a function of its state, and states its locale and time zone, has nothing to report', async () => {
  const definition = pageWith((get) => `${new Date(get('timestamp')).toLocaleString('en-US', { timeZone: 'UTC' })} / ${get('amount').toLocaleString('en-US')} / ${new Intl.NumberFormat('de-DE').format(get('amount'))}`);
  assert.deepEqual(await problemsOf(definition), []);
});

test('a derived value that reads the clock is reported with what it depends on, and where the markup differs', async () => {
  const problem = only(await problemsOf(pageWith(() => `year ${new Date().getFullYear()}`)));
  assert.match(problem, /^\/ \/: the page is not the same for the same state: its markup depends on the current time \(Date\.now, new Date\(\)\), near the element with data-id "label": one render has .*year \d{4}.*, the next has .*year \d{4}/);
  assert.match(problem, /The browser renders from the state the document carries, at another time and place than the server did, so it would make these nodes again \(AUI0305\)\. Make a derived value a function of the state alone: read the time or a random id in an action or an API response and keep it in state, and give toLocaleString and Intl an explicit locale and timeZone$/);
  assert.match(only(await problemsOf(pageWith(() => `now ${Date.now()}`))), /depends on the current time/);
});

test('random numbers and counters, the time zone and the locale are found one by one', async () => {
  assert.match(only(await problemsOf(pageWith(() => `r ${Math.random()}`))), /two renders from one state differ, near the element with data-id "label".*That is what random numbers \(Math\.random\) or ids made by a counter do\./);
  let counter = 0;
  assert.match(only(await problemsOf(pageWith(() => `id ${++counter}`))), /two renders from one state differ/, 'a counter is found the same way');
  assert.match(only(await problemsOf(pageWith((get) => new Date(get('timestamp')).toLocaleString('en-US')))), /depends on the time zone \(a date written without timeZone\)/);
  assert.match(only(await problemsOf(pageWith((get) => get('amount').toLocaleString()))), /depends on the locale \(toLocaleString, Intl\.NumberFormat or Intl\.DateTimeFormat without a locale\)/);
  assert.match(only(await problemsOf(pageWith((get) => new Intl.NumberFormat().format(get('amount'))))), /depends on the locale/);
  assert.match(only(await problemsOf(pageWith((get) => `${new Date(get('timestamp')).toLocaleDateString()}`))), /depends on the time zone.*; the locale|depends on the locale; .*time zone|depends on the (locale|time zone)/, 'a date without locale and zone depends on both');
});

test('a state key the document leaves out is a page that is not the one the server wrote', async () => {
  const definition = pageWith((get) => get('plain').toUpperCase());
  const withoutPlain = (state) => ({ ...state, page: { timestamp: state.page.timestamp, amount: state.page.amount } });
  const problem = only(await problemsOf(definition, { initialState: { page: { plain: 'from the server' } }, stateForBrowser: withoutPlain }));
  assert.match(problem, /^\/ \/: the page a browser renders from the state the document carries is not the page the server wrote, near the element with data-id "label": the server has .*FROM THE SERVER.*, the browser has .*STAYS/);
  assert.deepEqual(await problemsOf(definition, { initialState: { page: { plain: 'from the server' } } }), [], 'the same page with the whole state in the document has nothing to report');
  assert.match(problem, /Likely causes: stateForBrowser left out a key the page shows, or the markup depends on something that is not in the state$/);
});

test('a page that did not become ready is not compared, and a page that cannot start from its state says so', async () => {
  const definition = pageWith((get) => get('plain'));
  const result = await renderPage(definition.create, { url: '/', dev: true });
  try {
    assert.deepEqual(findHydrationProblems({ create: definition.create, createShell: undefined, url: '/', result: { ...result, timedOut: true }, where: 'x' }), []);
    const broken = findHydrationProblems({ create: () => { throw new Error('no state for me'); }, createShell: undefined, url: '/', result, where: '/ /' });
    assert.deepEqual(broken, ['/ /: the page cannot be made from the state the document carries: no state for me. A browser would fail the same way when it starts']);
  } finally {
    result.ui.destroy();
  }
});

test('the first pass is the markup before anything the plugins start can change it, from the state given and nothing else', () => {
  const definition = pageWith((get) => get('plain'));
  const html = renderFirstPass(definition.create, { url: '/', state: { page: { timestamp: 0, amount: 1, plain: 'given' } } });
  assert.equal(html, '<section data-id="view"><p data-id="label">given</p><p data-id="plain">given</p></section>');
});

test('where two pieces of markup first differ: the element they are in, and a few characters of each', () => {
  assert.equal(describeDifference('<p data-id="a">one</p>', '<p data-id="a">two</p>', 'left', 'right'), 'near the element with data-id "a": left has "<p data-id=\\"a\\">one</p>", right has "<p data-id=\\"a\\">two</p>"');
  assert.match(describeDifference('abc', 'abd', 'left', 'right'), /^at the start: left has "abc", right has "abd"$/);
});

test('the time, the time zone and the locale are put back after a check, even when the page throws', async () => {
  const realDate = Date;
  const realRandom = Math.random;
  const realZone = process.env.TZ;
  const realFormat = Number.prototype.toLocaleString;
  const realNumberFormat = Intl.NumberFormat;
  await problemsOf(pageWith(() => `${Date.now()} ${Math.random()} ${(1).toLocaleString()}`));
  const result = await renderPage(pageWith((get) => get('plain')).create, { url: '/', dev: true });
  findHydrationProblems({ create: () => { throw new Error('boom'); }, url: '/', result, where: 'x' });
  result.ui.destroy();
  assert.equal(Date, realDate);
  assert.equal(Math.random, realRandom);
  assert.equal(process.env.TZ, realZone);
  assert.equal(Number.prototype.toLocaleString, realFormat);
  assert.equal(Intl.NumberFormat, realNumberFormat);
});

test('agent-ui check reports it for every page it renders, in the report of the page', async () => {
  const repository = resolve(import.meta.dirname, '..');
  const project = mkdtempSync(join(tmpdir(), 'agent-ui-check-hydration-'));
  const appModule = (derive) => `
    import { definePage } from '${repository}/src/pages.js';
    const definition = definePage({
      head: { title: 'Home' },
      namespaces: { page: { state: { amount: 1234.5 }, derive: { label: ${derive} } } },
    }, { path: '/', view: { tag: 'p', id: 'home', children: { state: 'page.label' } } });
    export const { create, createShell, describePage, namespaces, spec } = definition;
  `;
  try {
    writeFileSync(join(project, 'pure.mjs'), appModule("(get) => get('amount').toLocaleString('en-US')"));
    writeFileSync(join(project, 'impure.mjs'), appModule("(get) => get('amount').toLocaleString()"));
    const config = (file) => ({ outDir: 'dist', pages: [{ name: 'index', path: '/', app: file, file: 'pages/page.js' }] });
    assert.deepEqual((await checkProject({ config: config('pure.mjs'), root: project })).problems, []);
    const { problems } = await checkProject({ config: config('impure.mjs'), root: project });
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.match(problems[0], /^\/ \/: the page is not the same for the same state: its markup depends on the locale/);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});
