// Build options that depend on where this framework is installed, so a project's build configuration does not have to
// repeat them (module paths are relative to the project root, so they differ between a checkout and node_modules):
//
//   import { frameworkBuildOptions } from '@ehtb/agent-ui/build/presets.mjs';
//   export default ({ dev = false, validator } = {}) => ({
//     ...frameworkBuildOptions({ dev, validator }),
//     ...
//   });
//
// Production (dev: false): content-hashed file names, comments and indentation stripped, and the spec validator left
// out (a stub replaces src/validate.js, and others the runtime's own message checks, src/runtime-checks.js, the builders' call-site checks, src/spec-checks.js, the page checks, src/pages-checks.js, and those of shells, of syncApps and of windowEvents, src/shell-checks.js, src/sync-apps-checks.js and src/window-events-checks.js; the runtime chunk then contains the validator's shared primitives).
// Development (dev: true): stable names, readable output, validator included as a chunk of its own.
// Both modes leave out the server-only half of pages (src/pages-server.js): a browser never needs it.
// `validator: 'include' | 'omit'` overrides the default for the chosen mode.
// `projectRoot` is the directory the build runs in (default: the current directory, which is what the CLI uses).
import { realpathSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toPosixPath } from './import-path.mjs';

const frameworkDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const frameworkBuildOptions = ({ dev = false, validator = dev ? 'include' : 'omit', projectRoot = process.cwd() } = {}) => {
  if (validator !== 'include' && validator !== 'omit') throw new Error(`frameworkBuildOptions: validator must be "include" or "omit", got ${JSON.stringify(validator)}. Write validator: 'include'`);
  // Where the framework's files are, as the bundler names them: relative to the project root, real paths.
  const prefix = toPosixPath(relative(realpathSync(projectRoot), realpathSync(frameworkDirectory)));
  const at = (file) => (prefix ? `${prefix}/${file}` : file);
  return {
    // In development the framework's own modules (src/**) are one chunk that never changes while a project is edited, so the hot swap of a
    // page (src/hot.js) can import the page's chunk again without evaluating src/pages.js a second time (its registry of pages and the page
    // that runs would be new and empty). The validator stays a chunk of its own, as it does in a production build that includes it.
    manualChunks:
      validator === 'omit'
        ? { 'agent-ui': [at('src/ui.js'), at('src/adopt.js'), at('src/base-path.js'), at('src/spec-core.js'), at('src/validate.js'), at('src/messages.js'), at('src/namespaces.js'), at('src/runtime-checks.js'), at('src/errors.js'), at('src/error-messages.js'), ...(dev ? [at('src/**')] : [])] }
        : dev
          ? { validator: [at('src/validate.js'), at('src/nesting.js'), at('src/grammar.js'), at('src/handler-checks.js'), at('src/spec-core.js'), at('src/messages.js'), at('src/namespaces.js'), at('src/runtime-checks.js'), at('src/base-path-checks.js'), at('src/errors.js'), at('src/error-messages.js')], 'agent-ui': [at('src/**')] }
          : { 'agent-ui': [at('src/ui.js'), at('src/adopt.js'), at('src/base-path.js')], validator: [at('src/validate.js'), at('src/nesting.js'), at('src/grammar.js'), at('src/handler-checks.js'), at('src/spec-core.js'), at('src/messages.js'), at('src/namespaces.js'), at('src/runtime-checks.js'), at('src/base-path-checks.js'), at('src/errors.js'), at('src/error-messages.js')] },
    // A browser never lists static URLs or reads a page's HTTP status, so the server-only part of pages is always left out;
    // the development checks (validator, builders, pages) only when the validator is omitted.
    replaceModules: {
      [at('src/pages-server.js')]: at('build/stubs/pages-server-omitted.js'),
      // The hot swap of a page is for `agent-ui dev` only.
      ...(dev ? {} : { [at('src/hot.js')]: at('build/stubs/hot-omitted.js') }),
      ...(validator === 'omit'
        ? {
            [at('src/validate.js')]: at('build/stubs/validate-omitted.js'),
            [at('src/runtime-checks.js')]: at('build/stubs/runtime-checks-omitted.js'),
            [at('src/error-messages.js')]: at('build/stubs/error-messages-omitted.js'),
            [at('src/spec-checks.js')]: at('build/stubs/spec-checks-omitted.js'),
            [at('src/pages-checks.js')]: at('build/stubs/pages-checks-omitted.js'),
            [at('src/shell-checks.js')]: at('build/stubs/shell-checks-omitted.js'),
            [at('src/sync-apps-checks.js')]: at('build/stubs/sync-apps-checks-omitted.js'),
            [at('src/window-events-checks.js')]: at('build/stubs/window-events-checks-omitted.js'),
          }
        : {}),
    },
    minify: !dev,
    hash: !dev,
  };
};
