// Build-time content generation. The documentation, cookbook and examples stay in their normal places in the
// repository; this script reads them, turns Markdown into plain agent-ui spec data, writes one generated module, and
// builds the search index. The generated files are inputs of the site, never edited by hand.
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { docs, repository } from '../lib/docs-meta.js';
import { plainInline, renderMarkdown } from '../lib/markdown.js';

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(siteRoot, '..');
const siteUrl = 'https://ehtb.github.io/agent-ui';
// A stand-alone copy of the site (the gh-pages branch) carries the content it needs in site/content. In the framework
// repository the same files are read from their usual places, so there is only one copy of the documentation.
const contentRoot = existsSync(join(siteRoot, 'content')) ? join(siteRoot, 'content') : repositoryRoot;
const generatedDirectory = join(siteRoot, 'generated');
const pagesDirectory = join(siteRoot, 'pages');
const publicDirectory = join(siteRoot, 'public');

const read = (path) => readFile(path, 'utf8');
const writeIfChanged = async (path, text) => {
  try {
    if ((await read(path)) === text) return;
  } catch {
    // The file does not exist yet.
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
};

const languageFor = (path) => {
  switch (extname(path)) {
    case '.js':
    case '.mjs':
      return 'js';
    case '.json':
      return 'json';
    case '.css':
      return 'css';
    case '.html':
    case '.svg':
      return 'html';
    default:
      return 'text';
  }
};

const splitTableRow = (line) => {
  let source = line.trim();
  if (source.startsWith('|')) source = source.slice(1);
  if (source.endsWith('|')) source = source.slice(0, -1);
  const cells = [];
  let current = '';
  let inCode = false;
  for (const character of source) {
    if (character === '`') inCode = !inCode;
    if (character === '|' && !inCode) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }
  cells.push(current.trim());
  return cells;
};

const parseExamples = (markdown) => {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((line) => /^\|\s*Example\s*\|/.test(line));
  if (start === -1) return [];
  const examples = [];
  for (let index = start + 2; index < lines.length && lines[index].startsWith('|'); index++) {
    const cells = splitTableRow(lines[index]);
    const name = plainInline(cells[0]);
    if (!name) continue;
    examples.push({
      name,
      description: plainInline(cells[1] ?? ''),
      link: `${repository}/tree/main/examples/${name}`,
      command: `npm run example -- ${name}`,
    });
  }
  return examples;
};

const buildSearchSections = (doc, markdown, headings) => {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const entries = [];
  let inFence = false;
  let current = null;
  let intro = [];
  let headingIndex = 0;
  let seenFirstHeading = false;

  const finish = () => {
    if (!current) return;
    const text = current.parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 1200);
    if (text) entries.push({ ...current, text });
    current = null;
  };

  for (const line of lines) {
    if (/^\s*(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const heading = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (heading) {
      const level = heading[1].length;
      const text = plainInline(heading[2], doc.source);
      if (!seenFirstHeading) {
        seenFirstHeading = true;
        continue;
      }
      const meta = headings.list[headingIndex];
      if (meta && meta.level === level && meta.text === text) headingIndex++;
      if (level === 2 || level === 3) {
        finish();
        const anchor = meta?.id ?? text.toLowerCase().replace(/[^\p{Letter}\p{Number}\s-]/gu, '').trim().replace(/\s+/g, '-');
        current = { title: text, href: `${doc.path}#${anchor}`, parts: [] };
      }
      continue;
    }
    const plain = plainInline(
      line
        .replace(/^\s*[-*+]\s+/, '')
        .replace(/^\s*\d+[.)]\s+/, '')
        .replace(/^\s*>\s?/, '')
        .replace(/\|/g, ' '),
      doc.source,
    ).trim();
    if (!plain || /^[:\s|-]+$/.test(plain)) continue;
    if (current) current.parts.push(plain);
    else intro.push(plain);
  }
  finish();
  return { intro: intro.join(' ').replace(/\s+/g, ' ').trim().slice(0, 1200), sections: entries };
};

const writeDocPages = async () => {
  const manifestPath = join(generatedDirectory, 'doc-pages.json');
  let previous = [];
  try {
    previous = JSON.parse(await read(manifestPath));
  } catch {
    // First run.
  }
  const generated = docs.filter((doc) => doc.source);
  const names = generated.map((doc) => doc.id);
  for (const name of previous) {
    if (!names.includes(name)) await rm(join(pagesDirectory, 'docs', name), { recursive: true, force: true });
  }
  for (const doc of generated) {
    const folder = join(pagesDirectory, 'docs', doc.id);
    await mkdir(folder, { recursive: true });
    await writeIfChanged(
      join(folder, 'page.js'),
      `// Generated from docs-meta.js by site/scripts/generate.mjs; edit the documentation source, not this file.\nimport { docPage } from '../../../lib/doc-page.js';\n\nexport const page = docPage(${JSON.stringify(doc.id)});\n`,
    );
    await writeIfChanged(
      join(folder, 'view.js'),
      `// Generated from docs-meta.js by site/scripts/generate.mjs; edit the documentation source, not this file.\nimport { docView } from '../../../lib/doc-view.js';\n\nexport const view = docView(${JSON.stringify(doc.id)});\n`,
    );
  }
  await writeIfChanged(manifestPath, JSON.stringify(names));
};

const writeRecipePages = async (recipes) => {
  const manifestPath = join(generatedDirectory, 'recipe-pages.json');
  let previous = [];
  try {
    previous = JSON.parse(await read(manifestPath));
  } catch {
    // First run.
  }
  const names = recipes.map((recipe) => recipe.name);
  for (const name of previous) {
    if (!names.includes(name)) await rm(join(pagesDirectory, 'cookbook', name), { recursive: true, force: true });
  }
  for (const recipe of recipes) {
    const folder = join(pagesDirectory, 'cookbook', recipe.name);
    await mkdir(folder, { recursive: true });
    await writeIfChanged(
      join(folder, 'page.js'),
      `// Generated from cookbook/recipes.mjs by site/scripts/generate.mjs; edit the recipe, not this file.\nimport { recipePage } from '../../../lib/recipe-page.js';\n\nexport const page = recipePage(${JSON.stringify(recipe.name)});\n`,
    );
    await writeIfChanged(
      join(folder, 'view.js'),
      `// Generated from cookbook/recipes.mjs by site/scripts/generate.mjs; edit the recipe, not this file.\nimport { recipeView } from '../../../lib/recipe-view.js';\n\nexport const view = recipeView(${JSON.stringify(recipe.name)});\n`,
    );
  }
  await writeIfChanged(manifestPath, JSON.stringify(names));
};

const main = async () => {
  await mkdir(generatedDirectory, { recursive: true });
  await mkdir(publicDirectory, { recursive: true });

  const frameworkPackage = JSON.parse(await read(join(contentRoot, 'package.json')));
  const documents = {};
  const searchIndex = [];

  for (const doc of docs) {
    if (!doc.source) continue;
    const markdown = await read(join(contentRoot, doc.source));
    const rendered = renderMarkdown(markdown, { sourcePath: doc.source });
    documents[doc.id] = {
      title: doc.title,
      description: doc.description,
      nodes: rendered.nodes,
      headings: rendered.headings.filter((heading) => heading.level <= 3),
      markdownTitle: rendered.title,
      source: doc.source,
    };
    const search = buildSearchSections(doc, markdown, { list: rendered.headings });
    if (search.intro) {
      searchIndex.push({ pageTitle: doc.title, title: doc.title, href: doc.path, text: search.intro });
    }
    for (const section of search.sections) {
      searchIndex.push({ pageTitle: doc.title, ...section });
    }
  }

  await writeIfChanged(join(generatedDirectory, 'docs.js'), `export const documents = ${JSON.stringify(documents)};\n`);
  await writeDocPages();

  const cookbookDirectory = join(contentRoot, 'cookbook');
  const recipesModule = await import(`${pathToFileURL(join(cookbookDirectory, 'recipes.mjs')).href}?v=${Date.now()}`);
  const recipes = [];
  for (const recipe of recipesModule.recipes) {
    const files = [];
    for (const path of recipe.files) {
      let code = '';
      try {
        code = await read(join(cookbookDirectory, path));
      } catch {
        code = `// The file ${path} was not found next to cookbook/recipes.mjs.`;
      }
      files.push({ path, language: languageFor(path), code });
    }
    recipes.push({ name: recipe.name, title: recipe.title, use: recipe.use, files });
  }

  await writeIfChanged(join(generatedDirectory, 'cookbook.js'), `export const recipes = ${JSON.stringify(recipes)};\n`);
  await writeIfChanged(
    join(generatedDirectory, 'cookbook-meta.js'),
    `export const recipeMeta = ${JSON.stringify(recipes.map(({ name, title }) => ({ name, title })))};\nexport const recipeTitles = ${JSON.stringify(Object.fromEntries(recipes.map((recipe) => [recipe.name, recipe.title])))};\n`,
  );
  await writeRecipePages(recipes);

  const examplesMarkdown = await read(join(contentRoot, 'examples/README.md'));
  const examples = parseExamples(examplesMarkdown);
  await writeIfChanged(join(generatedDirectory, 'examples.js'), `export const examples = ${JSON.stringify(examples)};\n`);

  searchIndex.push(
    {
      pageTitle: 'Start here',
      title: 'Install',
      href: '/docs#install',
      text: 'Install @ehtb/agent-ui, add the agent-ui scripts, create build.config.mjs and write pages/page.js and pages/view.js.',
    },
    {
      pageTitle: 'Start here',
      title: 'First page',
      href: '/docs#first-page',
      text: 'A page is a URL and a folder with page.js for behavior and view.js for content. State lives in namespaces and every write is a named action.',
    },
    {
      pageTitle: 'Start here',
      title: 'Commands',
      href: '/docs#commands',
      text: 'agent-ui build, build --static, dev, serve, check, explain, schema and init.',
    },
    {
      pageTitle: 'Examples',
      title: 'Examples',
      href: '/examples',
      text: examples.map((example) => `${example.name}: ${example.description}`).join(' ').slice(0, 1200),
    },
    {
      pageTitle: 'Cookbook',
      title: 'Cookbook',
      href: '/cookbook',
      text: recipes.map((recipe) => `${recipe.title} ${recipe.use}`).join(' ').slice(0, 1200),
    },
  );
  for (const recipe of recipes) {
    searchIndex.push({
      pageTitle: 'Cookbook',
      title: recipe.title,
      href: `/cookbook/${recipe.name}`,
      text: `${recipe.use} Files: ${recipe.files.map((file) => file.path).join(', ')}`,
    });
  }

  await writeIfChanged(join(publicDirectory, 'search.json'), JSON.stringify(searchIndex));

  const pagePaths = [
    '/',
    ...docs.map((doc) => doc.path),
    '/cookbook',
    ...recipes.map((recipe) => `/cookbook/${recipe.name}`),
    '/examples',
  ];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pagePaths.map((path) => `  <url><loc>${siteUrl}${path === '/' ? '/' : `${path}/`}</loc></url>`).join('\n')}
</urlset>
`;
  await writeIfChanged(join(publicDirectory, 'sitemap.xml'), sitemap);

  await writeIfChanged(
    join(generatedDirectory, 'site-meta.js'),
    `export const siteMeta = ${JSON.stringify({
      version: frameworkPackage.version,
      docs: docs.length,
      recipes: recipes.length,
      examples: examples.length,
      repository,
    })};\n`,
  );

  const generated = relative(siteRoot, generatedDirectory);
  console.log(
    `generated ${Object.keys(documents).length} documents, ${recipes.length} recipes, ${examples.length} examples and ${searchIndex.length} search entries in ${generated}/`,
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
