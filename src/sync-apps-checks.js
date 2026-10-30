// The development checks of syncApps (src/sync-apps.js): both ends are checked when the sync is made, with the fix in every message.
// Production builds replace this module with a stub whose function does nothing (build/stubs/sync-apps-checks-omitted.js): a shipped app
// was checked in development, as with src/spec-checks.js.
import { didYouMean, fail } from './messages.js';
import { isPlainObject } from './spec-core.js';

const SYNC_KEYS = 'from to watch action args'.split(' ');

export const checkSyncApps = (options) => {
  if (!isPlainObject(options)) fail('syncApps', 'the argument must be an object', 'Write syncApps({ from, to, watch: [...], action: "app.verb", args: { argument: "namespace.key" } })');
  for (const key of Object.keys(options)) {
    if (!SYNC_KEYS.includes(key)) fail('syncApps', `unknown key "${key}"`, `${didYouMean(key, SYNC_KEYS)}Allowed keys: ${SYNC_KEYS.join(', ')}`);
  }
  const { from, to, watch, action, args } = options;
  const ends = { from, to };
  for (const name of Object.keys(ends)) {
    const end = ends[name];
    if (!end || typeof end.watch !== 'function' || typeof end.dispatch !== 'function') fail('syncApps', `"${name}" must be an app, the value that app() returned`, `Pass the result of app(...) for "${name}"`);
  }
  if (from === to) fail('syncApps', '"from" and "to" are the same app', 'syncApps connects two separate apps. Inside one app, use derive (to read) or calls (to cause a change in another namespace)');
  if (!Array.isArray(watch) || !watch.length) fail('syncApps', '"watch" must be a non-empty list of qualified keys of the "from" app', "Write watch: ['cart.count']");
  const sourceKeys = from.keys();
  for (const key of watch) {
    if (!sourceKeys.includes(key)) fail('syncApps', `watch key "${key}" is not a state key or derived value of the "from" app`, `${didYouMean(String(key), sourceKeys)}Keys: ${sourceKeys.join(', ') || 'none'}`);
  }
  const targetActions = to.actions();
  if (!(action in targetActions)) fail('syncApps', `action "${action}" does not exist in the "to" app`, `${didYouMean(String(action), Object.keys(targetActions))}Actions: ${Object.keys(targetActions).join(', ') || 'none'}`);
  if (!isPlainObject(args)) fail('syncApps', '"args" must map each argument of the action to a watched key', `Write args: { ${Object.keys(targetActions[action]).map((name) => `${name}: '${watch[0]}'`).join(', ') || ''} }`);
  const declared = Object.keys(targetActions[action]);
  for (const name of declared) {
    if (!(name in args)) fail('syncApps', `${action} declares the argument "${name}", but "args" does not supply it`, `Add ${name}: '<one of the watched keys>' to args`);
  }
  for (const [name, key] of Object.entries(args)) {
    if (!declared.includes(name)) fail('syncApps', `"args" supplies "${name}", but ${action} declares: ${declared.join(', ') || 'no arguments'}`, `${didYouMean(name, declared)}Use only the declared argument names`);
    if (!watch.includes(key)) fail('syncApps', `args.${name} reads "${key}", which is not in "watch"`, `${didYouMean(String(key), watch)}Add it to watch, or use one of: ${watch.join(', ')}`);
  }
};
