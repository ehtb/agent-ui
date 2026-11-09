// Declared async resources: network requests described as data, whose lifecycle goes through logged actions.
//
// A resource belongs to the namespace that declares it (`resources: [...]` next to `state`, `derive` and `actions`), and the
// plugin `resources(fetchFunction, { win })` runs every namespace's resources. Inside a resource, keys and actions of its own
// namespace are written without the prefix and keys of other namespaces with it, exactly as in an action:
//
//   namespaces: { items: { state: { query: '', list: [], status: 'idle', error: '' }, actions: { loading, loaded, failed }, resources: [{
//     watch: ['query', 'filters.category'],      keys the request depends on: own keys plain, other namespaces' keys as "namespace.key"
//     request: (values) => ({ url, method?, headers?, body? }) | null     values has the keys as written: values.query, values['filters.category']; null = nothing to load right now
//     onStart: 'loading',                        action of this namespace with args {}
//     onSuccess: 'loaded',                       action of this namespace with args {data: 'json'}
//     onError: 'failed',                         action of this namespace with args {message: 'string'}
//     onCancel?: 'cancelled',                    optional action with args {}, run when `request` returns null while a request is in flight
//     onIdle?: 'idle',                           optional action with args {}, run when `request` returns null after a request started or settled (after onCancel when one was in flight)
//     owns?: ['list', 'status', 'error'],        optional state keys of this namespace that only the lifecycle actions may write
//     response?: (data) => void,                 optional check of the JSON the request answers, written with the library you like (zod: `Items.parse`): it throws when the data does not fit, and then onError runs with the message instead of onSuccess
//     delayMs?: 200,                             debounce, for search-as-you-type
//     revalidate?: 'never',                      optional: the server already ran this resource and its result is in the state the
//                                                document carries; do not run it again on mount in the browser. A later change to a
//                                                watched key still loads. Requires `owns` (so the server's output is known).
//   }] } }
//
// Why this shape: the network is the only non-deterministic part of an app, and here it is reduced to logged actions
// with plain data. The action log therefore contains the responses, so `replay()` reproduces the exact state without
// touching the network (resources stay quiet while api.replaying is true), and tests drive an app with a fake fetch.
// A failed response with a JSON body {message} reports that message; otherwise "HTTP <status>".
// Only the latest request counts: a slower, older response never overwrites a newer one. Every request gets an
// AbortSignal (`init.signal`), aborted when a newer request replaces it or `request` returns null, so the network work
// stops too; the aborted request's rejection is never reported. A fetchFunction that ignores `signal` still works.

import { didYouMean, fail, failOwnedTwice } from './messages.js';
import { markPagePlugin } from './spec-core.js';

const describeArgs = (args) => JSON.stringify(args || {});
const REQUEST_KEYS = ['url', 'method', 'headers', 'body'];
const RESOURCE_KEYS = ['watch', 'request', 'onStart', 'onSuccess', 'onError', 'onCancel', 'onIdle', 'owns', 'response', 'delayMs', 'revalidate'];
const REVALIDATE_VALUES = ['never'];
// What `request` answered, checked when it answers: a plain object with a `url` and nothing the fetch would silently ignore.
const checkRequest = (where, request) => {
  if (typeof request !== 'object' || Array.isArray(request)) fail(where, `request() returned ${request === undefined ? 'undefined' : JSON.stringify(request)}`, 'Return { url, method?, headers?, body? }, or null for "nothing to load right now"');
  if (typeof request.url !== 'string' || !request.url) fail(where, `request() returned no "url" (got ${JSON.stringify(request.url)})`, 'Return { url: "/api/items" }; url is a non-empty string');
  for (const key of Object.keys(request)) if (!REQUEST_KEYS.includes(key)) fail(where, `request() returned the unknown key "${key}"`, `${didYouMean(key, REQUEST_KEYS)}Allowed keys: ${REQUEST_KEYS.join(', ')}`);
};
const lifecycleOf = (definition) => [definition.onStart, definition.onSuccess, definition.onError, definition.onCancel, definition.onIdle].filter(Boolean);

// The plugin as a page lists it (`plugins: [withResources]`, src/pages.js): a page that imports it is the page that gets the
// resources code, and a page without resources downloads none of it.
export const withResources = markPagePlugin(function withResources({ fetchFunction, win, serverRendered = false }) {
  return resources(fetchFunction, { win, serverRendered });
});

// `serverRendered` is true when the app started from state a server wrote into the document (src/hydrate.js): a resource with
// `revalidate: 'never'` then trusts that state instead of loading it a second time on mount.
export const resources = (fetchFunction, { win = globalThis, serverRendered = false } = {}) => (api) => {
  // The page form (withResources) passes the environment's fetch; `resources` itself takes the function to call, not an environment.
  // A page that lists `resources` instead of `withResources` reaches this with the environment object, and is told the fix. A null
  // or other missing function is named by the resource's own check below, with the resource it belongs to.
  if (fetchFunction !== null && typeof fetchFunction === 'object') fail('resources', 'fetchFunction is an object, not a function', "In a page.js write `plugins: [withResources]`, which passes the environment's fetchFunction; in app() write resources(fetchFunction), the function itself");
  api.claim('resources');
  const declared = api.actions();
  const stateKeys = Object.entries(api.state()).flatMap(([namespace, values]) => Object.keys(values).map((key) => `${namespace}.${key}`));
  const knownKeys = api.keys();
  const ownerByKey = new Map();
  // Every mistake names the namespace and the resource (by position and, when it has one, its onStart action) and says what to write.
  const describe = (namespace, definition, index) => `namespace "${namespace}" resource #${index + 1}${typeof definition?.onStart === 'string' ? ` (${namespace}.${definition.onStart})` : ''}`;
  const qualify = (namespace, name) => (name.includes('.') ? name : `${namespace}.${name}`);
  const checkDefinition = (namespace, definition, index) => {
    const where = describe(namespace, definition, index);
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) fail(where, 'a resource must be a plain object', "Write { watch: ['key'], request: (values) => ({ url }), onStart, onSuccess, onError }");
    for (const key of Object.keys(definition)) {
      if (!RESOURCE_KEYS.includes(key)) fail(where, `unknown key "${key}"`, `${didYouMean(key, RESOURCE_KEYS)}Allowed keys: ${RESOURCE_KEYS.join(', ')}`);
    }
    for (const key of ['watch', 'request', 'onStart', 'onSuccess', 'onError']) {
      if (definition[key] === undefined) fail(where, `"${key}" is missing`, `Add "${key}" (required: watch, request, onStart, onSuccess, onError)`);
    }
    if (!Array.isArray(definition.watch)) fail(where, '"watch" must be a list of state or derived keys', "Write watch: ['query']; use [] to run once at mount");
    for (const key of definition.watch) {
      if (typeof key === 'string' && key.startsWith(`${namespace}.`)) fail(where, `watch key "${key}" is in this namespace`, `Write "${key.slice(namespace.length + 1)}" without the namespace; only other namespaces are written with it`);
      const qualified = typeof key === 'string' ? qualify(namespace, key) : key;
      // The namespace's own keys are written plain, so they are suggested and listed plain.
      const writtenKeys = knownKeys.map((known) => (known.startsWith(`${namespace}.`) ? known.slice(namespace.length + 1) : known));
      if (!knownKeys.includes(qualified)) fail(where, `watch key "${key}" is not a state key or derived value`, `${didYouMean(key, writtenKeys)}Known keys: ${writtenKeys.join(', ')}`);
    }
    if (typeof definition.request !== 'function') fail(where, '"request" must be a function', 'Write request: (values) => ({ url }) or null for "nothing to load"');
    if (definition.response !== undefined && typeof definition.response !== 'function') fail(where, `"response" is ${JSON.stringify(definition.response)}`, 'Write a function that throws when the data does not fit, for example response: Items.parse (zod), or leave it out');
    if (definition.delayMs !== undefined && !(Number.isFinite(definition.delayMs) && definition.delayMs >= 0)) fail(where, `"delayMs" is ${JSON.stringify(definition.delayMs)}`, 'Write a number of milliseconds, 0 or more (the debounce of search-as-you-type; 0 loads at once), or leave it out');
    if (definition.revalidate !== undefined && !REVALIDATE_VALUES.includes(definition.revalidate)) {
      fail(where, `"revalidate" is ${JSON.stringify(definition.revalidate)}`, `Write revalidate: 'never' to trust the state a server render embedded, or leave it out (the resource runs on mount as usual). Allowed values: ${REVALIDATE_VALUES.join(', ')}`);
    }
    if (definition.revalidate === 'never' && !definition.owns?.length) {
      fail(where, '"revalidate: \'never\'" needs "owns"', "List the state keys the server render wrote, for example owns: ['items', 'status']; without them a later state change cannot be told apart from the first server-rendered one");
    }
  };
  const requireAction = (namespace, definition, index, field, expectedArgs) => {
    const actionName = definition[field];
    const where = describe(namespace, definition, index);
    if (typeof actionName !== 'string' || actionName.includes('.')) fail(where, `${field} must be the verb of an action of "${namespace}", got ${JSON.stringify(actionName)}`, `Write the action's name without the namespace, for example ${field}: 'loading'; a resource drives actions of its own namespace`);
    const qualified = qualify(namespace, actionName);
    if (!(qualified in declared)) {
      const verbs = Object.keys(declared).filter((name) => name.startsWith(`${namespace}.`)).map((name) => name.slice(namespace.length + 1));
      fail(where, `${field} action "${actionName}" does not exist in "${namespace}"`, `${didYouMean(actionName, verbs)}Declare it in the actions of "${namespace}": ${actionName}: { args: ${describeArgs(expectedArgs)}, run: (store${Object.keys(expectedArgs).length ? ', args' : ''}) => ... }`);
    }
    if (describeArgs(declared[qualified]) !== describeArgs(expectedArgs)) {
      fail(where, `action ${qualified} must declare args ${describeArgs(expectedArgs)} (found ${describeArgs(declared[qualified])})`, `Change the args of '${qualified}' to ${describeArgs(expectedArgs)}`);
    }
  };

  const definitionsByNamespace = Object.entries(api.namespaces()).flatMap(([namespace, declaration]) => (declaration.resources ?? []).map((definition, index) => ({ namespace, definition, index })));

  // Found at install, not at the first request: a page that lists resources needs something to fetch with.
  if (definitionsByNamespace.length && typeof fetchFunction !== 'function') {
    const [{ namespace, definition, index }] = definitionsByNamespace;
    fail(describe(namespace, definition, index), `there is no fetch function (got ${fetchFunction === null ? 'null' : typeof fetchFunction})`, 'Pass one: resources(fetch) for a plain app, or give the page environment a fetchFunction (src/pages.js, server/render-page.js); tests pass createFakeFetch(...)');
  }

  definitionsByNamespace.forEach(({ namespace, definition, index }) => {
    const where = describe(namespace, definition, index);
    checkDefinition(namespace, definition, index);
    requireAction(namespace, definition, index, 'onStart', {});
    requireAction(namespace, definition, index, 'onSuccess', { data: 'json' });
    requireAction(namespace, definition, index, 'onError', { message: 'string' });
    if (definition.onCancel !== undefined) requireAction(namespace, definition, index, 'onCancel', {});
    if (definition.onIdle !== undefined) requireAction(namespace, definition, index, 'onIdle', {});
    if (definition.owns !== undefined) {
      if (!Array.isArray(definition.owns)) fail(where, '"owns" must be a list of state keys', "Write owns: ['list', 'status']");
      const ownKeys = stateKeys.filter((key) => key.startsWith(`${namespace}.`)).map((key) => key.slice(namespace.length + 1));
      for (const key of definition.owns) {
        if (typeof key === 'string' && key.includes('.')) fail(where, `owns key "${key}" is written with a namespace`, `A resource owns state of its own namespace only; write "${key.slice(key.indexOf('.') + 1)}" without it, or move the resource to the namespace that holds "${key}"`);
        if (key in api.derived()[namespace]) fail(where, `owns key "${key}" is a derived value, not a state key`, 'List only state keys in "owns"');
        if (!ownKeys.includes(key)) fail(where, `owns key "${key}" is not a state key of "${namespace}"`, `${didYouMean(key, ownKeys)}State keys of "${namespace}": ${ownKeys.join(', ')}`);
        if (definition.watch.includes(key)) fail(where, `key "${key}" is in both "watch" and "owns"`, `"watch" is the input and "owns" is the output; remove "${key}" from one of them`);
        if (ownerByKey.has(`${namespace}.${key}`)) failOwnedTwice(where, key, ownerByKey.get(`${namespace}.${key}`));
        ownerByKey.set(`${namespace}.${key}`, where);
      }
    }
  });

  definitionsByNamespace.forEach(({ namespace, definition, index }) => {
    const where = describe(namespace, definition, index);
    const lifecycleActions = lifecycleOf(definition).map((name) => qualify(namespace, name));
    const owns = definition.owns?.length
      ? {
          where,
          keys: definition.owns.map((key) => qualify(namespace, key)),
          allowedActions: lifecycleActions,
          message: (key) =>
            `store.set("${key}"): state key "${key}" is owned by ${where} and can only be written by its lifecycle actions (${lifecycleActions.join(', ')}). To change what ${where} loads, write one of its watched keys (${definition.watch.join(', ') || 'none'}) from the action; the resource then loads again and its lifecycle actions update the owned keys`,
        }
      : undefined;
    const dispatchLifecycle = (field, args) => api.dispatch(qualify(namespace, definition[field]), args);

    let latestRequestId = 0;
    let timer = null;
    let controller = null; // of the request in flight; null when nothing is in flight
    let active = false; // true once a request has started and until a null request resets it
    let firstRun = true; // the watch calls once at install: that is the load a server render may already have done

    const load = (request) => {
      if (api.replaying) return; // a timer that ends during a replay asks for nothing: the log already holds the responses
      const requestId = ++latestRequestId;
      const isCurrent = () => requestId === latestRequestId;
      controller?.abort(); // a newer request replaces the one in flight
      const ownController = new AbortController();
      controller = ownController;
      active = true;
      // A settled request is no longer in flight: a later null has nothing to cancel, only to reset via onIdle.
      const settle = () => {
        if (controller === ownController) controller = null;
      };
      dispatchLifecycle('onStart', {});
      const hasBody = request.body !== undefined;
      let answer;
      try {
        answer = fetchFunction(request.url, {
          method: request.method ?? 'GET',
          headers: hasBody ? { 'content-type': 'application/json', ...request.headers } : request.headers,
          body: hasBody ? JSON.stringify(request.body) : undefined,
          signal: ownController.signal,
        });
      } catch (error) {
        answer = Promise.reject(error); // a fetchFunction that throws before it returns a promise is a failed request, like one that rejects
      }
      Promise.resolve(answer)
        .then(async (response) => {
          if (!response.ok) {
            // Servers often explain a refusal ({"message": "..."}); use it, else the bare status.
            let message = `HTTP ${response.status}`;
            try {
              const body = await response.json();
              if (typeof body?.message === 'string' && body.message) message = body.message;
            } catch {
              // no JSON body: keep the status message
            }
            throw new Error(message);
          }
          return response.json();
        })
        .then((data) => {
          // A response that arrives while the app replays its log is not part of that log: it would be dispatched twice.
          if (isCurrent() && !api.replaying) {
            settle();
            // A response that does not fit goes to onError, so the page shows a failure instead of data it cannot use.
            let misfit = null;
            try {
              definition.response?.(data);
            } catch (error) {
              misfit = `the response from ${request.url} does not fit: ${String(error?.message ?? error)}`;
            }
            if (misfit) dispatchLifecycle('onError', { message: misfit });
            else dispatchLifecycle('onSuccess', { data });
          }
        })
        .catch((error) => {
          if (isCurrent() && !api.replaying) {
            settle();
            dispatchLifecycle('onError', { message: String(error?.message ?? error) });
          }
        });
    };

    // A replay starts: what is in flight or waiting must not arrive on top of the replayed state, whether or not a watched key changes.
    api.onReplay(() => {
      latestRequestId++;
      if (timer !== null) win.clearTimeout(timer);
      timer = null;
      controller?.abort();
      controller = null;
    });

    // A destroyed app (a page that was replaced) lets go of its timer and its request in flight: nothing it asked for may arrive late.
    api.onDestroy(() => {
      latestRequestId++;
      if (timer !== null) win.clearTimeout(timer);
      timer = null;
      controller?.abort();
      controller = null;
    });

    api.watch(
      definition.watch.map((key) => qualify(namespace, key)),
      (qualifiedValues) => {
        const isFirstRun = firstRun;
        firstRun = false;
        if (api.replaying) return;
        // The server already ran this resource and wrote its output into the state the document carries. Trust it on mount;
        // a later change to a watched key is a real request and loads as usual.
        if (isFirstRun && definition.revalidate === 'never' && serverRendered) return;
        // The request reads its values under the names it wrote in `watch`.
        const request = definition.request(Object.fromEntries(definition.watch.map((key) => [key, qualifiedValues[qualify(namespace, key)]])));
        if (request !== null) checkRequest(where, request); // null is "nothing to load"; 0, '', false and undefined are mistakes
        if (timer !== null) win.clearTimeout(timer);
        timer = null;
        if (!request) {
          latestRequestId++; // cancels whatever is in flight
          if (controller) {
            controller.abort();
            controller = null;
            if (definition.onCancel) dispatchLifecycle('onCancel', {});
            if (definition.onIdle) dispatchLifecycle('onIdle', {});
          } else if (active && definition.onIdle) {
            dispatchLifecycle('onIdle', {});
          }
          active = false;
          return;
        }
        if (definition.delayMs) {
          // The answer to an older request must not show while the newer one waits for its debounce.
          latestRequestId++;
          controller?.abort();
          controller = null;
          timer = win.setTimeout(() => load(request), definition.delayMs);
        } else load(request);
      },
      { owns },
    );
  });
};
