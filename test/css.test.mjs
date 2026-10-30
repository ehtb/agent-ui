// CSS imports from page.css and pages/style.css: the build follows the graph, emits shared styles for the pages that
// import the same file, strips @import from the output, and keeps global CSS before shared CSS before page.css.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { copyFixture } from './copy-fixture.mjs';
import { loadConfig } from '../build/config.mjs';
import { build } from '../build/build.mjs';
import { readCssImports } from '../build/css-graph.mjs';

const configFor = (root, mode = {}) => loadConfig({ root, file: 'build.config.mjs', mode, fresh: true });
const buildSite = async (root, outDir = '.output-css', mode = {}) => {
  const config = await configFor(root, mode);
  return { config, manifest: build({ ...config, projectRoot: root, outDir }) };
};
const chunkWithSource = (manifest, source) => Object.values(manifest.chunks).find((chunk) => chunk.stylesheetSources?.includes(source));
const cssOf = (root, chunk, outDir = '.output-css') => readFileSync(join(root, outDir, chunk.stylesheet.slice(1)), 'utf8');

test('CSS imports: a file imported by two pages is one shared stylesheet, and page CSS stays with its page', async () => {
  const project = copyFixture('css-site');
  try {
    const { manifest } = await buildSite(project.root);
    const global = chunkWithSource(manifest, 'shared/global.css');
    const shared = chunkWithSource(manifest, 'shared/shared.css');
    const home = chunkWithSource(manifest, 'shared/home.css');
    const other = chunkWithSource(manifest, 'shared/other.css');
    assert.ok(global && shared && home && other, 'every source stylesheet has a chunk');
    assert.equal(shared.stylesheetSources.includes('shared/home.css'), false, 'the shared CSS does not absorb a page file');

    assert.deepEqual(manifest.pages.index.stylesheets, [global.stylesheet, shared.stylesheet, home.stylesheet], 'global, shared, then page CSS');
    assert.deepEqual(manifest.pages.about.stylesheets, [global.stylesheet, shared.stylesheet, manifest.chunks.about.stylesheet], 'about imports the shared CSS, then its own page.css');
    assert.deepEqual(manifest.pages.other.stylesheets, [global.stylesheet, other.stylesheet]);
    assert.deepEqual(manifest.pages['shared-only'].stylesheets, [global.stylesheet, shared.stylesheet], 'a page.css with only imports links the shared file and no empty page CSS');
    assert.ok(!manifest.pages.other.chunksLoadedAtStartup.includes(Object.keys(manifest.chunks).find((name) => manifest.chunks[name] === shared)), 'other must not download the stylesheet shared by home and about');
    assert.ok(manifest.pages.index.stylesheetsSize.bytes > manifest.pages.other.stylesheetsSize.bytes, 'the manifest reports the CSS bytes each page loads');

    const sharedCss = cssOf(project.root, shared);
    assert.ok(shared.stylesheetSources.includes('shared/base.css'), 'a nested @import is part of the shared chunk');
    assert.ok(sharedCss.indexOf('.shared-base') < sharedCss.indexOf('.shared{'), 'a nested import comes before the file that imports it');
    assert.match(sharedCss, /\.shared\{border/);
    assert.doesNotMatch(sharedCss, /#home|#about|#other|@import/, 'the shared file holds only its own rules and no browser @import');
    const homeCss = cssOf(project.root, home);
    assert.match(homeCss, /\.home-only/);
    assert.match(homeCss, /#home/);
    assert.ok(homeCss.indexOf('.home-only') < homeCss.indexOf('#home'), 'an imported file comes before the importing page.css');
    assert.doesNotMatch(homeCss, /@import/);
    assert.match(cssOf(project.root, global), /--brand: navy/);
    assert.ok(manifest.sources.files.includes('shared/shared.css') && manifest.sources.files.includes('shared/global.css'), 'imported CSS is part of the build stamp and the dev watch list');
    assert.doesNotMatch(cssOf(project.root, other), /\.shared\{|\.home-only|#home/);
  } finally {
    project.cleanup();
  }
});

test('CSS imports work the same in a development build', async () => {
  const project = copyFixture('css-site');
  try {
    const { manifest } = await buildSite(project.root, '.output-css-dev', { dev: true });
    const global = chunkWithSource(manifest, 'shared/global.css');
    const shared = chunkWithSource(manifest, 'shared/shared.css');
    const home = chunkWithSource(manifest, 'shared/home.css');
    assert.deepEqual(manifest.pages.index.stylesheets, [global.stylesheet, shared.stylesheet, home.stylesheet]);
    assert.ok(!manifest.pages.other.chunksLoadedAtStartup.includes(Object.keys(manifest.chunks).find((name) => manifest.chunks[name] === shared)));
  } finally {
    project.cleanup();
  }
});

test('CSS @import is read only at the top and only as a relative .css path; comments and strings are skipped', () => {
  const parsed = readCssImports('pages/page.css', [
    '/* @import "../not-an-import.css"; */',
    '@import "../shared/a.css";',
    '/* between imports */',
    "@import '../shared/b.css';",
    'body { content: "@import \\"not-this\\""; }',
  ].join('\n'));
  assert.deepEqual(parsed.imports.map((statement) => statement.specifier), ['../shared/a.css', '../shared/b.css']);
  assert.doesNotMatch(parsed.css, /^@import/m);
  assert.match(parsed.css, /content: "@import/);

  assert.throws(() => readCssImports('pages/page.css', 'body {}\n@import "../shared/a.css";'), /an @import is after other CSS/);
  assert.throws(
    () => readCssImports('pages/page.css', '@import url("../shared/a.css");'),
    (error) => error.message === 'pages/page.css:1: the @import has no quoted path. Write @import "./file.css"; with a path relative to this CSS file',
  );
  assert.throws(() => readCssImports('pages/page.css', '@import "../shared/a.css" screen;'), /does not end with a semicolon/);
  assert.throws(() => readCssImports('pages/page.css', '@import "./a\\\n.css";'), /a CSS string cannot span lines/);
});

test('CSS import mistakes name the CSS file, the line and the fix', async () => {
  const project = copyFixture('css-site');
  try {
    project.write('pages/about/page.css', '@import "../../shared/missing.css";\n#about { color: blue; }\n');
    await assert.rejects(configFor(project.root), /pages\/about\/page\.css:1: the @import "\.\.\/\.\.\/shared\/missing\.css" points to "shared\/missing\.css", which does not exist/);

    project.write('pages/about/page.css', '@import "../../shared/cycle-a.css";\n');
    project.write('shared/cycle-a.css', '@import "./cycle-b.css";\n.a { color: red; }\n');
    project.write('shared/cycle-b.css', '@import "./cycle-a.css";\n.b { color: blue; }\n');
    await assert.rejects(configFor(project.root), /shared\/cycle-a\.css: the CSS imports form a cycle: shared\/cycle-a\.css -> shared\/cycle-b\.css -> shared\/cycle-a\.css/);
  } finally {
    project.cleanup();
  }
});
