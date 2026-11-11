// Checks a project without building it: renders every page in development mode (so the spec validator is on) and reports
// everything an agent would otherwise find out in a browser.
//   agent-ui check [--config=<file>]       project root = current directory; exit code 1 when anything is wrong
//
// For every page below pages/ it renders the page at its path, or a page with parameters at each URL its view.js lists in `paths`, then checks: the app mounts (spec problems
// are reported with their path), no action or resource raised an error (`ui.errors`), data requests were answered, the page has a
// title, and its `status(state)` answers a valid HTTP value. It also checks every link in a page's spec and in its shell's: a literal `href` that starts with "/" must be the URL of a page,
// a file in publicDir, or an API path, and a `soft` link must lead to a page that has the same shell (a soft link replaces the page
// inside the shell, so a page without it could not be shown), and a `soft` link on a page without a shell is reported, because nothing
// handles it. A page with parameters that lists no `paths` has no URL to render: it is listed as a note, its finished spec and shell
// content are still validated as a build does, and it is mounted at a sample URL to find what only a mount finds.
//
// It also reads every module the pages' entries reach the way the bundler does (build/module-graph.mjs), because the bundler's
// rules for the source are found while a build reads the files, not when Node imports them: a re-export or `export *`, a default
// import or export in the project's own files, an import that does not resolve and an import cycle are reported with the file and
// line, as `agent-ui build` and `agent-ui dev` would refuse them.
//
// Every page it renders is also compared with the page a browser would make from the state the document carries (cli/hydration-check.mjs): a
// browser takes over the server's markup, and where it differs (a state key left out of the document, a derived value that depends on the
// time, random numbers, the time zone or the locale) it makes those nodes again. Markup that a browser's HTML parser rewrites (a `tr` in a
// `table`, a `div` in a `p`) is found by the validator when the spec is read, so it is reported here as a spec problem.
//
// Every page it renders is measured, and the numbers are printed so an agent has a sense of what a page costs: the elements it renders
// (page and shell), the rows of its largest list (the framework renders every row: there is no virtualization), and the bytes of
// the state the document carries. `budgets` of the config (stateBytes, elements, listRows) turn a page over a limit into a problem.
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../build/config.mjs';
import { buildModuleGraph } from '../build/module-graph.mjs';
import { defaultFetchFunction, destroyApps, renderPage } from '../server/render-page.js';
import { createApiFor } from '../server/ssr-handler.mjs';
import { findHydrationProblems } from './hydration-check.mjs';
import { didYouMean } from '../src/messages.js';
import { compileUrlPattern, sortBySpecificity, withoutTrailingSlash } from '../src/url-pattern.js';
import { toArray } from '../src/spec-core.js';
import { validate } from '../src/validate.js';
import { mentionsAgentUi } from './agent-instructions.mjs';
import { findPathOwnerProblems, urlsOfPage } from '../build/page-paths.mjs';
import { parseOrExit } from './arguments.mjs';
import { isMain } from './is-main.mjs';

// Renders this many URLs at a time: pages wait on their own data, not on each other, so the wall clock is the slowest batch
// instead of the sum. It stays a small bound, so a site with hundreds of URLs does not open them all at once.
const CHECK_CONCURRENCY = 8;

// A message about a link lists the pages it might have meant. A site can have a thousand pages, and one broken link should not
// turn the report into a page of paths.
const MAX_LISTED_PAGES = 10;
const listPages = (paths) =>
  paths.length <= MAX_LISTED_PAGES ? paths.join(', ') : `${paths.slice(0, MAX_LISTED_PAGES).join(', ')}, and ${paths.length - MAX_LISTED_PAGES} more`;

// Every link of a spec: [{ href, soft }] for the `href` of an element (soft: it has `soft: true`) and the literal `href` of an
// `act('route.go', { href })` handler. The href is a string with a placeholder where a binding stands: 'x' for a state, item or other
// value, so "/product/" + item.id is checked as "/product/x". A fully dynamic href (a bare binding) is not checked.
// What a rendered page costs, from its outline (src/ui.js): the number of elements, and the largest list (the most siblings that are
// rows of one each, which carry a key) with the id of the element that holds it.
export const measureOutline = (outline) => {
  let elements = 0;
  let largestList = { rows: 0, inside: null };
  const visit = (nodes, parentId) => {
    const rows = nodes.filter((node) => node.key !== undefined).length;
    if (rows > largestList.rows) largestList = { rows, inside: parentId };
    for (const node of nodes) {
      elements++;
      if (node.children) visit(node.children, node.id);
    }
  };
  visit(outline, null);
  return { elements, largestList };
};

const collectLinks = (spec) => {
  const links = [];
  const toText = (value) => {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object' && Array.isArray(value.join)) return value.join.map((part) => (typeof part === 'string' ? part : 'x')).join('');
    return null;
  };
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    const href = node.props?.href !== undefined ? toText(node.props.href) : null;
    if (href !== null) links.push({ href, soft: node.props.soft === true, via: 'link' });
    for (const handler of Object.values(node.on ?? {})) {
      for (const [actionName, args] of typeof handler[0] === 'string' ? [handler] : handler) {
        const target = actionName === 'route.go' && args?.href !== undefined ? toText(args.href) : null;
        // route.go is the soft link of a shell (src/shell.js): it replaces the page inside the shell that stays.
        if (target !== null) links.push({ href: target, soft: false, via: 'route.go' });
      }
    }
    for (const key of ['children', 'otherwise', 'template']) walk(node[key]);
  };
  walk(spec);
  return links;
};

// What the bundler refuses in the modules the entries reach, one message per problem, in the order a single read finds them. The
// graph collects the problems itself (`problems`), so a broken source costs the same as a good one and a file several pages share
// is reported once.
const findSourceProblems = ({ root, entries, replacements }) => {
  const problems = [];
  if (entries?.length) buildModuleGraph({ projectRoot: root, entries, replacements, problems });
  return problems;
};

// `ui.errors` holds the messages the app reported (strings); an Error or another value is shown as it is.
const describeError = (error) => (typeof error === 'string' ? error : (error.message ?? JSON.stringify(error)));

export const checkProject = async ({ config, root = process.cwd() }) => {
  const problems = [];
  // A request below the API base that the project's fetchFunction does not answer is a mistake in a resource's URL or in
  // the endpoint, and is reported with the page that made it.
  const api = config.api ? await createApiFor({ config, root, where: 'agent-ui check' }) : null;
  const apiBase = api ? (api.apiBase ?? '/api') : null;
  const apiPrefix = api ? `${apiBase}/` : null;
  const answerRequest = config.fetchFunction ?? defaultFetchFunction;
  // Each rendered page keeps the misses of its own requests: pages are rendered at the same time, so one shared list would
  // attribute a late answer to whichever page happened to be checked next.
  const fetchFunctionForOnePage = () => {
    const misses = [];
    const fetchFunction = async (url, init) => {
      const response = await answerRequest(url, init);
      if (apiPrefix && String(url).startsWith(apiPrefix) && !response.ok) misses.push(`${init?.method ?? 'GET'} ${url} answered ${response.status}`);
      return response;
    };
    return { fetchFunction, misses };
  };
  const publicDirectories = toArray(config.publicDir ?? []);
  const notes = [];
  const urlsByPage = new Map(); // page path -> the URLs check renders it at, for the check that each URL belongs to one page
  const measurements = []; // { page, url, elements, listRows, listInside, stateBytes } of every page rendered
  const budgets = config.budgets ?? {};
  let pagesChecked = 0;
  problems.push(...findSourceProblems({ root, entries: config.entries, replacements: config.replaceModules ?? {} }));
  const pages = config.pages ?? [];
  // Each page's pattern is compiled once, not once per link and once per URL listed in `paths`. Most specific first, so the
  // first pattern that matches is the page the server would answer with.
  const compiledPages = sortBySpecificity(pages.map((page) => ({ page, pattern: compileUrlPattern(page.path) })), (entry) => entry.pattern);
  const pagePaths = pages.map((page) => page.path);
  const modules = new Map(); // page name -> its generated module
  // Node loads modules at the same time; a page that fails is reported in page order below, with the other pages' problems.
  const loaded = await Promise.allSettled(pages.map((page) => import(pathToFileURL(resolve(root, page.app)))));
  loaded.forEach((result, index) => {
    if (result.status === 'fulfilled') modules.set(pages[index].name, result.value);
    else problems.push(`${pages[index].file}: cannot load the page: ${result.reason.message}`);
  });
  // A page that is not rendered at a URL of its own (it has parameters and lists no `paths`) still has a finished spec and shell
  // content, which a production build checks as data; check does the same. It is also mounted at a sample URL, so that what only a
  // mount finds is found too: a plugin the page needs and does not list, a resource definition, a derive that throws, the shell's
  // reads. The sample URL's data is unknowable, so nothing is fetched and a page that never becomes ready is not a problem here.
  const checkedShells = new Set(); // a shell's content is the same for every page of it, so its problems are reported once
  const sampleUrlOf = (path) => path.replace(/:[A-Za-z0-9]+/g, '1').replace(/\*[A-Za-z0-9]*/g, 'a/b');
  const checkWithoutRendering = async (page, module, found) => {
    const specProblems = validate(module.spec, { namespaces: module.namespaces });
    for (const problem of specProblems) found.push(`${page.file}: ${problem}`);
    if (module.shellContent && !checkedShells.has(module.shellName)) {
      checkedShells.add(module.shellName);
      for (const problem of validate(module.shellContent.view, { namespaces: module.shellNamespaces })) found.push(`${page.file}: shell "${module.shellName}": ${problem}`);
    }
    // A spec with problems does not mount (app() refuses it): it was reported above, once.
    if (specProblems.length) return;
    const sample = sampleUrlOf(page.path);
    const where = `${page.file}: at ${sample} (a sample URL, because view.js lists no \`paths\`)`;
    try {
      const result = await renderPage(module.create, {
        url: sample,
        fetchFunction: () => new Promise(() => {}),
        dev: true,
        createShell: module.createShell,
        basePath: config.basePath ?? '',
        timeoutMs: 30,
        stateForBrowser: config.stateForBrowser ?? null,
      });
      try {
        await new Promise((resolveFlush) => setImmediate(resolveFlush));
        for (const error of result.ui.errors) found.push(`${where}: ${describeError(error)}`);
        for (const error of result.shellApp?.errors ?? []) found.push(`${where}: shell "${module.shellName}": ${describeError(error)}`);
      } finally {
        destroyApps(result.ui, result.shellApp);
      }
    } catch (error) {
      // A page or a plugin may throw anything, a string included: say what it threw.
      found.push(`${where}: cannot start the page: ${error?.message ?? String(error)}`);
    }
  };
  const shellTexts = new Map(); // shell name -> { text, page } of the first page that gives its content
  const pageAt = (target) => compiledPages.find((entry) => entry.pattern.match(withoutTrailingSlash(target)))?.page;
  const reportedLinks = new Set(); // the same broken link can be met twice (the page's spec and its shell's content), and is reported once
  const reportLink = (found, problem) => {
    if (reportedLinks.has(problem)) return;
    reportedLinks.add(problem);
    found.push(problem);
  };
  const records = []; // per page: the problems found without rendering it, then the URLs to render in order
  for (const page of pages) {
    const module = modules.get(page.name);
    if (!module) continue;
    const record = { page, module, problems: [], jobs: [] };
    records.push(record);
    for (const { href, soft, via } of [...collectLinks(module.spec), ...collectLinks(module.shellContent?.view)]) {
      if (!href.startsWith('/') || href.startsWith('//')) continue;
      const target = href.split(/[?#]/)[0];
      const targetPage = pageAt(target);
      const isFile = extname(target) && publicDirectories.some((directory) => existsSync(join(root, directory, target)));
      const isApi = apiPrefix && (target === apiBase || target.startsWith(apiPrefix));
      if (!targetPage && !isFile && !isApi) reportLink(record.problems, `${page.file}: the link "${href}" is no page, no file in publicDir and no API path. ${didYouMean(target, pagePaths)}Pages: ${listPages(pagePaths)}`);
      // route.go is a soft navigation written as a handler: it swaps the page inside the shell that stays, so its target must be
      // a page of the same shell, exactly like a `soft: true` link.
      if (via === 'route.go' && targetPage && modules.has(targetPage.name) && targetPage.name !== page.name && modules.get(targetPage.name).shellName !== module.shellName) {
        const other = modules.get(targetPage.name);
        reportLink(record.problems, `${page.file}: route.go goes to "${href}", which ${other.shellName ? `has the shell "${other.shellName}"` : 'has no shell'}, and this page ${module.shellName ? `has the shell "${module.shellName}"` : 'has no shell'}. route.go replaces the page inside the shell that stays: send it to a page of the same shell, or use a link so the whole document changes`);
      }
      if (soft && !module.shellName) {
        reportLink(record.problems, `${page.file}: the soft link "${href}" is on a page without a shell, so nothing handles \`soft\` and it is a normal link. Give the page a shell (\`shell\` in page.js and view.js), or remove \`soft\``);
      } else if (soft && targetPage && modules.has(targetPage.name) && modules.get(targetPage.name).shellName !== module.shellName) { // a page that could not be loaded is reported already
        reportLink(record.problems, `${page.file}: the soft link "${href}" leads to ${targetPage.path}, which ${modules.get(targetPage.name)?.shellName ? `has the shell "${modules.get(targetPage.name).shellName}"` : 'has no shell'}, and this page ${module.shellName ? `has the shell "${module.shellName}"` : 'has no shell'}. A soft link replaces the page inside the shell that stays: give both pages the same shell, or remove \`soft\` so the link is a normal page load`);
      }
    }
    if (module.shellContent) {
      const text = JSON.stringify(module.shellContent);
      const earlier = shellTexts.get(module.shellName);
      if (earlier && earlier.text !== text) record.problems.push(`${page.file}: the content of the shell "${module.shellName}" differs from the one ${earlier.page.file} gives it. Every page of a shell imports the same content from one module; a different header needs a different shell name`);
      if (!earlier) shellTexts.set(module.shellName, { text, page });
    }
    // A page with parameters is rendered at the URLs its view.js lists in `paths` (build/page-paths.mjs), the ones a static build writes.
    // One that lists none has no URL of its own to render: its spec is validated and it is mounted at a sample URL, and
    // `agent-ui serve` renders it for real URLs.
    let urls;
    try {
      urls = (await urlsOfPage(page, module)) ?? [];
    } catch (error) {
      record.problems.push(error.message);
      urls = [];
    }
    urlsByPage.set(page.path, urls);
    if (!urls.length) {
      notes.push(`${page.path} has parameters and its view.js lists no \`paths\`, so check does not render it at its URLs (its spec is validated and it is started at a sample URL). Export paths = ["${sampleUrlOf(page.path)}"] to render it`);
      await checkWithoutRendering(page, module, record.problems);
    }
    for (const url of urls) record.jobs.push({ record, module, url });
  }

  // Renders one URL and checks what it produced. Its problems stay with it and are put in page order afterwards: pages render
  // at the same time, so the order they finish says nothing about the order the report should have.
  const renderOne = async (job) => {
    const where = `${job.record.page.path} ${job.url}`;
    const outcome = { problems: [], measurement: null, checked: false };
    const { fetchFunction, misses } = fetchFunctionForOnePage();
    try {
      const result = await renderPage(job.module.create, {
        url: job.url,
        fetchFunction,
        dev: true,
        createShell: job.module.createShell,
        basePath: config.basePath ?? '',
        timeoutMs: config.renderTimeoutMs ?? 2000,
        // Check has no request, like a static build: the hook must accept null and cannot depend on visitor data here.
        stateForBrowser: config.stateForBrowser ?? null,
      });
      try {
        outcome.checked = true;
        await new Promise((resolveFlush) => setImmediate(resolveFlush)); // let the answers to the page's requests arrive
        for (const miss of misses) outcome.problems.push(`${where}: ${miss}. Endpoints are served below ${apiPrefix}: check the URL of the resource and the endpoint's pattern`);
        if (result.timedOut) outcome.problems.push(`${where}: data did not finish loading (the page's \`ready(state)\` never became true)`);
        for (const error of result.ui.errors) outcome.problems.push(`${where}: ${describeError(error)}`);
        for (const error of result.shellApp?.errors ?? []) outcome.problems.push(`${where}: shell "${job.module.shellName}": ${describeError(error)}`);
        if (!job.module.describePage(result.state).title) outcome.problems.push(`${where}: the page has no title`);
        const { elements, largestList } = measureOutline([...result.ui.outline(), ...(result.shellApp?.outline() ?? [])]);
        const stateBytes = Buffer.byteLength(result.stateScript);
        outcome.measurement = { page: job.record.page.path, url: job.url, elements, listRows: largestList.rows, listInside: largestList.inside, stateBytes };
        if (budgets.elements !== undefined && elements > budgets.elements) outcome.problems.push(`${where}: renders ${elements} elements, over budgets.elements ${budgets.elements}. Show less at once (a summary, a page of the data, a branch that opens on request), or raise the budget`);
        if (budgets.listRows !== undefined && largestList.rows > budgets.listRows) outcome.problems.push(`${where}: renders ${largestList.rows} rows in one list (inside "${largestList.inside}"), over budgets.listRows ${budgets.listRows}. Every row is rendered (there is no virtualization): ask the server for one page of the data at a time, or raise the budget`);
        if (budgets.stateBytes !== undefined && stateBytes > budgets.stateBytes) outcome.problems.push(`${where}: the document carries ${stateBytes} bytes of state, over budgets.stateBytes ${budgets.stateBytes}. Load less on the server, leave what the browser does not need out with stateForBrowser, or raise the budget`);
        try {
          result.ui.getStatus?.(); // checked here so an invalid status is found without a request
        } catch (error) {
          outcome.problems.push(`${where}: ${error.message}`);
        }
        // Whether a browser that takes over the server's markup finds the page it would make itself (cli/hydration-check.mjs). Before the apps are destroyed: it reads their markup.
        outcome.problems.push(...findHydrationProblems({ create: job.module.create, createShell: job.module.createShell, url: job.url, result, basePath: config.basePath ?? '', where }));
      } finally {
        destroyApps(result.ui, result.shellApp);
      }
    } catch (error) {
      outcome.problems.push(`${where}: ${error.message}`);
    }
    return outcome;
  };

  // Pages wait on their data, not on each other: a bounded pool turns N pages that never become ready into about
  // N / CHECK_CONCURRENCY waits of `renderTimeoutMs` instead of N. The bound keeps a site with hundreds of URLs from opening
  // them all at once.
  const jobs = records.flatMap((record) => record.jobs);
  let nextJob = 0;
  const renderNext = async () => {
    while (nextJob < jobs.length) {
      const job = jobs[nextJob++];
      job.outcome = await renderOne(job);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CHECK_CONCURRENCY, jobs.length) }, renderNext));

  // The report is assembled in page order: what was found without rendering the page, then what each URL of it found.
  for (const record of records) {
    problems.push(...record.problems);
    for (const job of record.jobs) {
      if (job.outcome.checked) pagesChecked++;
      problems.push(...job.outcome.problems);
      if (job.outcome.measurement) measurements.push(job.outcome.measurement);
    }
  }
  problems.push(...findPathOwnerProblems(pages, urlsByPage, compiledPages));
  return { problems, pagesChecked, notes, measurements };
};

if (isMain(import.meta.url)) {
  const options = parseOrExit(process.argv.slice(2), { config: 'text' }, { command: 'agent-ui check' });
  let config;
  try {
    config = await loadConfig({ root: process.cwd(), file: options.config, mode: { dev: true } });
  } catch (error) {
    console.error(`check failed: ${error.message}`);
    process.exit(1);
  }
  const { problems, pagesChecked, notes, measurements } = await checkProject({ config });
  for (const note of notes) console.log(`note: ${note}`);
  if (measurements.length) {
    console.log('url                            elements  largest list  state');
    for (const measured of measurements) console.log([measured.url.padEnd(30), String(measured.elements).padStart(8), `${measured.listRows} rows`.padStart(13), `${(measured.stateBytes / 1024).toFixed(1)} KB`.padStart(9)].join(' '));
  }
  if (!mentionsAgentUi(process.cwd())) console.log('note: AGENTS.md of this project does not exist or does not mention agent-ui, so an agent working here is not told its rules. Run `agent-ui init`');
  if (problems.length) {
    console.error(`${problems.length} problem${problems.length === 1 ? '' : 's'}:\n${problems.map((problem) => `  ${problem}`).join('\n')}`);
    process.exit(1);
  }
  console.log(`ok: ${pagesChecked} pages rendered and checked`);
}
