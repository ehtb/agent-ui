// `agent-ui init`: writes the instructions for agents into the project, so an agent that only reads the project's own
// AGENTS.md still learns the rules of agent-ui (the guide in node_modules is not loaded by an agent).
// The source is docs/AGENT-RULES.md of the package; the root AGENTS.md is for work on the framework and is not published.
//   agent-ui init       project root = current directory
// The block goes into AGENTS.md of the project root: the file is created when it does not exist, and when it does, its own block is
// replaced (or the block is added at the end) and the rest is untouched. Run it again after an upgrade to refresh the block.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseOrExit } from './arguments.mjs';
import { INSTRUCTION_FILE, packageRoot, projectBlock, withProjectBlock } from './agent-instructions.mjs';
import { isMain } from './is-main.mjs';

// Returns { file, action } with action 'created' or 'updated'.
export const initProject = ({ root = process.cwd() } = {}) => {
  if (resolve(root) === resolve(packageRoot)) {
    throw new Error('agent-ui init: this directory is the framework itself, whose docs/AGENT-RULES.md is the source of the block. Run it in a project that uses agent-ui');
  }
  const path = join(root, INSTRUCTION_FILE);
  const existed = existsSync(path);
  writeFileSync(path, withProjectBlock(existed ? readFileSync(path, 'utf8') : '', projectBlock()));
  return { file: INSTRUCTION_FILE, action: existed ? 'updated' : 'created' };
};

if (isMain(import.meta.url)) {
  parseOrExit(process.argv.slice(2), {}, { command: 'agent-ui init' });
  try {
    const { file, action } = initProject();
    console.log(`${action} ${file}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
