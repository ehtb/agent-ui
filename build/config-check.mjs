// Checks the object that build.config.mjs exports, before anything is built, so that a misspelt or misplaced option is an
// error with the fix in it instead of a setting that is silently ignored.
//
//   const problems = checkConfig(config);     // [] or a list of sentences: where, what is wrong, what to write
//
// Used by loadConfig (so every command reads a checked config) and by tests. The keys are the ones docs/BUILD.md lists.
// Which pages exist is not configured: it follows from the folders below pages/ (build/pages.mjs).
import { didYouMean } from '../src/messages.js';

const KEYS = ['outDir', 'assetsDir', 'publicDir', 'hash', 'minify', 'sourceMaps', 'transform', 'manualChunks', 'minSharedChunkBytes', 'replaceModules', 'api', 'fetchFunction', 'renderTimeoutMs', 'stateForBrowser'];
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value) => typeof value === 'string' && value !== '';

export const checkConfig = (config) => {
  if (!isObject(config)) return [`build config: the file must export an object, or a function that returns one (got ${config === null ? 'null' : typeof config}). Write: export default ({ dev }) => ({ outDir: 'dist' })`];
  const problems = [];
  const add = (where, problem, fix) => problems.push(`build config ${where}: ${problem}. ${fix}`);

  for (const key of Object.keys(config)) {
    if (!KEYS.includes(key)) add(`key "${key}"`, 'unknown option', `${didYouMean(key, KEYS)}Allowed options: ${KEYS.join(', ')}`);
  }

  for (const key of ['outDir', 'assetsDir', 'api']) {
    if (config[key] !== undefined && !isText(config[key])) add(`"${key}"`, 'must be a non-empty string', `Write ${key}: '${key === 'outDir' ? 'dist' : key === 'assetsDir' ? 'assets' : 'api.js'}'`);
  }
  for (const key of ['hash', 'minify', 'sourceMaps']) {
    if (config[key] !== undefined && typeof config[key] !== 'boolean') add(`"${key}"`, 'must be true or false', `Write ${key}: true`);
  }
  if (config.sourceMaps && config.transform) add('"sourceMaps"', 'cannot be combined with "transform": the map describes the lines this build writes, and a minifier rewrites them', 'Set sourceMaps: false and have the minifier write its own map (esbuild: sourcemap: true)');
  if (config.publicDir !== undefined && config.publicDir !== null && !isText(config.publicDir) && !(Array.isArray(config.publicDir) && config.publicDir.every(isText))) {
    add('"publicDir"', 'must be a directory name or a list of them', "Write publicDir: 'public'");
  }
  for (const key of ['transform', 'fetchFunction', 'stateForBrowser']) {
    if (config[key] !== undefined && config[key] !== null && typeof config[key] !== 'function') add(`"${key}"`, 'must be a function', `Write ${key}: (…) => …`);
  }
  if (config.renderTimeoutMs !== undefined && (!Number.isInteger(config.renderTimeoutMs) || config.renderTimeoutMs < 1)) {
    add('"renderTimeoutMs"', 'must be a whole number of milliseconds, 1 or more', 'Write renderTimeoutMs: 2000 (the default), or a larger budget for a page whose data is slow');
  }
  if (config.manualChunks !== undefined) {
    if (!isObject(config.manualChunks) || !Object.values(config.manualChunks).every((files) => Array.isArray(files) && files.every(isText))) add('"manualChunks"', 'must map a chunk name to a list of module paths', "Write manualChunks: { vendor: ['lib/a.js', 'lib/b.js'] }");
  }
  if (config.minSharedChunkBytes !== undefined && (!Number.isInteger(config.minSharedChunkBytes) || config.minSharedChunkBytes < 0)) {
    add('"minSharedChunkBytes"', 'must be a whole number of bytes, 0 or more', 'Write minSharedChunkBytes: 4096 (the default), or 0 to keep every shared chunk as it is');
  }
  if (config.replaceModules !== undefined) {
    if (!isObject(config.replaceModules) || !Object.values(config.replaceModules).every(isText)) add('"replaceModules"', 'must map a module path to the path that replaces it', "Write replaceModules: { 'lib/original.js': 'lib/stub.js' }");
  }
  return problems;
};
