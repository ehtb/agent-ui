// The instructions that tell an agent working in a project how to use agent-ui, shared by `agent-ui init` (writes them) and
// `agent-ui check` (notes when they are missing). The text is written once, in the package's docs/AGENT-RULES.md between two
// markers (the root AGENTS.md is for work on the framework itself), and a project gets a copy between its own markers, so a
// later `init` replaces only that part.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { packageName } from '../build/package-name.mjs';

export const INSTRUCTION_FILE = 'AGENTS.md';
export const PROJECT_START = '<!-- agent-ui:start -->';
export const PROJECT_END = '<!-- agent-ui:end -->';
const SOURCE_START = '<!-- agent-ui:project-block:start -->';
const SOURCE_END = '<!-- agent-ui:project-block:end -->';

export const packageRoot = join(import.meta.dirname, '..');

// The block for a project: the text of the package's docs/AGENT-RULES.md between its markers, with the package name filled in,
// wrapped in the markers of the project's file.
export const projectBlock = () => {
  const source = readFileSync(join(packageRoot, 'docs', 'AGENT-RULES.md'), 'utf8');
  const start = source.indexOf(SOURCE_START);
  const end = source.indexOf(SOURCE_END);
  if (start === -1 || end === -1) throw new Error(`docs/AGENT-RULES.md of the package has no block between ${SOURCE_START} and ${SOURCE_END}. Restore the two markers around the rules a project gets`);
  const text = source.slice(start + SOURCE_START.length, end).trim().replaceAll('{package}', packageName);
  return `${PROJECT_START}\n${text}\n${PROJECT_END}`;
};

// The text of a file with the block in it: its own block replaced, or the block added at the end.
export const withProjectBlock = (existing, block) => {
  const start = existing.indexOf(PROJECT_START);
  const end = existing.indexOf(PROJECT_END);
  if (start !== -1 && end > start) return existing.slice(0, start) + block + existing.slice(end + PROJECT_END.length);
  // One marker without the other is a block somebody half deleted: adding a second block would leave the stray marker, and
  // replacing from it would take text that is not ours.
  if (start !== -1 || end !== -1) throw new Error(`AGENTS.md has ${start !== -1 ? PROJECT_START : PROJECT_END} without ${start !== -1 ? PROJECT_END : PROJECT_START}. Delete the stray marker, or restore the missing one around the old block, and run agent-ui init again`);
  return existing === '' ? `${block}\n` : `${existing.replace(/\n*$/, '\n\n')}${block}\n`;
};

// True when AGENTS.md of the project root says anything about agent-ui, by init or written by hand.
export const mentionsAgentUi = (root) => existsSync(join(root, INSTRUCTION_FILE)) && /agent-ui/.test(readFileSync(join(root, INSTRUCTION_FILE), 'utf8'));
