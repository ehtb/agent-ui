// The URLs a page is rendered at by `agent-ui check` and `agent-ui build --static`. A page without parameters has one, its own path. A
// page with parameters ("/event/:id") has none of its own: its view.js lists the ones to render,
//
//   export const paths = ['/event/1', '/event/2'];            or   export const paths = async () => (await readEvents()).map(...)
//
// view.js runs only in Node (the server and the build), so a function here may read files or a database and never reaches a browser.
// The same list is what a static build writes and what check renders, so a page that is checked is a page that can be generated.
import { fail } from '../src/messages.js';
import { compileUrlPattern, sortBySpecificity } from '../src/url-pattern.js';

const hasParameters = (path) => /[:*]/.test(path);
// A path a file host can serve as <path>/index.html: plain segments, nothing to decode, no "." or ".." segment.
const PLAIN_PATH = /^(?:\/[A-Za-z0-9._~-]+)+$/;

// [url] for the page, or null for a page with parameters that lists none. `module` is the page's generated app module (its `paths` is
// the export of view.js).
export const urlsOfPage = async (page, module) => {
  const where = page.viewFile ?? page.file ?? `page "${page.path}"`;
  const declared = module.paths;
  if (declared === undefined) return hasParameters(page.path) ? null : [page.path];
  if (!hasParameters(page.path)) fail(where, `exports "paths", but the URL of this page (${page.path}) has no parameters`, 'A page without parameters has one URL, its own: remove `paths`');
  if (typeof declared !== 'function' && !Array.isArray(declared)) fail(where, `"paths" is ${typeof declared}, not a list of URLs or a function that returns one`, "Write export const paths = ['/event/1', '/event/2'], or export const paths = async () => [...]");
  let list;
  try {
    list = typeof declared === 'function' ? await declared() : declared;
  } catch (error) {
    fail(where, `paths() threw: ${error.message}`, 'Fix the function, or list the URLs: export const paths = [...]');
  }
  if (!Array.isArray(list) || list.length === 0) fail(where, `"paths" gave ${Array.isArray(list) ? 'an empty list' : typeof list}, not a list of URLs`, `List at least one URL of ${page.path}, for example "${page.path.replace(/:[A-Za-z0-9]+/g, '1').replace(/\*[A-Za-z0-9]*/g, 'a/b')}"`);
  const matcher = compileUrlPattern(page.path);
  const seen = new Set();
  list.forEach((url, index) => {
    if (typeof url !== 'string' || !PLAIN_PATH.test(url) || /\/\.\.?(?:\/|$)/.test(url)) fail(where, `paths[${index}] ${JSON.stringify(url)} is not a plain path`, 'Write a path of the site that starts with "/", with letters, digits and . _ ~ - in its segments, no query, no trailing slash, no "." or ".." segment, for example "/event/1"');
    if (!matcher.match(url)) fail(where, `paths[${index}] "${url}" is not a URL of ${page.path}`, `List only URLs this page answers, for example "${page.path.replace(/:[A-Za-z0-9]+/g, '1').replace(/\*[A-Za-z0-9]*/g, 'a/b')}"`);
    if (seen.has(url)) fail(where, `paths[${index}] "${url}" is listed twice`, 'List each URL once');
    seen.add(url);
  });
  return list;
};

// A listed URL must be one the server answers with this page: the most specific page whose pattern matches it, as the render server
// chooses. Otherwise two pages would write the same file, or a page would write over another's (a "/:slug" page listing "/about"
// where pages/about/ exists). `pages` are all the pages of the project; `urlsByPage` maps a page's path to its listed URLs. Returns the
// problems, one sentence each. `compiledPages` ([{ page, pattern }], most specific first) is an optional already-compiled list, so a
// caller that also matches links (`agent-ui check`) compiles each page's pattern once instead of once per link and per URL.
export const findPathOwnerProblems = (pages, urlsByPage, compiledPages = null) => {
  const compiled = compiledPages ?? sortBySpecificity(pages.map((page) => ({ page, pattern: compileUrlPattern(page.path) })), (entry) => entry.pattern);
  const ownerOf = (url) => compiled.find((entry) => entry.pattern.match(url))?.page;
  const problems = [];
  for (const page of pages) {
    for (const url of urlsByPage.get(page.path) ?? []) {
      if (url === page.path) continue;
      const owner = ownerOf(url);
      if (owner && owner.path !== page.path) problems.push(`${page.viewFile ?? page.file}: paths lists "${url}", which the server answers with the page "${owner.path}" (${owner.file}), not with "${page.path}". Remove it from paths: each URL is written by the one page that answers it`);
    }
  }
  return problems;
};

