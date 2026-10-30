// `agent-ui explain [topic]`: the one valid form for a task, printed for whoever is about to write it (an agent most of all).
//   agent-ui explain               the recipes (whole pages) and the topics (parts of the grammar)
//   agent-ui explain <recipe>      what the recipe builds, when to use it, and its files in full
//   agent-ui explain <topic>       the one valid form of that part of the grammar, with a working example
//   agent-ui explain 'AUI0202 {"action":"todos.add"}'   what an error of a production build says (the code, optionally with its details)
// The recipes are the cookbook/ folder of the package: pages that `agent-ui check` renders and test/examples/cookbook.test.mjs drives.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { didYouMean } from '../src/messages.js';
import { parseOrExit } from './arguments.mjs';
import { isMain } from './is-main.mjs';
import { topics } from './explain-topics.mjs';
import { decodeError } from '../src/error-messages.js';

const cookbookDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', 'cookbook');

export const readRecipes = async () => (await import(pathToFileURL(join(cookbookDirectory, 'recipes.mjs')).href)).recipes;

const indent = (text) => text.split('\n').map((line) => (line ? `  ${line}` : line)).join('\n');

// An error of a production build, "AUI0202 {...}": what the code means and, with its details, the sentence the development build says.
const explainError = (message) => {
  const decoded = decodeError(message);
  if (!decoded.title) {
    const error = new Error(`agent-ui explain: ${decoded.code} is not an error code of this version. The codes are in docs/API.md, section 9`);
    error.usage = true;
    throw error;
  }
  return [`${decoded.code}: ${decoded.title}`, '', decoded.text ?? 'Give the details after the code to read the full sentence: agent-ui explain \'' + decoded.code + ' {"key":"value"}\' (the details are in the error\'s message and in error.details).', ...(decoded.details ? ['', `Details: ${JSON.stringify(decoded.details)}`] : [])].join('\n');
};

export const explain = async (name) => {
  if (typeof name === 'string' && /^AUI\d{4}\b/.test(name)) return explainError(name);
  const recipes = await readRecipes();
  if (name === undefined) {
    const width = Math.max(...recipes.map((recipe) => recipe.name.length), ...topics.map((topic) => topic.name.length));
    return [
      'agent-ui explain <name> prints the one valid form for it.',
      'First time here? agent-ui explain start prints the first steps.',
      '',
      'Recipes (whole pages, in cookbook/; copy the files and rename the namespaces):',
      ...recipes.map((recipe) => `  ${recipe.name.padEnd(width)}  ${recipe.title}`),
      '',
      'Topics (parts of the grammar and the workflow):',
      ...topics.map((topic) => `  ${topic.name.padEnd(width)}  ${topic.title}`),
    ].join('\n');
  }
  const recipe = recipes.find((candidate) => candidate.name === name);
  if (recipe) {
    return [
      `${recipe.name}: ${recipe.title}`,
      '',
      recipe.use,
      '',
      ...recipe.files.flatMap((file) => [`--- ${file} ---`, readFileSync(join(cookbookDirectory, file), 'utf8').trimEnd(), '']),
    ].join('\n');
  }
  const topic = topics.find((candidate) => candidate.name === name);
  if (topic) {
    return [`${topic.name}: ${topic.title}`, '', indent(topic.form), ...(topic.example ? ['', 'Example:', indent(topic.example)] : []), '', `Reference: ${topic.see}`].join('\n');
  }
  const names = [...recipes.map((candidate) => candidate.name), ...topics.map((candidate) => candidate.name)];
  const error = new Error(`agent-ui explain: there is no recipe or topic "${name}". ${didYouMean(name, names)}Run agent-ui explain for the list: ${names.join(', ')}`);
  error.usage = true;
  throw error;
};

if (isMain(import.meta.url)) {
  const options = parseOrExit(process.argv.slice(2), {}, { command: 'agent-ui explain', positional: true });
  if (options._.length > 1) {
    console.error(`agent-ui explain: one name at most, got ${options._.length}. Usage: agent-ui explain [recipe or topic]`);
    process.exit(2);
  }
  try {
    console.log(await explain(options._[0]));
  } catch (error) {
    if (!error.usage) throw error;
    console.error(error.message);
    process.exit(2);
  }
}
