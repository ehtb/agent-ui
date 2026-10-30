// The development checks of defineShell (src/shell.js): every mistake in a shell is reported when it is defined, with the fix. Production
// builds replace this module with a stub whose function does nothing (build/stubs/shell-checks-omitted.js): a shipped app was checked in
// development, as with src/pages-checks.js.
import { IDENTIFIER, NAMESPACE_KEYS, RESERVED_NAMESPACE } from './namespaces.js';
import { didYouMean, fail } from './messages.js';
import { isPlainObject } from './spec-core.js';

const SHELL_KEYS = ['name', 'namespaces', 'plugins', 'reads', 'debug'];
const READ_KEYS = ['watch', 'action', 'args'];

export const checkShell = (definition, route) => {
  if (!isPlainObject(definition)) fail('defineShell', 'the argument must be an object', "Write defineShell({ name: 'main', namespaces, plugins, reads })");
  for (const key of Object.keys(definition)) {
    if (!SHELL_KEYS.includes(key)) fail('defineShell', `unknown key "${key}"`, `${didYouMean(key, SHELL_KEYS)}Allowed keys: ${SHELL_KEYS.join(', ')}`);
  }
  const { name, namespaces = {}, plugins = [], reads = [] } = definition;
  if (typeof name !== 'string' || !IDENTIFIER.test(name)) fail('defineShell', `name ${JSON.stringify(name)} is not allowed`, "Write letters and digits, starting with a lowercase letter: name: 'main'");
  const where = `shell "${name}"`;
  if (!isPlainObject(namespaces)) fail(where, `"namespaces" must be an object { name: { ${NAMESPACE_KEYS.join(', ')} } }`, 'Write namespaces: { frame: { state: {}, actions: {} } }');
  for (const [namespace, declaration] of Object.entries(namespaces)) {
    if (namespace === RESERVED_NAMESPACE) fail(where, `namespace "${namespace}" is reserved`, `The framework owns "${RESERVED_NAMESPACE}" in a shell (route.path, the path of the page that is showing). Call it something else, for example "frame"`);
    if (!IDENTIFIER.test(namespace)) fail(where, `namespace name ${JSON.stringify(namespace)} is not allowed`, 'Names are letters and digits, starting with a lowercase letter');
    if (!isPlainObject(declaration)) fail(where, `namespace "${namespace}" must be an object { ${NAMESPACE_KEYS.join(', ')} }`, 'Write the namespace as in app()');
  }
  if (!Array.isArray(plugins) || plugins.some((plugin) => typeof plugin !== 'function')) fail(where, '"plugins" must be a list of functions (environment) => plugin', 'Write plugins: [withNavigation] (withNavigation comes from @ehtb/agent-ui/navigation)');
  if (!Array.isArray(reads)) fail(where, '"reads" must be a list of { watch, action, args }', "Write reads: [{ watch: ['cart.count'], action: 'frame.setCartCount', args: { count: 'cart.count' } }]");
  const actions = Object.entries({ route, ...namespaces }).flatMap(([namespace, declaration]) => Object.keys(declaration.actions ?? {}).map((verb) => `${namespace}.${verb}`));
  reads.forEach((read, index) => {
    const here = `${where} reads[${index}]`;
    if (!isPlainObject(read)) fail(here, 'must be an object { watch, action, args }', "Write { watch: ['cart.count'], action: 'frame.setCartCount', args: { count: 'cart.count' } }");
    for (const key of Object.keys(read)) {
      if (!READ_KEYS.includes(key)) fail(here, `unknown key "${key}"`, `${didYouMean(key, READ_KEYS)}Allowed keys: ${READ_KEYS.join(', ')}`);
    }
    if (!actions.includes(read.action)) fail(here, `action ${JSON.stringify(read.action)} is not an action of the shell`, `${didYouMean(String(read.action), actions)}Actions of the shell: ${actions.join(', ')}`);
  });
};
