// Runs the examples as the standalone projects they are. Each example has its own package.json, depends on this package
// the way a user's project does (`"@ehtb/agent-ui": "file:../.."`, a symlink in its own node_modules), and is built and tested
// with the installed `agent-ui` command and imports only.
//
//   node test/run-examples.mjs                    install and test every example that needs nothing from a registry
//   node test/run-examples.mjs --all              also the ones with their own dependencies (with-express, ...): needs network
//   node test/run-examples.mjs run <name> [script] [args]    default script: start (build, then serve). e.g. run events, run todomvc build
//
// Installing offline works for `file:` dependencies only; an example with registry dependencies needs `npm install`
// to reach the registry (use --all, or run npm install inside that example yourself).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const examplesRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../examples');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const readExamples = () =>
  readdirSync(examplesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(examplesRoot, entry.name, 'package.json')))
    .map((entry) => {
      const manifest = JSON.parse(readFileSync(join(examplesRoot, entry.name, 'package.json'), 'utf8'));
      const own = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).filter((name) => name !== '@ehtb/agent-ui');
      return { name: entry.name, directory: join(examplesRoot, entry.name), standalone: own.length === 0, scripts: manifest.scripts ?? {} };
    });

const run = (example, args) => spawnSync(npm, args, { cwd: example.directory, stdio: 'inherit' }).status === 0;

const install = (example) => {
  // Linked means the package is there AND its command is: a hand-made symlink has no node_modules/.bin/agent-ui, and then `npm start` fails with "agent-ui: command not found".
  const linked = existsSync(join(example.directory, 'node_modules/@ehtb/agent-ui/package.json')) && existsSync(join(example.directory, 'node_modules/.bin/agent-ui'));
  if (linked && example.standalone) return true;
  return run(example, ['install', '--no-audit', '--no-fund', ...(example.standalone ? ['--offline'] : [])]);
};

const [command, ...rest] = process.argv.slice(2).filter((argument) => argument !== '--all');
const all = process.argv.includes('--all');
const examples = readExamples();

if (command === 'run') {
  const [name, script = 'start', ...scriptArguments] = rest;
  const example = examples.find((candidate) => candidate.name === name);
  if (!example) {
    console.error(`unknown example "${name}". Examples: ${examples.map((candidate) => candidate.name).join(', ')}`);
    process.exit(1);
  }
  if (!script || !(script in example.scripts)) {
    console.error(`example "${name}" has no script "${script}". Scripts: ${Object.keys(example.scripts).join(', ')}`);
    process.exit(1);
  }
  process.exit(install(example) && run(example, ['run', script, ...(scriptArguments.length ? ['--', ...scriptArguments] : [])]) ? 0 : 1);
}

const failed = [];
for (const example of examples) {
  if (!example.standalone && !all) {
    console.log(`\n== ${example.name}: skipped (has its own dependencies; run with --all or npm install inside it)`);
    continue;
  }
  console.log(`\n== ${example.name}`);
  if (!install(example) || !run(example, ['test'])) failed.push(example.name);
}
if (failed.length) {
  console.error(`\nexamples failed: ${failed.join(', ')}`);
  process.exit(1);
}
