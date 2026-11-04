// A static site (`agent-ui build --static`): after the site is written, render every page with the server renderer and write the markup
// (and the state it was rendered from) into <url>/index.html (the page "/" into index.html), so a file host serves finished pages with
// no server. The browser entry then mounts over it (src/hydrate.js).
//
//   prerender({ projectRoot, outDir, fetchFunction, pages })
//
// `pages` are the page records loadConfig adds ({ name, path, app }); no configuration lists them (build/pages.mjs).
// A static site names every page: a page with parameters ("/product/:id") is written once for every URL its view.js lists in `paths`
// (build/page-paths.mjs), and one that lists none is an error (assertStaticSite, which `agent-ui build --static` also calls before it builds anything). A file host answers every file with 200, so a page whose
// `status` is not 200 is an error too. A page says when it is ready (`ready`), so the render waits for its data; a page that never becomes ready fails
// the build instead of shipping a loading state. The page's own <name>.html stays the shell that `agent-ui dev` serves.
//
// Data requests are answered by `fetchFunction` of the config: the project decides where a page's data comes from while rendering.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultFetchFunction, destroyApps, renderPage } from '../server/render-page.js';
import { renderDocument } from '../server/document.mjs';
import { didYouMean, fail } from '../src/messages.js';
import { findPathOwnerProblems, urlsOfPage } from './page-paths.mjs';
import { BASE_PATH_ADVICE, isBasePath } from '../src/base-path-checks.js';

const PRERENDER_OPTIONS = ['projectRoot', 'outDir', 'fetchFunction', 'pages', 'cacheBust', 'timeoutMs', 'stateForBrowser', 'basePath'];

// A URL is a plain chain of names: a page's own path comes from folder names (build/pages.mjs), and `paths` are checked to be plain.
const fileForPath = (path) => (path === '/' ? 'index.html' : join(path.slice(1), 'index.html'));

// A static site names every URL. Returns [{ page, module, urls }]. Called by `agent-ui build --static` before anything is built (the
// generated app modules exist once the config is loaded), and again by prerender.
export const assertStaticSite = async (pages, { projectRoot, cacheBust = null }) => {
  const resolved = [];
  const unnamed = [];
  for (const page of pages) {
    const module = await import(`${pathToFileURL(resolve(projectRoot, page.app))}${cacheBust ? `?t=${cacheBust}` : ''}`);
    const urls = await urlsOfPage(page, module);
    if (urls === null) unnamed.push(page);
    else resolved.push({ page, module, urls });
  }
  if (unnamed.length) {
    fail(unnamed.map((page) => `page "${page.path}"`).join(', '), 'has parameters and lists no `paths`, so a static site has no file for it', 'Export the URLs to write from its view.js: export const paths = ["/product/1", "/product/2"] (or an async function that returns them). Or build without --static and serve the site with `agent-ui serve`, or remove the page');
  }
  // Nothing is written yet: a URL that two pages would write is refused before any file exists.
  const [overlap] = findPathOwnerProblems(pages, new Map(resolved.map(({ page, urls }) => [page.path, urls])));
  if (overlap) throw new Error(overlap);
  return resolved;
};

// Renders one URL of a page and writes it to <url>/index.html.
const prerenderUrl = async ({ page, module, url, template, outputDirectory, fetchFunction, timeoutMs, stateForBrowser, basePath }) => {
  const result = await renderPage(module.create, { url, fetchFunction, createShell: module.createShell, dev: false, timeoutMs, stateForBrowser, basePath });
  try {
    if (result.timedOut) throw new Error(`prerender ${url}: waited for data but timed out: the page never became ready (its \`ready(state)\` stayed false; state: ${JSON.stringify(result.state).slice(0, 200)})`);
    const status = result.ui.getStatus?.() ?? 200;
    if (status !== 200) fail(`page "${page.path}"${url === page.path ? '' : ` at ${url}`}`, `answers ${status}, and a file host would serve its file with 200`, 'A static site cannot carry a page whose status is not 200. Build without --static and serve the site with `agent-ui serve`, or remove the page\'s `status`');
    const target = join(outputDirectory, fileForPath(url));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, renderDocument(template, result, { describePage: module.describePage }));
  } finally {
    destroyApps(result.ui, result.shellApp);
  }
  return url;
};

export const prerender = async (options) => {
  for (const key of Object.keys(options)) {
    if (!PRERENDER_OPTIONS.includes(key)) fail('prerender', `unknown option "${key}"`, `${didYouMean(key, PRERENDER_OPTIONS)}Allowed options: ${PRERENDER_OPTIONS.join(', ')}`);
  }
  const { projectRoot, outDir, fetchFunction: configuredFetch = null, pages, cacheBust = null, timeoutMs = 2000, stateForBrowser = null, basePath = '' } = options;
  if (!isBasePath(basePath)) fail('prerender', `basePath ${JSON.stringify(basePath)} is not allowed`, BASE_PATH_ADVICE);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) fail('prerender', `timeoutMs ${JSON.stringify(timeoutMs)} is not allowed`, 'Pass a whole number of milliseconds, 1 or more, for example timeoutMs: 2000');
  if (stateForBrowser !== null && stateForBrowser !== undefined && typeof stateForBrowser !== 'function') fail('prerender', `stateForBrowser is ${typeof stateForBrowser}, not a function`, 'Write stateForBrowser: (state) => ({ ...state }) to choose what a browser may receive, or leave it out');
  const site = await assertStaticSite(pages, { projectRoot, cacheBust });
  const outputDirectory = resolve(projectRoot, outDir);
  const fetchFunction = configuredFetch ?? defaultFetchFunction;
  const written = [];
  for (const { page, module, urls } of site) {
    const template = readFileSync(join(outputDirectory, `${page.name}.html`), 'utf8');
    for (const url of urls) written.push(await prerenderUrl({ page, module, url, template, outputDirectory, fetchFunction, timeoutMs, stateForBrowser, basePath }));
  }
  return written;
};
