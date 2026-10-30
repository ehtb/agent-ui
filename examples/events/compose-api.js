// This example's way to build the `api` object the render server asks for (the contract: docs/BUILD.md in agent-ui, "APIs and
// form posts"). The framework does not ship it: it is application plumbing, so it lives in the project, to copy and change.
//
// Each page can own endpoints and form handlers, and nothing else answers for them. Runs in Node only (never import it in a
// browser entry). Any object with `handle` (and optionally `handleForm` and `apiBase`) works as well.
//
//   export const createApi = ({ root }) => composeApi({
//     routes: {
//       item: {                                        the name of the API part, the first segment of its URLs
//         endpoints: { 'POST /:id/buy': ({ params, body }) => ({ status: 201, body: { ... } }) },
//         forms: { '/item/:id/buy': ({ params, form }) => ({ status, url, initialState, headers? }) | ({ redirect, headers? }) | null },
//         reset: () => {},                             optional: forget in-memory state (tests)
//       },
//     },
//   });
//
// Endpoints are served below <apiBase>/<name>/, with apiBase '/api' unless the options say otherwise ('POST /:id/buy' of
// the part "item" answers POST /api/item/3/buy).
// Form paths are page paths: a plain HTML form posted to one is handled without JavaScript. An outcome either names the page
// that shows it (`url`), or redirects to a local path with `{ redirect }` (answered 303, post/redirect/get).
// Patterns use the syntax of the pages (":name", "*rest"); when several match, the most specific wins (@ehtb/agent-ui/url-pattern).
// Unknown paths below apiBase answer 404 JSON. Mistakes in the table (bad method, bad pattern, duplicate) throw when composing,
// with a message that names the part.
import { compileUrlPattern, sortBySpecificity } from '@ehtb/agent-ui/url-pattern';
import { didYouMean, fail } from '@ehtb/agent-ui/messages';
import { isLocalPath } from '@ehtb/agent-ui/server/request.mjs';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const ROUTE_API_KEYS = ['endpoints', 'forms', 'reset'];

const checkPattern = (where, pattern) => {
  if (typeof pattern !== 'string' || !pattern.startsWith('/') || /[#?]/.test(pattern) || /\*[^/]*\//.test(pattern)) {
    fail(where, `pattern ${JSON.stringify(pattern)} is not allowed`, 'Start with "/", use segments like "/:id/buy", and put "*name" only in the last segment');
  }
};

export const composeApi = ({ apiBase = '/api', routes }) => {
  if (typeof apiBase !== 'string' || !/^\/[^?#]*[^/?#]$/.test(apiBase)) fail('composeApi', `apiBase ${JSON.stringify(apiBase)} is not allowed`, "Use a path that starts with '/' and has no trailing slash, for example '/api'");
  const endpoints = [];
  const forms = [];
  const resets = [];
  const seen = new Set();
  for (const [routeName, definition] of Object.entries(routes)) {
    const where = `api part "${routeName}"`;
    for (const key of Object.keys(definition)) {
      if (!ROUTE_API_KEYS.includes(key)) fail(where, `unknown key "${key}"`, `${didYouMean(key, ROUTE_API_KEYS)}Allowed keys: ${ROUTE_API_KEYS.join(', ')}`);
    }
    for (const [signature, handler] of Object.entries(definition.endpoints ?? {})) {
      const [method, pattern, extra] = signature.split(' ');
      if (!METHODS.includes(method) || pattern === undefined || extra !== undefined) fail(where, `endpoint "${signature}" is not allowed`, `Write 'METHOD /pattern' with METHOD one of ${METHODS.join(', ')}`);
      checkPattern(where, pattern);
      if (typeof handler !== 'function') fail(where, `endpoint "${signature}" needs a function`, 'Write ({ params, body }) => ({ status, body })');
      const full = `${method} ${routeName}${pattern}`;
      if (seen.has(full)) fail(where, `endpoint "${signature}" is defined twice`, 'Keep one');
      seen.add(full);
      endpoints.push({ method, matcher: compileUrlPattern(`${apiBase}/${routeName}${pattern}`), handler });
    }
    for (const [pattern, handler] of Object.entries(definition.forms ?? {})) {
      checkPattern(where, pattern);
      if (typeof handler !== 'function') fail(where, `form "${pattern}" needs a function`, 'Write ({ params, form }) => ({ status, url, initialState }) | ({ redirect }) | null');
      forms.push({ pattern, matcher: compileUrlPattern(pattern), handler });
    }
    if (definition.reset) resets.push(definition.reset);
  }

  const orderedEndpoints = sortBySpecificity(endpoints, (entry) => entry.matcher);
  const orderedForms = sortBySpecificity(forms, (entry) => entry.matcher);

  const handle = ({ method, pathname, body }) => {
    const otherMethods = new Set();
    for (const endpoint of orderedEndpoints) {
      const params = endpoint.matcher.match(pathname);
      if (!params) continue;
      if (endpoint.method === method) return endpoint.handler({ params, body });
      otherMethods.add(endpoint.method);
    }
    if (otherMethods.size) {
      const allow = [...otherMethods].join(', ');
      return { status: 405, headers: { allow }, body: { message: `${method} is not allowed here. Use ${allow}.` } };
    }
    return pathname.startsWith(`${apiBase}/`) ? { status: 404, body: { message: 'No such endpoint.' } } : null;
  };

  const handleForm = ({ pathname, form }) => {
    for (const entry of orderedForms) {
      const params = entry.matcher.match(pathname);
      if (!params) continue;
      const outcome = entry.handler({ params, form });
      if (!outcome) return outcome;
      if (outcome.redirect !== undefined) {
        if (!isLocalPath(outcome.redirect)) fail(`form "${entry.pattern}"`, `redirect ${JSON.stringify(outcome.redirect)} is not a path of this site`, 'Redirect to a local path that starts with "/" and is not "//", with no backslash or encoded separator at the start, for example "/login?next=%2Faccount"');
        return outcome;
      }
      if (!isLocalPath(outcome.url)) fail(`form "${entry.pattern}"`, `outcome url ${JSON.stringify(outcome.url)} is not allowed`, 'Return a local path that starts with "/" and is not "//", with no backslash or encoded separator at the start, for example "/contact" or "/item/3?ok=1"');
      return outcome;
    }
    return null;
  };

  return { apiBase, handle, handleForm, reset: () => resets.forEach((reset) => reset()), endpoints: () => endpoints.map((entry) => entry.method) };
};
