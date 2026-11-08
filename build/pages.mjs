// Pages by folder: the one way to say which URLs exist. A folder below `pages/` that holds a page.js is a page, and the
// folder's path is its URL, so nothing else is configured and nothing can disagree with the path:
//
//   pages/page.js                  "/"
//   pages/about/page.js            "/about"
//   pages/product/[id]/page.js     "/product/:id"       (a parameter is [name]: ':' is not allowed in file names everywhere)
//   pages/docs/[...path]/page.js   "/docs/*path"        (the rest of the path is [...name], last segment only)
//
// Optional next to page.js: page.css (this page's styles, imported by its generated style module). Optional at the top:
// pages/style.css (styles of every page). Both may @import shared CSS; the build follows the graph and the existing chunk
// plan links a file imported by a subset of pages only to those pages (build/css-graph.mjs). Anything else in the folder
// (api.js, components/, ...) is the project's own.
//
// For every page the build writes generated modules into `.agent-ui/<name>/` (the name is the path with "/" replaced by "-",
// parameter marks removed; "index" for "/"):
//   main.js   the browser entry: registers the page and, when it is the first in the document, starts it from the state the server
//             embedded (src/pages.js, startPage)
//   app.js    the module the server and `agent-ui check` import: the page's create(), createShell() and describePage()
// and, for the pages that have a shell (src/shell.js), once per shell:
//   shells/<name>.js   the shell's finished content as data, imported by the entries of the pages that use it, so it lands in a chunk they share
// and, for every file in the CSS import graph:
//   styles/<name>.js   a browser-only module that imports its @imports and then its CSS, imported by the entries that need it
// The directory holds only what the last load generated, ignores itself (.gitignore) and is output, never edited. A file is
// written again only when its text changed, so a second load leaves it untouched.
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fail } from '../src/messages.js';
import { packageName } from './package-name.mjs';
import { compileUrlPattern, sortBySpecificity } from '../src/url-pattern.js';
import { validate } from '../src/validate.js';
import { writeStyleModules } from './css-graph.mjs';
import { importPath } from './import-path.mjs';
import { writeFileIfChanged } from './write-file.mjs';

export const PAGES_DIRECTORY = 'pages';
export const GENERATED_DIRECTORY = '.agent-ui';
const LITERAL_SEGMENT = /^[A-Za-z0-9._~-]+$/;

// The URL pattern of one folder, relative to pages/: "product/[id]" -> "/product/:id".
const patternOfFolder = (folder, shown) => {
  const segments = folder === '' ? [] : folder.split('/');
  const parts = segments.map((segment, index) => {
    const rest = /^\[\.\.\.([A-Za-z][A-Za-z0-9]*)\]$/.exec(segment);
    if (rest) {
      if (index !== segments.length - 1) fail(shown, `"${segment}" must be the last folder of the path`, 'Move the catch-all folder to the end of the path: a page below a catch-all is never reached');
      return `*${rest[1]}`;
    }
    const parameter = /^\[([A-Za-z][A-Za-z0-9]*)\]$/.exec(segment);
    if (parameter) return `:${parameter[1]}`;
    if (!LITERAL_SEGMENT.test(segment)) fail(shown, `the folder name "${segment}" cannot be part of a URL`, 'Use letters, digits and . _ ~ - for a fixed segment, [name] for one parameter segment, and [...name] for the rest of the path');
    return segment;
  });
  return `/${parts.join('/')}`;
};

// A page's file name in the output and its folder in .agent-ui: "/" -> "index", "/event/:id" -> "event-id".
const nameOfPattern = (pattern) => pattern.slice(1).replace(/\//g, '-').replace(/[:*]/g, '') || 'index';

const findPageFolders = (directory, prefix = '') =>
  readdirSync(directory, { withFileTypes: true })
    .sort((first, second) => first.name.localeCompare(second.name))
    .flatMap((item) => {
      if (item.isDirectory()) return findPageFolders(join(directory, item.name), prefix ? `${prefix}/${item.name}` : item.name);
      return item.name === 'page.js' ? [prefix] : [];
    });

// The pages of a project: [{ name, path, folder, file, viewFile, stylesheet }] ordered from the most specific URL to the least, so a
// literal beats a parameter beats a catch-all wherever a list is searched in order. Throws when the folders cannot be
// pages, naming both sides of a clash.
export const discoverPages = (projectRoot, directory = PAGES_DIRECTORY) => {
  const pagesDirectory = resolve(projectRoot, directory);
  if (!existsSync(pagesDirectory)) fail(directory, 'there is no pages directory', `Create ${directory}/page.js and ${directory}/view.js (the page at "/") and a folder with both files for every other URL, for example ${directory}/about/page.js and ${directory}/about/view.js`);
  const found = findPageFolders(pagesDirectory).map((folder) => {
    const shown = `${directory}/${folder ? `${folder}/` : ''}page.js`;
    const base = `${directory}/${folder ? `${folder}/` : ''}`;
    const path = patternOfFolder(folder, shown);
    compileUrlPattern(path);
    if (!existsSync(join(pagesDirectory, folder, 'view.js'))) fail(shown, 'there is no view.js next to it', `Create ${base}view.js and export the page's content: \`export const view = section({ ... })\``);
    return { name: nameOfPattern(path), path, folder, file: shown, viewFile: `${base}view.js`, stylesheet: existsSync(join(pagesDirectory, folder, 'page.css')) ? `${base}page.css` : null };
  });
  if (!found.length) fail(directory, 'it holds no page.js', `Add ${directory}/page.js and ${directory}/view.js (the page at "/"), or a folder ${directory}/<url>/ with both`);
  const shapes = new Map();
  const names = new Map();
  for (const page of found) {
    const shape = compileUrlPattern(page.path).shape;
    if (shapes.has(shape)) fail(page.file, `its URL "${page.path}" matches the same URLs as "${shapes.get(shape).path}" (${shapes.get(shape).file})`, 'Two pages cannot have the same URL pattern; rename a parameter folder to the same name and merge the pages, or give one of them a fixed segment');
    shapes.set(shape, page);
    if (names.has(page.name)) fail(page.file, `its generated name "${page.name}" is also the name of ${names.get(page.name).file}`, 'Rename a folder so that the URLs differ by more than "/" against "-"');
    names.set(page.name, page);
  }
  return sortBySpecificity(found, (page) => compileUrlPattern(page.path));
};

// The text of a browser entry: the page's style module (and global styles), the page itself, and the call that registers
// (and, first in the document, starts) it.
const entryText = (page, imports, call, { globalStylesheet, pageStyle, toProject }) =>
  [
    `// Generated for ${page.file}: the browser entry of the page at "${page.path}". Do not edit; it is rewritten on every build.`,
    ...(globalStylesheet ? [`import '../global.js';`] : []),
    ...(pageStyle ? [`import '${toProject(pageStyle)}';`] : []),
    ...imports,
    `import { page } from '${toProject(page.file)}';`,
    '',
    call,
    '',
  ].join('\n');

// Writes .agent-ui/ and returns the entries for the bundler and the page records for the static build, check and the server.
//
// The browser entry must not import the view: view.js is the code that builds the spec (builders, components, the
// layout), and keeping it out of the browser bundle is the point of the split. In development the entry imports view.js
// and builds the spec itself, because `agent-ui dev` renders nothing ahead and a page module imported in Node would go stale
// between rebuilds. A production build evaluates each page once in Node and writes the finished spec as data (spec.js),
// which is what the browser entry imports instead.

// Removes what a previous load wrote and this one did not: the folder of a page that is gone, a shell no page uses, the files of a
// production build when a command regenerated them for development. Directories left empty go with it.
const pruneGenerated = (directory, keep) => {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) {
      pruneGenerated(path, keep);
      if (!readdirSync(path).length) rmSync(path, { recursive: true, force: true });
    } else if (!keep.has(resolve(path))) {
      rmSync(path, { force: true });
    }
  }
};

const generatedPage = (page) => ({ name: page.name, path: page.path, app: `${GENERATED_DIRECTORY}/${page.name}/app.js`, file: page.file, viewFile: page.viewFile });

let writes = 0; // makes two writes in one millisecond differ
export const writeGeneratedModules = async (projectRoot, pages, { dev = false, directory = PAGES_DIRECTORY, basePath = '' } = {}) => {
  const generated = resolve(projectRoot, GENERATED_DIRECTORY);
  // Node keeps an imported module for the life of the process. The server module, and the page and view it imports, carry a
  // stamp of this write, so a second build in one process (a test, a script) evaluates an edited page.js or view.js again. What those
  // two import in turn stays cached: for a change deeper down, start a new process (every `agent-ui` command is one).
  const stamp = `${Date.now()}-${++writes}`;
  mkdirSync(generated, { recursive: true });
  const written = new Set(); // every file of this load, so the ones a previous load left can be removed
  const writeGenerated = (path, text) => {
    written.add(resolve(path));
    writeFileIfChanged(path, text);
  };
  writeGenerated(join(generated, '.gitignore'), '*\n');
  // The styles of every page live in a module of their own that every entry imports, so the build puts them in one shared
  // chunk (one CSS file, downloaded once) instead of copying them into every page's stylesheet.
  const globalStylesheet = existsSync(resolve(projectRoot, directory, 'style.css')) ? `${directory}/style.css` : null;
  // page.css and pages/style.css may @import shared CSS. Each file becomes a browser-only style module, so a stylesheet
  // imported by pages A and B lands in a chunk only those two pages load; page.js and view.js never import CSS.
  const styleEntries = [
    ...(globalStylesheet ? [{ path: globalStylesheet }] : []),
    ...pages.filter((page) => page.stylesheet).map((page) => ({ path: page.stylesheet })),
  ];
  const globalModule = join(generated, 'global.js');
  const { wrapperOf, cssOverrides, sources: styleSources } = writeStyleModules({
    projectRoot,
    generatedDirectory: generated,
    entries: styleEntries,
    globalModule: globalStylesheet ? globalModule : null,
    globalStylePath: globalStylesheet,
  });
  for (const wrapper of wrapperOf.values()) written.add(resolve(wrapper)); // written by writeStyleModules, which leaves unchanged text alone
  if (globalStylesheet) writeGenerated(globalModule, `// Generated: the styles of every page (${globalStylesheet}). Do not edit.\nimport '${importPath(globalModule, wrapperOf.get(globalStylesheet))}';\n`);
  // The entry's last argument: the URL of the entry's own file, which a soft navigation finds in the HTML of the next page.
  // A site below a base path (src/base-path.js) writes it down here, as it writes `dev`: the browser cannot tell it from the address.
  const startCall = (page, content) => `startPage(page, { path: '${page.path}', ${content}, url: import.meta.url, dev: ${dev}${basePath ? `, basePath: '${basePath}'` : ''} });`;
  for (const page of pages) {
    const folder = join(generated, page.name);
    mkdirSync(folder, { recursive: true });
    const toProject = (file) => importPath(join(folder, 'main.js'), resolve(projectRoot, file));
    const pageStyle = page.stylesheet ? wrapperOf.get(page.stylesheet) : null;
    // The browser entry comes from entryText: a development entry builds the spec from view.js in the browser; a production entry
    // (written after the page was evaluated, below) imports the finished spec and the shell's content as data.
    if (dev) {
      writeGenerated(
        join(folder, 'main.js'),
        entryText(page, [`import * as view from '${toProject(page.viewFile)}';`, `import { contentOf, startPage } from '${packageName}/pages';`], startCall(page, `...contentOf(view, '${page.viewFile}')`), { globalStylesheet, pageStyle, toProject }),
      );
    }
    writeGenerated(
      join(folder, 'app.js'),
      [
        `// Generated for ${page.file}: what the server and \`agent-ui check\` import. Do not edit; it is rewritten on every build.`,
        `import { contentOf, definePage } from '${packageName}/pages';`,
        `import { page } from '${toProject(page.file)}?t=${stamp}';`,
        `import * as view from '${toProject(page.viewFile)}?t=${stamp}';`,
        '',
        `const definition = definePage(page, { path: '${page.path}', ...contentOf(view, '${page.viewFile}') });`,
        'export const { create, createShell, describePage, namespaces, shellContent, shellName, shellNamespaces, spec } = definition;',
        '// The URLs check and a static build render a page with parameters at (build/page-paths.mjs); undefined when view.js lists none.',
        'export const paths = view.paths;',
        '',
      ].join('\n'),
    );
  }
  if (!dev) {
    const shells = new Map(); // shell name -> { text, page } of the page that gave its content
    for (const page of pages) {
      const appFile = join(generated, page.name, 'app.js');
      let module;
      try {
        module = await import(`${pathToFileURL(appFile).href}?t=${stamp}`);
      } catch (error) {
        fail(page.file, `the page could not be loaded to build its spec: ${error.message}`, 'Fix the error in page.js or view.js; a production build evaluates the page once in Node to ship its finished spec as data');
      }
      // The spec is generated data: check it here, once, where the message names the page (a production browser bundle
      // does not carry the validator).
      const problems = validate(module.spec, { namespaces: module.namespaces });
      if (problems.length) fail(page.file, `the finished spec is not valid:\n  ${problems.join('\n  ')}`, 'Fix view.js, its layout or its pending view; a production build checks the spec it ships as data');
      writeGenerated(
        join(generated, page.name, 'spec.js'),
        [
          `// Generated for ${page.file}: the page's finished spec (view + layout), as data.`,
          '// Do not edit; it is rewritten on every build.',
          `export const spec = ${JSON.stringify(module.spec)};`,
          '',
        ].join('\n'),
      );
      // The shell's content is data too: checked against the shell's namespaces, once for each page that gives it (a duplicate id, a handler
      // for an action the shell lacks, a missing label).
      const shellProblems = module.shellContent ? validate(module.shellContent.view, { namespaces: module.shellNamespaces }) : [];
      if (shellProblems.length) fail(page.file, `the content of the shell "${module.shellName}" is not valid:\n  ${shellProblems.join('\n  ')}`, `Fix the shell's content (the view of "${module.shellName}"); a production build checks what it ships as data`);
      // A shell's content is written once, whatever number of pages use it; two pages that give one name different content are a mistake.
      if (module.shellContent) {
        const text = JSON.stringify(module.shellContent);
        const earlier = shells.get(module.shellName);
        if (earlier && earlier.text !== text) fail(page.file, `the content of the shell "${module.shellName}" differs from the one ${earlier.page.file} gives it`, 'Every page of a shell imports the same content from one module; a different header needs a different shell name');
        if (!earlier) {
          shells.set(module.shellName, { text, page });
          mkdirSync(join(generated, 'shells'), { recursive: true });
          writeGenerated(join(generated, 'shells', `${module.shellName}.js`), [`// Generated for the shell "${module.shellName}" (${page.file}): its finished content, as data.`, '// Do not edit; it is rewritten on every build.', `export const shell = ${text};`, ''].join('\n'));
        }
      }
      const toProject = (file) => importPath(join(generated, page.name, 'main.js'), resolve(projectRoot, file));
      const pageStyle = page.stylesheet ? wrapperOf.get(page.stylesheet) : null;
      const shellFile = module.shellContent ? importPath(join(generated, page.name, 'main.js'), join(generated, 'shells', `${module.shellName}.js`)) : null;
      writeGenerated(
        join(generated, page.name, 'main.js'),
        entryText(
          page,
          [`import { spec } from './spec.js';`, ...(module.shellContent ? [`import { shell } from '${shellFile}';`] : []), `import { startPage } from '${packageName}/pages';`],
          startCall(page, `spec${module.shellContent ? ', shell' : ''}`),
          { globalStylesheet, pageStyle, toProject },
        ),
      );
    }
  }
  pruneGenerated(generated, written);
  return {
    entries: pages.map((page) => ({ name: page.name, path: `${GENERATED_DIRECTORY}/${page.name}/main.js` })),
    pages: pages.map(generatedPage),
    cssOverrides,
    styleSources,
  };
};

// What loadConfig adds to a project's configuration: the pages found in the folders, and their generated modules.
export const expandPages = async (config, projectRoot, options = {}) => {
  const pages = discoverPages(projectRoot);
  // A deployed server runs what `agent-ui build` generated, from code it may not be able to write.
  if (options.readOnly) return { ...config, pages: pages.map(generatedPage) };
  return { ...config, ...(await writeGeneratedModules(projectRoot, pages, { ...options, basePath: config.basePath ?? '' })) };
};
