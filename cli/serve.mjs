// `agent-ui serve [--config=<file>] [--out=<directory>] [--port=8080] [--host=127.0.0.1]` (the port is --port, otherwise the PORT
// environment variable, otherwise 8080): serves the built site (`agent-ui build` first):
// every page is rendered on the server for the URL that was asked for, the project's JSON API and form posts are answered, and the files
// of the build are sent. It renders from the project's sources, so it needs them next to the build, and it refuses a build that is older
// than they are. It listens on this machine only unless --host says otherwise.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from '../build/config.mjs';
import { staleReason } from '../build/stamp.mjs';
import { createSsrServer } from './ssr-server.mjs';
import { hostsFor } from '../server/request.mjs';
import { parseOrExit, portOrExit } from './arguments.mjs';
import { isMain } from './is-main.mjs';

const projectRoot = process.cwd();

if (isMain(import.meta.url)) {
  const options = parseOrExit(process.argv.slice(2), { config: 'text', out: 'text', port: 'number', host: 'text' }, { command: 'agent-ui serve' });
  const port = portOrExit(options, { command: 'agent-ui serve' });
  const host = options.host ?? '127.0.0.1'; // this machine only; --host=0.0.0.0 is the explicit choice to serve the network
  // Not readOnly: serve regenerates the production modules in .agent-ui/, which `agent-ui check` (a development load) removes
  // (spec.js) or rewrites, so a build followed by a check is servable again. The stale check below then sees the files serve uses.
  const config = await loadConfig({ root: projectRoot, file: options.config });
  const outDir = options.out ?? config.outDir;
  let manifest = null;
  try {
    manifest = JSON.parse(readFileSync(resolve(projectRoot, outDir, 'manifest.json'), 'utf8'));
  } catch {
    // reported below, with the other ways a build can be unusable
  }
  // A build can be unusable without a source having changed: a page folder added or removed since, or a page file missing from the output.
  const pagesProblem = () => {
    const built = Object.keys(manifest.pages);
    const current = config.pages.map((page) => page.name);
    const added = current.filter((name) => !built.includes(name));
    const removed = built.filter((name) => !current.includes(name));
    if (added.length) return `the page${added.length > 1 ? 's' : ''} ${added.join(', ')} ${added.length > 1 ? 'are' : 'is'} not in it`;
    if (removed.length) return `it holds the page${removed.length > 1 ? 's' : ''} ${removed.join(', ')}, which no longer exist${removed.length > 1 ? '' : 's'}`;
    const missing = built.find((name) => !existsSync(resolve(projectRoot, outDir, manifest.pages[name].html)));
    return missing ? `${manifest.pages[missing].html} is missing from it` : null;
  };
  // Built with another mode (agent-ui build --dev) the generated sources differ from the ones serve regenerates: build again without it.
  const stale = manifest ? staleReason(projectRoot, manifest) ?? pagesProblem() : `${outDir}/manifest.json does not exist`;
  if (stale) {
    console.error(`agent-ui serve: the build in ${outDir}/ cannot be served: ${stale}. Run agent-ui build${options.out ? ` --out=${options.out}` : ''} first`);
    process.exit(1);
  }
  const server = await createSsrServer({ config, outDir, hosts: hostsFor(host) });
  server.on('error', (error) => {
    console.error(`agent-ui serve: cannot listen: ${String(error.message).replace(/^listen \w+: /, '')}. Choose another port with --port=<number>`);
    process.exit(1);
  });
  server.listen(port, host, () => console.log(`serving at http://${host}:${port}/ (development server: every page is rendered on the server for the requested URL; compress at your host or CDN)`));
}
