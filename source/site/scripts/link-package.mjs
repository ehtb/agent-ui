// npm installs a `file:` dependency as a symlink but does not link its command into node_modules/.bin, so `npm run
// build` cannot find `agent-ui`. This script links the command after `npm install`. It also repairs the package symlink
// if it is stale (an older package.json pointed it at the wrong place). A normal registry install already has both, and
// the script leaves it alone.
import { existsSync, lstatSync, mkdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(siteRoot, 'package.json'), 'utf8'));
const dependency = manifest.dependencies?.['@ehtb/agent-ui'] ?? '';
const packagePath = resolve(siteRoot, 'node_modules/@ehtb/agent-ui');
const expectedPath = dependency.startsWith('file:')
  ? resolve(siteRoot, dependency.slice('file:'.length))
  : packagePath;

const pointsAtExpectedPackage = () => {
  try {
    return realpathSync(packagePath) === realpathSync(expectedPath);
  } catch {
    return false;
  }
};

if (dependency.startsWith('file:') && !pointsAtExpectedPackage()) {
  rmSync(packagePath, { recursive: true, force: true });
  mkdirSync(dirname(packagePath), { recursive: true });
  symlinkSync(relative(dirname(packagePath), expectedPath), packagePath, 'dir');
  console.log(`linked node_modules/@ehtb/agent-ui to ${expectedPath}`);
}

const commandPath = resolve(packagePath, 'bin/agent-ui.mjs');
const binDirectory = resolve(siteRoot, 'node_modules/.bin');
const binPath = resolve(binDirectory, 'agent-ui');
const commandExists = () => {
  try {
    lstatSync(binPath);
    return true;
  } catch {
    return false;
  }
};

if (existsSync(commandPath) && !commandExists()) {
  mkdirSync(binDirectory, { recursive: true });
  symlinkSync(relative(binDirectory, commandPath), binPath);
  console.log('linked node_modules/.bin/agent-ui');
}
