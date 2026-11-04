// Usage: node cli/build.mjs [--config=<file>] [--dev] [--validator=include|omit] [--out=<directory>] [--source-maps] [--static]
//   --config     build configuration (default: ./build.config.mjs); the project root is the current directory
//   --dev        readable development build: stable file names, no stripping, validator included
//   --validator  keep or leave out the spec validator (default: omit in production, include with --dev)
//   --out        output directory (default from the configuration)
//   --source-maps  write a .map file next to every chunk (the same as sourceMaps: true in the configuration)
//   --static     also write every page as <path>/index.html for a file host (a page with parameters once for each URL its view.js lists in `paths`; each answers 200)
import { build } from '../build/build.mjs';
import { assertStaticSite, prerender } from '../build/prerender.mjs';
import { formatReport } from '../build/write-site.mjs';
import { BuildError } from '../build/parse-module.mjs';
import { loadConfig } from '../build/config.mjs';
import { parseOrExit } from './arguments.mjs';

const projectRoot = process.cwd();
const options = parseOrExit(process.argv.slice(2), { config: 'text', dev: 'flag', validator: ['include', 'omit'], out: 'text', 'source-maps': 'flag', static: 'flag' }, { command: 'agent-ui build' });

try {
  const config = await loadConfig({
    root: projectRoot,
    file: options.config,
    mode: { dev: Boolean(options.dev), ...(options.validator && { validator: options.validator }) },
  });
  if (options.static) {
    try {
      await assertStaticSite(config.pages, { projectRoot }); // before the build writes anything: a refused site leaves no half-written output behind
    } catch (error) {
      console.error(`build failed: ${error.message}`);
      process.exit(1);
    }
  }
  const manifest = build({
    ...config,
    projectRoot,
    ...(options.out && { outDir: options.out }),
    ...(options['source-maps'] && { sourceMaps: true }),
  });
  if (options.static) {
    let rendered;
    try {
      rendered = await prerender({ projectRoot, outDir: options.out || config.outDir, fetchFunction: config.fetchFunction, pages: config.pages, timeoutMs: config.renderTimeoutMs ?? 2000, stateForBrowser: config.stateForBrowser ?? null, basePath: config.basePath ?? '' });
    } catch (error) {
      console.error(`build failed: ${error.message}`); // a mistake in the pages (a page with parameters, a page that never became ready), not a crash
      process.exit(1);
    }
    console.log(`static pages: ${rendered.join(', ')}`);
  }
  console.log(formatReport(manifest));
  console.log(`\nWrote ${Object.keys(manifest.chunks).length} chunks and ${Object.keys(manifest.pages).length} pages to ${options.out || config.outDir}/`);
  console.log(`Serve it: agent-ui serve${options.out ? ` --out=${options.out}` : ''}`);
} catch (error) {
  if (!(error instanceof BuildError)) throw error;
  console.error(`build failed: ${error.message}`);
  process.exit(1);
}
