// Writes the tree of the gh-pages branch: the built site at the root, which GitHub Pages serves, and a stand-alone copy
// of the project under source/ that rebuilds the same site from the published package.
//
//   node scripts/export.mjs ../../agent-ui-gh-pages     (after `npm run build`)
//
// The target must be an empty folder or a checkout (a worktree) of the gh-pages branch: everything except .git is
// replaced, so run it in a worktree, never in a folder that holds something you want to keep.
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { docs } from '../lib/docs-meta.js';

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(siteRoot, '..');
const distributionDirectory = join(siteRoot, 'dist');
const target = resolve(process.argv[2] ?? '');
const targetSource = join(target, 'source');
const targetProject = join(targetSource, 'site');

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

if (!process.argv[2]) fail('usage: node scripts/export.mjs <folder of the gh-pages checkout>');
if (!existsSync(join(distributionDirectory, 'index.html'))) {
  fail('dist/index.html is missing. Run `npm run build` first.');
}

const read = (path) => readFile(path, 'utf8');
const manifest = JSON.parse(await read(join(siteRoot, 'package.json')));
const frameworkManifest = JSON.parse(await read(join(repositoryRoot, 'package.json')));
const recipesModule = await import(pathToFileURL(join(repositoryRoot, 'cookbook/recipes.mjs')).href);
const recipes = recipesModule.recipes;

// 1. Clear the target, keeping the checkout's own .git.
await mkdir(target, { recursive: true });
for (const entry of await readdir(target)) {
  if (entry === '.git') continue;
  await rm(join(target, entry), { recursive: true, force: true });
}

// 2. The built site, at the root of the branch.
await cp(distributionDirectory, target, { recursive: true });
// The static build also leaves the JavaScript shell of every page beside its rendered file (`docs-api.html` next to
// `docs/api/index.html`). The shell exists for `agent-ui dev`; on a file host it is a second copy of the same page, so
// the branch keeps only the rendered URL, the root index and the 404 page.
for (const entry of await readdir(distributionDirectory)) {
  if (entry === 'index.html' || entry === '404.html' || !entry.endsWith('.html')) continue;
  await rm(join(target, entry), { force: true });
}

// 3. The project, without what the build writes.
const generatedPages = new Set([
  ...docs.filter((doc) => doc.source).map((doc) => `docs/${doc.id}`),
  ...recipes.map((recipe) => `cookbook/${recipe.name}`),
]);
const copyProject = async (from, to) => {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    if (['dist', 'generated', 'node_modules', '.agent-ui'].includes(entry.name)) continue;
    if (entry.name === 'package-lock.json') continue;
    if (entry.name === 'search.json' || entry.name === 'sitemap.xml') continue;
    const source = join(from, entry.name);
    const destination = join(to, entry.name);
    if (entry.isDirectory()) {
      await copyProject(source, destination);
      continue;
    }
    await cp(source, destination);
  }
};
await copyProject(siteRoot, targetProject);
for (const page of generatedPages) {
  await rm(join(targetProject, 'pages', page), { recursive: true, force: true });
}
await rm(join(targetProject, 'public/search.json'), { force: true });
await rm(join(targetProject, 'public/sitemap.xml'), { force: true });

// 4. The content the generator reads, so the copy does not need the framework repository next to it.
const content = join(targetProject, 'content');
const copyContent = async (path) => {
  const destination = join(content, path);
  await mkdir(dirname(destination), { recursive: true });
  await cp(join(repositoryRoot, path), destination);
};
for (const path of ['README.md', 'CHANGELOG.md', 'examples/README.md', 'cookbook/recipes.mjs']) {
  await copyContent(path);
}
for (const doc of docs) {
  if (doc.source) await copyContent(doc.source);
}
for (const recipe of recipes) {
  for (const path of recipe.files) await copyContent(`cookbook/${path}`);
}
// The generator reads the framework version from the content's package.json (see scripts/generate.mjs).
await writeFile(
  join(content, 'package.json'),
  `${JSON.stringify({ name: frameworkManifest.name, version: frameworkManifest.version }, null, 2)}\n`,
);

// 5. The copy installs the published package instead of the one next to it.
const publishedManifest = {
  ...manifest,
  dependencies: { [frameworkManifest.name]: `^${frameworkManifest.version}` },
};
await writeFile(join(targetProject, 'package.json'), `${JSON.stringify(publishedManifest, null, 2)}\n`);

await writeFile(
  join(targetSource, 'README.md'),
  `# agent-ui documentation site

The site at the root of this branch is the documentation of agent-ui, built with agent-ui itself and exported as static
files. GitHub Pages serves it at https://ehtb.github.io/agent-ui/ from the root of the \`gh-pages\` branch.

\`site/\` is a complete project that builds the same site. It installs the published package, so it needs nothing else
from the repository:

\`\`\`bash
cd site
npm install
npm run build      # writes site/dist: one HTML file per URL, plus the assets
\`\`\`

\`npm run check\` renders every page and reports spec, link and data problems; \`npm run dev\` serves it with hot reload.

## What is where

- \`site/content/\` holds the copies of README.md, CHANGELOG.md, docs/*.md, examples/README.md and the cookbook that the
  site publishes. Edit the documentation in the main repository and copy the files here; the copies are an input of the
  build and are never edited on this branch.
- \`site/scripts/generate.mjs\` turns the Markdown into page spec data and writes the search index and the sitemap.
  \`site/pages/docs/*\` and \`site/pages/cookbook/*\` are generated by it; the rest of \`site/pages\` is written by hand.
- \`site/build.config.mjs\` sets the base path to \`/agent-ui\`, which is the project page's URL, and turns on static
  rendering.

The branch is written by \`site/scripts/export.mjs\` in the main repository; do not edit the files at the root of this
branch by hand.
`,
);

const pages = (await readdir(distributionDirectory, { recursive: true })).filter((path) => path.endsWith('index.html'));
console.log(`wrote the site (${pages.length} pages) and its source to ${target}`);
