// The document of a rendered page (server/document.mjs), and the commands that render pages: check, prerender and the
// data requests they answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { injectHead } from '../server/document.mjs';
import { renderDocument } from '../server/document.mjs';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PAGE = '<!doctype html>\n<html>\n<head>\n<title>Old</title>\n</head>\n<body>\n<div id="app"></div>\n<script type="module" src="a.js"></script>\n</body>\n</html>\n';

test('title and description are replaced, not duplicated', () => {
  const first = injectHead(PAGE, { title: 'A & B', description: 'About "A"' });
  assert.match(first, /<title>A &amp; B<\/title>\n<meta name="description" content="About &quot;A&quot;">/);
  const second = injectHead(first, { title: 'Next', description: '' });
  assert.match(second, /<title>Next<\/title>/);
  assert.doesNotMatch(second, /meta name="description"/);
});

test('head elements go before the end of <head>, even when a body script contains "</head>" in its text', () => {
  const page = '<!doctype html><html><head><title>x</title></head><body><script>const s = "</head>";</script></body></html>';
  const head = injectHead(page, { title: 'x', tags: [{ tag: 'meta', attributes: { name: 'robots', content: 'noindex' }, text: '' }] });
  assert.ok(head.indexOf('name="robots"') < head.indexOf('</head>'), head);
  assert.ok(head.includes('<script>const s = "</head>";</script>'), 'the script text is untouched');
});

test('renderDocument adds markup, state, title and description, and running it again changes nothing', () => {
  const result = { html: '<p>x</p>', stateScript: '<script type="application/json" id="agent-ui-state">{}</script>', state: { route: 'home' } };
  const describePage = () => ({ title: 'Home', description: 'Start' });
  const document = renderDocument(PAGE, result, { describePage });
  assert.match(document, /<title>Home<\/title>/);
  assert.match(document, /<meta name="description" content="Start">/);
  assert.match(document, /<!--ssr:start--><p>x<\/p><!--ssr:end-->/);
  assert.equal(renderDocument(document, result, { describePage }), document);
  assert.match(renderDocument(PAGE, result), /<title>Old<\/title>/); // without describePage the title is left as it is
});

// A page module as the build generates it (build/pages.mjs), for tests that need a page on disk.
const pagesModule = new URL('../src/pages.js', import.meta.url).href;
const writePage = (root, file, { path = '/', title = 'Fine', extra = '', after = '' } = {}) =>
  writeFileSync(
    join(root, file),
    `import { definePage } from '${pagesModule}';\nconst definition = definePage({ head: { title: ${JSON.stringify(title)} }${extra} }, { path: ${JSON.stringify(path)}, view: { tag: 'p', id: 'x', children: 'x' } });\nexport const { create, describePage, namespaces, spec } = definition;\n${after}`,
  );
const record = (name, app, path = '/') => ({ name, path, app, file: `pages/${name}/page.js` });

test('check renders every page in development mode and reports what is wrong', async () => {
  const { checkProject } = await import('../cli/check.mjs');
  const root = mkdtempSync(join(tmpdir(), 'agent-ui-check-'));
  try {
    writePage(root, 'good.mjs');
    writePage(root, 'bad.mjs', { title: '' });
    writePage(root, 'bad-status.mjs', { extra: ", status: () => 'ok'" });
    writeFileSync(join(root, 'broken.mjs'), 'export const spec = {};\nexport const create = () => { throw new Error("spec problem at $.children.0"); };\nexport const describePage = () => ({ title: "x" });\n');
    const run = (app) => checkProject({ root, config: { outDir: 'dist', pages: [record('p', app)] } });
    const good = await run('good.mjs');
    assert.deepEqual({ ...good, measurements: good.measurements.map(({ url, elements, listRows }) => ({ url, elements, listRows })) }, { problems: [], pagesChecked: 1, notes: [], measurements: [{ url: '/', elements: 1, listRows: 0 }] });
    const withHook = await checkProject({
      root,
      config: { outDir: 'dist', pages: [record('p', 'good.mjs')], stateForBrowser: () => ({ nope: {} }) },
    });
    assert.ok(withHook.problems.some((problem) => /stateForBrowser: returned the namespace "nope", which the page did not declare/.test(problem)), JSON.stringify(withHook.problems));
    assert.deepEqual((await run('bad.mjs')).problems, ['/ /: the page has no title']);
    assert.deepEqual((await run('bad-status.mjs')).problems, ['/ /: page "/": status(state) returned "ok", not an HTTP status. Return a whole number such as 200 or 404']);
    // NaN is written as NaN, not as JSON's "null", so the message names what the page returned.
    writePage(root, 'nan-status.mjs', { extra: ', status: () => NaN' });
    assert.deepEqual((await run('nan-status.mjs')).problems, ['/ /: page "/": status(state) returned NaN, not an HTTP status. Return a whole number such as 200 or 404']);
    assert.deepEqual((await run('broken.mjs')).problems, ['/ /: spec problem at $.children.0']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('check starts a page with no paths at a sample URL, so a missing plugin is found without rendering its data', async () => {
  const { checkProject } = await import('../cli/check.mjs');
  const root = mkdtempSync(join(tmpdir(), 'agent-ui-unrendered-mount-'));
  try {
    // A namespace that declares resources, and no withResources: only a mount finds that.
    const resources = ", namespaces: { box: { state: { data: null }, actions: { loading: { args: {}, run() {} }, loaded: { args: { data: 'json' }, run() {} }, failed: { args: { message: 'string' }, run() {} } }, resources: [{ watch: [], request: () => ({ url: '/x' }), onStart: 'loading', onSuccess: 'loaded', onError: 'failed' }] } }";
    writePage(root, 'item.mjs', { path: '/item/:id', extra: resources });
    const { problems, notes } = await checkProject({ root, config: { outDir: 'out', pages: [record('item-id', 'item.mjs', '/item/:id')] } });
    assert.equal(problems.length, 1, JSON.stringify(problems));
    assert.match(problems[0], /^pages\/item-id\/page\.js: at \/item\/1 \(a sample URL, because view\.js lists no `paths`\): cannot start the page: namespace "box": declares resources, but no plugin loads them/);
    assert.deepEqual(notes, ['/item/:id has parameters and its view.js lists no `paths`, so check does not render it at its URLs (its spec is validated and it is started at a sample URL). Export paths = ["/item/1"] to render it']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('check reports a link that is no page, no file in publicDir and no API path, and accepts the ones that are', async () => {
  const { checkProject } = await import('../cli/check.mjs');
  const root = mkdtempSync(join(tmpdir(), 'agent-ui-links-'));
  try {
    mkdirSync(join(root, 'public'));
    writeFileSync(join(root, 'public', 'terms.html'), 'terms');
    const links = [
      { tag: 'a', props: { href: '/about' }, children: 'ok' },
      { tag: 'a', props: { href: '/item/3?x=1#top' }, children: 'ok' },
      { tag: 'a', props: { href: { join: ['/item/', { state: 'route.params.id' }] } }, children: 'ok' },
      { tag: 'a', props: { href: '/terms.html' }, children: 'ok' },
      { tag: 'a', props: { href: 'https://example.com' }, children: 'ok' },
      { tag: 'a', props: { href: '/abuot' }, children: 'bad' },
      { tag: 'a', props: { href: '/missing.html' }, children: 'bad' },
    ];
    writePage(root, 'home.mjs', { extra: `, namespaces: {}` });
    writeFileSync(join(root, 'home.mjs'), readFileSync(join(root, 'home.mjs'), 'utf8').replace("view: { tag: 'p', id: 'x', children: 'x' }", `view: { tag: 'nav', id: 'nav', children: ${JSON.stringify(links)} }`));
    writePage(root, 'about.mjs', { path: '/about' });
    writePage(root, 'item.mjs', { path: '/item/:id' });
    const pages = [record('index', 'home.mjs'), record('about', 'about.mjs', '/about'), record('item-id', 'item.mjs', '/item/:id')];
    const { problems } = await checkProject({ root, config: { outDir: 'dist', publicDir: 'public', pages } });
    assert.equal(problems.length, 2, JSON.stringify(problems));
    assert.match(problems[0], /pages\/index\/page\.js: the link "\/abuot" is no page, no file in publicDir and no API path\. Did you mean "\/about"\?/);
    assert.match(problems[1], /the link "\/missing\.html" is no page/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('check validates the spec of a page it does not render (a page with parameters has no URL of its own)', async () => {
  const { checkProject } = await import('../cli/check.mjs');
  const root = mkdtempSync(join(tmpdir(), 'agent-ui-unrendered-'));
  try {
    writePage(root, 'item.mjs', { path: '/item/:id' });
    // an input without a label: the validator refuses it
    writeFileSync(join(root, 'item.mjs'), readFileSync(join(root, 'item.mjs'), 'utf8').replace("view: { tag: 'p', id: 'x', children: 'x' }", "view: { tag: 'input', id: 'x' }"));
    const { problems, pagesChecked, notes } = await checkProject({ root, config: { outDir: 'out', pages: [record('item-id', 'item.mjs', '/item/:id')] } });
    assert.equal(pagesChecked, 0);
    assert.equal(problems.length, 1, JSON.stringify(problems));
    assert.match(problems[0], /^pages\/item-id\/page\.js: .*aria-label/);
    assert.deepEqual(notes, ['/item/:id has parameters and its view.js lists no `paths`, so check does not render it at its URLs (its spec is validated and it is started at a sample URL). Export paths = ["/item/1"] to render it']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('prerender (agent-ui build --static) writes each page to <path>/index.html, "/" to index.html, and leaves the page shell alone', async () => {
  const { prerender } = await import('../build/prerender.mjs');
  const root = mkdtempSync(join(tmpdir(), 'agent-ui-prerender-'));
  try {
    mkdirSync(join(root, 'out'));
    for (const name of ['index', 'about']) writeFileSync(join(root, 'out', `${name}.html`), PAGE);
    writePage(root, 'home.mjs', { title: 'Home' });
    writePage(root, 'about.mjs', { path: '/about', title: 'About' });
    const written = await prerender({ projectRoot: root, outDir: 'out', pages: [record('index', 'home.mjs'), record('about', 'about.mjs', '/about')] });
    assert.deepEqual(written, ['/', '/about']);
    assert.match(readFileSync(join(root, 'out', 'index.html'), 'utf8'), /<title>Home<\/title>[\s\S]*<!--ssr:start--><p data-id="x">x<\/p>/);
    assert.match(readFileSync(join(root, 'out', 'about/index.html'), 'utf8'), /<title>About<\/title>/);
    assert.equal(readFileSync(join(root, 'out', 'about.html'), 'utf8'), PAGE); // the shell stays what the build wrote
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a static site names every page: prerender refuses a page with parameters before it renders anything', async () => {
  const { prerender } = await import('../build/prerender.mjs');
  const root = mkdtempSync(join(tmpdir(), 'agent-ui-dynamic-'));
  try {
    mkdirSync(join(root, 'out'));
    writePage(root, 'home.mjs', { title: 'Home' });
    writePage(root, 'item.mjs', { path: '/item/:id' });
    writePage(root, 'docs.mjs', { path: '/docs/*path' });
    await assert.rejects(
      prerender({ projectRoot: root, outDir: 'out', pages: [record('index', 'home.mjs'), record('item-id', 'item.mjs', '/item/:id'), record('docs-path', 'docs.mjs', '/docs/*path')] }),
      /^Error: page "\/item\/:id", page "\/docs\/\*path": has parameters and lists no `paths`, so a static site has no file for it\. Export the URLs to write from its view\.js: export const paths = \["\/product\/1", "\/product\/2"\]/,
    );
    assert.equal(existsSync(join(root, 'out', 'index.html')), false, 'nothing was written');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a page with parameters is checked and written at each URL its view.js lists in `paths`; a wrong list is refused with the fix', async () => {
  const { prerender } = await import('../build/prerender.mjs');
  const { checkProject } = await import('../cli/check.mjs');
  const root = mkdtempSync(join(tmpdir(), 'agent-ui-paths-'));
  try {
    mkdirSync(join(root, 'out'));
    writeFileSync(join(root, 'out', 'item-id.html'), PAGE);
    const itemPage = (paths) => writePage(root, 'item.mjs', { path: '/item/:id', title: 'Item', after: `export const paths = ${paths};\n` });
    itemPage("async () => ['/item/1', '/item/2']");
    const pages = [record('item-id', 'item.mjs', '/item/:id')];
    const checked = await checkProject({ root, config: { outDir: 'out', pages } });
    assert.deepEqual({ ...checked, measurements: checked.measurements.map(({ url }) => url) }, { problems: [], pagesChecked: 2, notes: [], measurements: ['/item/1', '/item/2'] }, 'check renders each listed URL');
    assert.deepEqual(await prerender({ projectRoot: root, outDir: 'out', pages, cacheBust: 1 }), ['/item/1', '/item/2']);
    assert.match(readFileSync(join(root, 'out', 'item/2/index.html'), 'utf8'), /<title>Item<\/title>/);
    const refused = async (paths, message) => {
      itemPage(paths);
      await assert.rejects(prerender({ projectRoot: root, outDir: 'out', pages, cacheBust: paths }), message);
    };
    await refused("['/other/1']", /pages\/item-id\/page\.js: paths\[0\] "\/other\/1" is not a URL of \/item\/:id\. List only URLs this page answers, for example "\/item\/1"/);
    await refused("['/item/1', '/item/1']", /paths\[1\] "\/item\/1" is listed twice/);
    await refused("['/item/a b']", /paths\[0\] "\/item\/a b" is not a plain path/);
    await refused('[]', /"paths" gave an empty list, not a list of URLs/);
    await refused("'/item/1'", /"paths" is string, not a list of URLs or a function that returns one/);
    // A URL that another, more specific page answers: two pages would write one file. Refused before anything is written.
    writePage(root, 'slug.mjs', { path: '/:slug', after: "export const paths = ['/about', '/terms'];\n" });
    writePage(root, 'about-page.mjs', { path: '/about' });
    writeFileSync(join(root, 'out', 'slug.html'), PAGE);
    writeFileSync(join(root, 'out', 'about.html'), PAGE);
    const overlapping = [record('slug', 'slug.mjs', '/:slug'), record('about', 'about-page.mjs', '/about')];
    await assert.rejects(prerender({ projectRoot: root, outDir: 'out', pages: overlapping, cacheBust: 'overlap' }), /^Error: pages\/slug\/page\.js: paths lists "\/about", which the server answers with the page "\/about" \(pages\/about\/page\.js\), not with "\/:slug"\. Remove it from paths/);
    assert.equal(existsSync(join(root, 'out', 'terms', 'index.html')), false, 'nothing was written');
    const overlapChecked = await checkProject({ root, config: { outDir: 'out', pages: overlapping } });
    assert.ok(overlapChecked.problems.some((problem) => /paths lists "\/about", which the server answers with the page "\/about"/.test(problem)), JSON.stringify(overlapChecked.problems));
    writePage(root, 'about.mjs', { path: '/about', after: "export const paths = ['/about'];\n" });
    const about = await checkProject({ root, config: { outDir: 'out', pages: [record('about', 'about.mjs', '/about')] } });
    assert.match(about.problems[0], /exports "paths", but the URL of this page \(\/about\) has no parameters\. A page without parameters has one URL, its own: remove `paths`/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a static site cannot carry a page whose status is not 200: a file host would serve its file with 200', async () => {
  const { prerender } = await import('../build/prerender.mjs');
  const root = mkdtempSync(join(tmpdir(), 'agent-ui-status-'));
  try {
    mkdirSync(join(root, 'out'));
    writeFileSync(join(root, 'out', 'gone.html'), PAGE);
    writePage(root, 'gone.mjs', { path: '/gone', extra: ', status: () => 404' });
    await assert.rejects(prerender({ projectRoot: root, outDir: 'out', pages: [record('gone', 'gone.mjs', '/gone')] }), /page "\/gone": answers 404, and a file host would serve its file with 200\. A static site cannot carry a page whose status is not 200/);
    assert.equal(existsSync(join(root, 'out', 'gone', 'index.html')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a page that never becomes ready fails the prerender instead of shipping a loading state', async () => {
  const { prerender } = await import('../build/prerender.mjs');
  const root = mkdtempSync(join(tmpdir(), 'agent-ui-never-'));
  try {
    mkdirSync(join(root, 'out'));
    writeFileSync(join(root, 'out', 'index.html'), PAGE);
    writePage(root, 'never.mjs', { extra: ', ready: () => false' });
    await assert.rejects(prerender({ projectRoot: root, outDir: 'out', pages: [record('index', 'never.mjs')] }), /prerender \/: waited for data but timed out: the page never became ready/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a render without a configured fetchFunction fails a relative data request with the fix; an absolute URL goes to fetch', async () => {
  const { defaultFetchFunction } = await import('../server/render-page.js');
  await assert.rejects(
    defaultFetchFunction('/people.json'),
    /render: the page requested "\/people\.json" but no fetchFunction is configured\. Add `fetchFunction: \(url, init\) => Promise<response>` to build\.config\.mjs/,
  );
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => ({ answered: url });
  try {
    assert.deepEqual(await defaultFetchFunction('https://api.example.com/x'), { answered: 'https://api.example.com/x' });
  } finally {
    globalThis.fetch = original;
  }
});

test('prerender and check answer a page\'s data requests with the fetchFunction of the config', async () => {
  const { prerender } = await import('../build/prerender.mjs');
  const { checkProject } = await import('../cli/check.mjs');
  const root = mkdtempSync(join(tmpdir(), 'agent-ui-fetch-'));
  try {
    mkdirSync(join(root, 'out'));
    writeFileSync(join(root, 'out', 'index.html'), PAGE);
    const fixture = new URL('./fixtures/catalog-app.js', import.meta.url).href;
    for (const [file, name] of [['app.mjs', 'list'], ['item.mjs', 'item']]) writeFileSync(join(root, file), `import { ${name} } from '${fixture}';\nexport const { create, describePage, namespaces, spec } = ${name};\n`);
    const requested = [];
    const fetchFunction = async (url) => {
      requested.push(url);
      return new Response(JSON.stringify([]), { headers: { 'content-type': 'application/json' } });
    };
    const pages = [record('index', 'app.mjs'), record('item-id', 'item.mjs', '/item/:id')];
    await prerender({ projectRoot: root, outDir: 'out', fetchFunction, pages: pages.slice(0, 1) });
    const checked = await checkProject({ root, config: { outDir: 'out', fetchFunction, pages } });
    assert.deepEqual(checked.problems, []);
    assert.ok(requested.length >= 2, `both the static build and check should have asked the fetchFunction: ${JSON.stringify(requested)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('prerender refuses an option it does not know, with a suggestion (a removed `scripts` option must not be ignored silently)', async () => {
  const { prerender } = await import('../build/prerender.mjs');
  await assert.rejects(prerender({ projectRoot: '.', outDir: 'out', pages: [], scripts: [] }), /prerender: unknown option "scripts"\. Allowed options: projectRoot, outDir, fetchFunction, pages, cacheBust/);
  await assert.rejects(prerender({ projectRoot: '.', outDir: 'out', pages: [], fetchFunctoin: null }), /unknown option "fetchFunctoin"\. Did you mean "fetchFunction"\?/);
});

test('the markup a page document carries is read back exactly as it was written (src/document-markup.js and src/document-markup-reader.js)', async () => {
  const { stateScriptHtml, moduleScriptHtml, stylesheetLinkHtml } = await import('../src/document-markup.js');
  const { readStateScript, removeStateScript, readModuleScript, readStylesheets } = await import('../src/document-markup-reader.js');
  const state = { note: { text: '</script><b> "quoted"' }, count: 3 };
  const text = `<head>${stylesheetLinkHtml('/a.css')}${stylesheetLinkHtml('/b.css')}</head><body>${stateScriptHtml(state)}\n${moduleScriptHtml('/assets/page.js')}</body>`;
  assert.match(text, /<script type="application\/json" id="agent-ui-state">/);
  assert.deepEqual(readStateScript(text), state);
  assert.equal(readModuleScript(text), '/assets/page.js');
  assert.deepEqual(readStylesheets(text), ['/a.css', '/b.css']);
  assert.equal(removeStateScript(text).includes('agent-ui-state'), false);
  assert.deepEqual(readStateScript(removeStateScript(text)), {}, 'a document without the script starts from the page\'s defaults');
  assert.equal(readModuleScript('<html></html>'), null);
});

test('the reader accepts attributes a host transform adds, in any order, so a CSP nonce does not break hydration or soft navigation', async () => {
  const { readStateScript, removeStateScript, readModuleScript, readStylesheets } = await import('../src/document-markup-reader.js');
  const state = { session: { user: 'ada' } };
  const text = `<link href="/a.css" rel="stylesheet"><script nonce="n0nce+/=" type="application/json" id="agent-ui-state">${JSON.stringify(state)}</script>\n<script nonce="n0nce+/=" src="/assets/page.js" type="module"></script>`;
  assert.deepEqual(readStateScript(text), state);
  assert.equal(readModuleScript(text), '/assets/page.js');
  assert.deepEqual(readStylesheets(text), ['/a.css']);
  assert.equal(removeStateScript(text).includes('agent-ui-state'), false);
});
