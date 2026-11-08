// Loading a project's build configuration (used by the command line tools and by servers that embed the handlers).
//
//   agent-ui build --config=path/to/build.config.mjs      (default: ./build.config.mjs)
//
// The project root is the current directory, so every path in the configuration (publicDir, outDir, api, ...) is
// relative to where the command runs. The configuration file's default export is either an object or a function
// of the build mode ({ dev, validator }) returning one.
//
// The result also holds the pages found in the folders below pages/ (`pages`: name, URL pattern, generated app module) and
// the entries the bundler builds from them (`entries`), and the generated modules are written to .agent-ui/ (build/pages.mjs).
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkConfig } from './config-check.mjs';
import { expandPages } from './pages.mjs';

export const DEFAULT_OUT_DIR = 'dist';

// `fresh` re-imports the file even if it was loaded before (the dev server reloads it after every change). `readOnly` leaves
// `.agent-ui/` as the build wrote it, for a server that only renders: the configuration then has `pages` but no `entries`.
export const loadConfig = async ({ root = process.cwd(), file = 'build.config.mjs', mode = {}, fresh = false, readOnly = false } = {}) => {
  const url = pathToFileURL(resolve(root, file)).href + (fresh ? `?t=${Date.now()}` : '');
  const { default: exported } = await import(url);
  const config = typeof exported === 'function' ? exported(mode) : exported;
  const problems = checkConfig(config);
  if (problems.length) throw new Error(`${file} has ${problems.length === 1 ? 'a problem' : `${problems.length} problems`}:\n${problems.map((problem) => `  ${problem}`).join('\n')}`);
  // Every consumer (build, check, ssr, dev) needs an output directory: one default, here.
  return { outDir: DEFAULT_OUT_DIR, configFile: file, ...(await expandPages(config, root, { dev: Boolean(mode.dev), readOnly })) };
};
