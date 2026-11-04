// Development server: build (stable names), serve with hot reload, rebuild when sources change. Pages render in the
// browser (nothing is rendered ahead), so an edit shows without stale server-side modules.
//   agent-ui dev [--config=<file>] [--port=8080] [--host=127.0.0.1]     (project root = current directory)
// A failed rebuild prints the error. A build that fails before the output is written leaves the last good one being served; one that fails
// after it (the output directory is rewritten first) leaves the new files, and the page is reloaded by hand.
import { watch } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../build/build.mjs';
import { loadConfig } from '../build/config.mjs';
import { toArray } from '../src/spec-core.js';
import { PAGES_DIRECTORY } from '../build/pages.mjs';
import { createStaticServer } from './static-handler.mjs';
import { hostsFor } from '../server/request.mjs';
import { parseOrExit } from './arguments.mjs';
import { createHotReload, versionOutput } from './hot-reload.mjs';
import { isMain } from './is-main.mjs';

const projectRoot = process.cwd();
const frameworkSource = resolve(dirname(fileURLToPath(import.meta.url)), '../src'); // watched too, for framework work

export const startDev = async ({ root = projectRoot, port = 8080, host = '127.0.0.1', quiet = false, configFile = undefined } = {}) => {
  const config = await loadConfig({ root, file: configFile, mode: { dev: true }, fresh: true });
  const log = (message) => !quiet && console.log(message);
  const hotReload = createHotReload();
  let versioned = null; // what versionOutput says about the last build, to tell the pages what the next one changed
  let server = null; // created after the first build
  let rebuilding = false;
  let again = false;
  let timer = null;
  let pages = config.pages; // the pages of the last good build, most specific URL first: the static handler answers a URL with the shell of its page
  let built = false; // a first build that fails leaves nothing to serve: the dev server stops instead of serving the empty output directory

  // What is watched: the framework (for work on it), the pages directory of an entries pattern, static files, the
  // configuration, the route folders and the directory of the API module, and, after every build, the directory of every
  // module that build read (so an entries list, an app.js or a routes/ folder anywhere in the project is covered).
  // Changes in the output directory and in node_modules are ignored: the build itself writes there.
  const watchers = new Map(); // directory or file -> watcher
  const recursiveRoots = [];
  const outputName = (config.outDir ?? 'dist').split('/')[0];
  const isIgnored = (filename) => {
    const first = filename ? String(filename).split(/[\\/]/)[0] : '';
    return first === outputName || first === 'node_modules' || first.startsWith('.');
  };
  const onChange = (event, filename) => {
    if (isIgnored(filename)) return;
    clearTimeout(timer);
    timer = setTimeout(rebuild, 100);
  };
  const watchPath = (path, recursive = false) => {
    const absolute = resolve(root, path);
    if (watchers.has(absolute) || recursiveRoots.some((directory) => absolute.startsWith(`${directory}${sep}`))) return;
    try {
      watchers.set(absolute, watch(absolute, { recursive }, onChange));
      if (recursive) recursiveRoots.push(absolute);
    } catch {
      // the path does not exist (yet): the next build looks again
    }
  };
  const updateWatchers = (currentConfig, manifest) => {
    for (const path of [frameworkSource, PAGES_DIRECTORY, ...toArray(currentConfig.publicDir)].filter(Boolean)) watchPath(path, true);
    watchPath(configFile ?? 'build.config.mjs');
    if (currentConfig.api) watchPath(dirname(currentConfig.api));
    for (const chunk of Object.values(manifest.chunks)) {
      for (const modulePath of chunk.modules) {
        const absolute = resolve(root, modulePath);
        const inside = relative(root, absolute);
        if (!inside.startsWith('..') && !isIgnored(inside)) watchPath(dirname(absolute));
      }
    }
    // Stylesheets are read by the build but are not modules; an imported CSS file can live outside pages/ (ui/, shared/).
    for (const sourceFile of manifest.sources?.files ?? []) {
      if (!sourceFile.endsWith('.css')) continue;
      const absolute = resolve(root, sourceFile);
      const inside = relative(root, absolute);
      if (!inside.startsWith('..') && !isIgnored(inside)) watchPath(dirname(absolute));
    }
  };

  const rebuild = async () => {
    if (rebuilding) return void (again = true);
    rebuilding = true;
    try {
      const freshConfig = await loadConfig({ root, file: configFile, mode: { dev: true }, fresh: true });
      // A page folder that cannot be a page stops the rebuild (loadConfig throws); the last good build keeps being served.
      // The browser renders the pages here, from the page shells the build writes.
      const manifest = build({ ...freshConfig, projectRoot: root });
      pages = freshConfig.pages;
      const result = versionOutput({ directory: resolve(root, freshConfig.outDir), manifest, previous: versioned });
      versioned = result.state;
      built = true;
      updateWatchers(freshConfig, manifest);
      log(`rebuilt at ${new Date().toLocaleTimeString()}`);
      if (result.message) hotReload.publish(result.message);
    } catch (error) {
      console.error(`rebuild failed: ${error.message}`);
    } finally {
      rebuilding = false;
      if (again) {
        again = false;
        rebuild();
      }
    }
  };
  await rebuild();
  if (!built) throw new Error('agent-ui dev: the first build failed, so there is no site to serve. Fix the error above and start it again.');
  server = createStaticServer(resolve(root, config.outDir), { intercept: hotReload.intercept, transformHtml: hotReload.transformHtml, assetsDir: config.assetsDir ?? 'assets', rewrites: () => pages.map((page) => ({ pattern: page.path, page: `${page.name}.html` })), hosts: hostsFor(host), basePath: config.basePath ?? '' });
  await new Promise((resolveListening) => server.listen(port, host, resolveListening));
  log(`dev server at http://${host}:${server.address().port}${config.basePath ?? ''}/ (hot reload on)`);
  return { server, rebuild, stop: () => { watchers.forEach((watcher) => watcher.close()); clearTimeout(timer); hotReload.close(); server.closeAllConnections?.(); server.close(); } };
};

if (isMain(import.meta.url)) {
  const options = parseOrExit(process.argv.slice(2), { config: 'text', port: 'number', host: 'text' }, { command: 'agent-ui dev' });
  await startDev({ port: options.port ?? 8080, host: options.host ?? '127.0.0.1', configFile: options.config });
}
