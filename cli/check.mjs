// Checks a project without building it: renders every page in development mode (so the spec validator is on) and reports
// everything an agent would otherwise find out in a browser.
//   agent-ui check [--config=<file>]       project root = current directory; exit code 1 when anything is wrong
//
// For every page below pages/ whose path has no parameters it renders the page at that path, then checks: the app mounts (spec problems
// are reported with their path), no action or resource raised an error (`ui.errors`), data requests were answered, the page has a
// title, and its `status(state)` answers a valid HTTP value. It also checks every link in a page's spec and in its shell's: a literal `href` that starts with "/" must be the URL of a page,
// a file in publicDir, or an API path, and a `soft` link must lead to a page that has the same shell (a soft link replaces the page
// inside the shell, so a page without it could not be shown), and a `soft` link on a page without a shell is reported, because nothing
// handles it. A page with parameters has no URL of its own to render: it is listed as a note, and its finished spec and shell content
// are still validated, as a build does.
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../build/config.mjs';
import { defaultFetchFunction, destroyApps, renderPage } from '../server/render-page.js';
import { didYouMean } from '../src/messages.js';
import { compileUrlPattern } from '../src/url-pattern.js';
import { toArray } from '../src/spec-core.js';
import { validate } from '../src/validate.js';
import { mentionsAgentUi } from './agent-instructions.mjs';
import { parseOrExit } from './arguments.mjs';
import { isMain } from './is-main.mjs';

// Every link of a spec: [{ href, soft }] for the `href` of an element (soft: it has `soft: true`) and the literal `href` of an
// `act('route.go', { href })` handler. The href is a string with a placeholder where a binding stands: 'x' for a state, item or other
// value, so "/product/" + item.id is checked as "/product/x". A fully dynamic href (a bare binding) is not checked.
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
    if (href !== null) links.push({ href, soft: node.props.soft === true });
    for (const handler of Object.values(node.on ?? {})) {
      for (const [actionName, args] of typeof handler[0] === 'string' ? [handler] : handler) {
        const target = actionName === 'route.go' && args?.href !== undefined ? toText(args.href) : null;
        if (target !== null) links.push({ href: target, soft: false });
      }
    }
    for (const key of ['children', 'otherwise', 'template']) walk(node[key]);
  };
  walk(spec);
  return links;
};

// `ui.errors` holds the messages the app reported (strings); an Error or another value is shown as it is.
const describeError = (error) => (typeof error === 'string' ? error : (error.message ?? JSON.stringify(error)));

export const checkProject = async ({ config, root = process.cwd() }) => {
  const problems = [];
  // A request below the API base that the project's fetchFunction does not answer is a mistake in a resource's URL or in
  // the endpoint, and is reported with the page that made it.
  const api = config.api ? (await import(pathToFileURL(resolve(root, config.api)))).createApi({ root }) : null;
  const apiBase = api ? (api.apiBase ?? '/api') : null;
  const apiPrefix = api ? `${apiBase}/` : null;
  const apiMisses = [];
  const answerRequest = config.fetchFunction ?? defaultFetchFunction;
  const fetchFunction = async (url, init) => {
    const response = await answerRequest(url, init);
    if (apiPrefix && String(url).startsWith(apiPrefix) && !response.ok) apiMisses.push(`${init?.method ?? 'GET'} ${url} answered ${response.status}`);
    return response;
  };
  const publicDirectories = toArray(config.publicDir ?? []);
  const notes = [];
  let pagesChecked = 0;
  const modules = new Map(); // page name -> its generated module
  for (const page of config.pages ?? []) {
    try {
      modules.set(page.name, await import(pathToFileURL(resolve(root, page.app))));
    } catch (error) {
      problems.push(`${page.file}: cannot load the page: ${error.message}`);
    }
  }
  // A page that is not rendered here (it has parameters) still has a finished spec and shell content, which a
  // production build checks as data; check does the same, so those pages are not the ones whose mistakes go unreported.
  const checkedShells = new Set(); // a shell's content is the same for every page of it, so its problems are reported once
  const checkWithoutRendering = (page, module) => {
    for (const problem of validate(module.spec, { namespaces: module.namespaces })) problems.push(`${page.file}: ${problem}`);
    if (module.shellContent && !checkedShells.has(module.shellName)) {
      checkedShells.add(module.shellName);
      for (const problem of validate(module.shellContent.view, { namespaces: module.shellNamespaces })) problems.push(`${page.file}: shell "${module.shellName}": ${problem}`);
    }
  };
  const shellTexts = new Map(); // shell name -> { text, page } of the first page that gives its content
  const pageAt = (target) => (config.pages ?? []).find((candidate) => compileUrlPattern(candidate.path).match(target.length > 1 && target.endsWith('/') ? target.slice(0, -1) : target));
  for (const page of config.pages ?? []) {
    const module = modules.get(page.name);
    if (!module) continue;
    for (const { href, soft } of [...collectLinks(module.spec), ...collectLinks(module.shellContent?.view)]) {
      if (!href.startsWith('/') || href.startsWith('//')) continue;
      const target = href.split(/[?#]/)[0];
      const targetPage = pageAt(target);
      const isFile = extname(target) && publicDirectories.some((directory) => existsSync(join(root, directory, target)));
      const isApi = apiPrefix && (target === apiBase || target.startsWith(apiPrefix));
      if (!targetPage && !isFile && !isApi) problems.push(`${page.file}: the link "${href}" is no page, no file in publicDir and no API path. ${didYouMean(target, config.pages.map((candidate) => candidate.path))}Pages: ${config.pages.map((candidate) => candidate.path).join(', ')}`);
      if (soft && !module.shellName) {
        problems.push(`${page.file}: the soft link "${href}" is on a page without a shell, so nothing handles \`soft\` and it is a normal link. Give the page a shell (\`shell\` in page.js and view.js), or remove \`soft\``);
      } else if (soft && targetPage && modules.get(targetPage.name)?.shellName !== module.shellName) {
        problems.push(`${page.file}: the soft link "${href}" leads to ${targetPage.path}, which ${modules.get(targetPage.name)?.shellName ? `has the shell "${modules.get(targetPage.name).shellName}"` : 'has no shell'}, and this page ${module.shellName ? `has the shell "${module.shellName}"` : 'has no shell'}. A soft link replaces the page inside the shell that stays: give both pages the same shell, or remove \`soft\` so the link is a normal page load`);
      }
    }
    if (module.shellContent) {
      const text = JSON.stringify(module.shellContent);
      const earlier = shellTexts.get(module.shellName);
      if (earlier && earlier.text !== text) problems.push(`${page.file}: the content of the shell "${module.shellName}" differs from the one ${earlier.page.file} gives it. Every page of a shell imports the same content from one module; a different header needs a different shell name`);
      if (!earlier) shellTexts.set(module.shellName, { text, page });
    }
    // A page with parameters has no URL of its own to render: its spec is validated, and `agent-ui serve` renders it for real URLs.
    const urls = /[:*]/.test(page.path) ? [] : [page.path];
    if (!urls.length) {
      notes.push(`${page.path} has parameters, so check does not render it (its spec is validated)`);
      checkWithoutRendering(page, module);
    }
    for (const url of urls) {
      const where = `${page.path} ${url}`;
      try {
        const result = await renderPage(module.create, {
          url,
          fetchFunction,
          dev: true,
          createShell: module.createShell,
          timeoutMs: config.renderTimeoutMs ?? 2000,
          // Check has no request, like a static build: the hook must accept null and cannot depend on visitor data here.
          stateForBrowser: config.stateForBrowser ?? null,
        });
        try {
          pagesChecked++;
          await new Promise((resolveFlush) => setImmediate(resolveFlush)); // let the answers to the page's requests arrive
          for (const miss of apiMisses.splice(0)) problems.push(`${where}: ${miss}. Endpoints are served below ${apiPrefix}: check the URL of the resource and the endpoint's pattern`);
          if (result.timedOut) problems.push(`${where}: data did not finish loading (the page's \`ready(state)\` never became true)`);
          for (const error of result.ui.errors) problems.push(`${where}: ${describeError(error)}`);
          for (const error of result.shellApp?.errors ?? []) problems.push(`${where}: shell "${module.shellName}": ${describeError(error)}`);
          if (!module.describePage(result.state).title) problems.push(`${where}: the page has no title`);
          try {
            result.ui.getStatus?.(); // checked here so an invalid status is found without a request
          } catch (error) {
            problems.push(`${where}: ${error.message}`);
          }
        } finally {
          destroyApps(result.ui, result.shellApp);
        }
      } catch (error) {
        problems.push(`${where}: ${error.message}`);
      }
    }
  }
  return { problems, pagesChecked, notes };
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
  const { problems, pagesChecked, notes } = await checkProject({ config });
  for (const note of notes) console.log(`note: ${note}`);
  if (!mentionsAgentUi(process.cwd())) console.log('note: AGENTS.md of this project does not exist or does not mention agent-ui, so an agent working here is not told its rules. Run `agent-ui init`');
  if (problems.length) {
    console.error(`${problems.length} problem${problems.length === 1 ? '' : 's'}:\n${problems.map((problem) => `  ${problem}`).join('\n')}`);
    process.exit(1);
  }
  console.log(`ok: ${pagesChecked} pages rendered and checked`);
}
