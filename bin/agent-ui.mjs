#!/usr/bin/env node
// Command line entry: `agent-ui <command> [options]`. The project root is the current directory.
//   build    production build (add --dev for a readable development build)       cli/build.mjs
//   dev      development server with hot reload                                  cli/dev.mjs
//   serve    serve the built site: pages rendered per request, the API, the files  cli/serve.mjs
//   check    render every page in development mode and report problems           cli/check.mjs
//   schema   write the JSON Schema of the spec grammar                           cli/schema.mjs
//   explain  print the one valid form of a recipe or a part of the grammar       cli/explain.mjs
//   init     write the instructions for agents into the project's AGENTS.md      cli/init.mjs
// Options after the command are passed on unchanged (--config=<file>, --port=<n>, ...); see docs/BUILD.md.
import { fileURLToPath, pathToFileURL } from 'node:url';

const COMMANDS = {
  build: 'build.mjs',
  dev: 'dev.mjs',
  serve: 'serve.mjs',
  check: 'check.mjs',
  schema: 'schema.mjs',
  explain: 'explain.mjs',
  init: 'init.mjs',
};

const [command, ...rest] = process.argv.slice(2);
const script = Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : undefined;
if (!script) {
  console.error(`${command ? `unknown command "${command}"` : 'no command given'}. Commands: ${Object.keys(COMMANDS).join(', ')}`);
  process.exit(command ? 1 : 0);
}
const scriptPath = fileURLToPath(new URL(`../cli/${script}`, import.meta.url));
process.argv = [process.argv[0], scriptPath, ...rest]; // the tool sees its own path and options, as if started directly
await import(pathToFileURL(scriptPath).href);
