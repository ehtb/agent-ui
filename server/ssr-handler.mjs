// Server rendering per request, as a request handler for the host's own Node server (Express, Fastify, node:http, ...):
//   app.use(await createSsrHandler({ config }))      handler(request, response, next?)
// It renders the page for the requested URL with the same create() the browser runs, so every page arrives with its content and state. Everything else (the built assets, the host's own routes) is the host's: a request this
// handler does not answer goes to `next()`, or answers 404 text when there is no `next`. The framework serves no files here;
// `agent-ui serve` (cli/ssr-server.mjs) puts this handler in front of a small static server for development and the examples.
//
// Which pages exist comes from the folders below pages/ (`config.pages`, added by loadConfig): a request whose path matches a
// page's URL pattern is rendered for that URL; the most specific pattern wins. The page's `status(state)` may answer an
// HTTP status such as 404 for a URL whose data does not exist.
// Every built page template is read once when this handler is created: a missing template is an error at startup, not on the
// first visit that happens to need it, and the request path never blocks on a file read. This handler serves one build and a
// rebuild needs a restart, as a deployment replaces the process (`agent-ui dev` is the server that rebuilds while it serves).
// The data requests a page makes while rendering are answered by `fetchFunction` of the config; the framework has no default
// source. A host whose data is in its own process passes a config with its function: `{ ...config, fetchFunction }`.
//
// One request object is read by the page's state, its API and its form handler (server/request.mjs):
//   { method, pathname, search, query, headers, cookies, signal }
// `initialStateFor(request)` returns the public state a page starts from (the signed-in visitor's name, a cart).
// `stateForBrowser(state, request)` chooses what the document's state script carries after the page rendered.
// `transformResponse(request, { status, headers, body })` is the one host hook over an answer this handler writes, except
// the 421 and 400 it answers before a request context exists: it may add or replace headers (CSP, HSTS, a site cookie, a
// cache policy) and rewrite the body (a CSP nonce on inline scripts).
// The visitor's session token stays in an HttpOnly cookie, never in the state: the state is in the document and reaches
// the browser.
//
// Optional `api` in the config: a module exporting `createApi({ root })` that returns
//   apiBase                                      optional: the path below which `handle` answers GET and HEAD (default '/api'); composeApi
//                                                (examples/events/compose-api.js) returns it. Any POST goes to `handle` and then `handleForm`
//   handle({ ...request, body })                 -> { status, body, headers? } | null     JSON endpoints (for example POST /api/...)
//   handleForm({ ...request, form })             -> { status, url, initialState?, headers? } | { redirect, headers? } | null
//                                                a plain HTML form post: the page at `url` is rendered with `initialState` (the outcome),
//                                                or a local `redirect` is answered with 303 (post/redirect/get), so forms work without JavaScript.
//                                                The outcome page sees its own path, search and query; method, headers and cookies stay the POST's.
// Headers are checked in one place (src/http-headers.js): names are lower case, `set-cookie` is the only header that repeats,
// and a header the framework writes (content-type, content-length, content-encoding, x-content-type-options, ...) is refused.
// Bodies are JSON (`application/json`) or application/x-www-form-urlencoded (limit `maxBodyBytes`, default 100 KB); any
// other content type is answered 415, not parsed as a form. A body that a host framework's parser already put on
// `request.body` is used as it is, because the host owns how it was read.
//
// A page that declares `ready` is given `timeoutMs` (default 2000) to become ready. With the default `onTimeout: 'error'`
// a page that never becomes ready answers 503, so a half-loaded page is never mistaken for a finished one; pass
// `onTimeout: 'serve'` to serve the partial page with 200 instead (it is logged either way).
//
// Options: `config`, `root`, `outDir`, `maxBodyBytes`, `timeoutMs`, `onTimeout`, `log`, `onError`, `hosts`,
// `initialStateFor`, `stateForBrowser` and `transformResponse`.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SECURITY_HEADERS, isFilePath } from './file-types.mjs';
import { pathToFileURL } from 'node:url';
import { renderDocument } from './document.mjs';
import { createRequestContext, isAllowedHost, isLocalPath, parseRequestUrl, requestContextForUrl } from './request.mjs';
import { destroyApps, renderPage } from './render-page.js';
import { didYouMean, fail } from '../src/messages.js';
import { checkResponseHeaders, mergeResponseHeaders } from '../src/http-headers.js';
import { describeValue, isPlainObject } from '../src/spec-core.js';
import { mergeInitialState } from '../src/namespaces.js';
import { compileUrlPattern } from '../src/url-pattern.js';

const projectRoot = process.cwd();
const SERVER_ERROR = 'internal server error';

// A short, safe rendering of a value for an error message: JSON.stringify throws on a cycle, a BigInt or a throwing getter.
const preview = (value) => {
  try {
    const text = JSON.stringify(value);
    if (text !== undefined) return text.slice(0, 120);
  } catch {}
  return describeValue(value);
};

// Reads a body up to `maximumBytes`. Once that limit is passed the chunks already collected are dropped, the listeners are
// removed and the rest of the body is drained (resume) rather than kept in memory: the answer is a 400, and a sender that
// streams megabytes into a refused request must not make the server hold them. The socket is drained, not destroyed, so the
// 400 still reaches the client on it; nothing is kept while that happens. A connection that closes before `end` rejects
// too, so the handler can never wait forever for a promise nobody will settle.
const readBody = (request, maximumBytes) =>
  new Promise((resolveBody, reject) => {
    let chunks = [];
    let size = 0;
    let settled = false;
    const listeners = {
      data: (chunk) => {
        size += chunk.length;
        if (size > maximumBytes) failRead(new Error(`request body too large (more than ${maximumBytes} bytes). Raise maxBodyBytes of createSsrHandler if requests this large are expected`));
        else chunks.push(chunk);
      },
      end: () => {
        if (settled) return;
        settled = true;
        removeListeners();
        resolveBody(Buffer.concat(chunks).toString('utf8'));
      },
      error: (error) => failRead(error),
      close: () => failRead(new Error('request body ended before it was complete')),
    };
    const removeListeners = () => {
      request.off('data', listeners.data);
      request.off('end', listeners.end);
      request.off('error', listeners.error);
      request.off('close', listeners.close);
    };
    const failRead = (error) => {
      if (settled) return;
      settled = true;
      chunks = [];
      removeListeners();
      request.resume?.(); // drain what is still coming; the response is already a 400
      reject(error);
    };
    request.on('data', listeners.data);
    request.on('end', listeners.end);
    request.on('error', listeners.error);
    request.on('close', listeners.close);
  });

// `415` is a request this handler will not read; `400` is a body it tried to read and could not.
const bodyError = (status, message) => Object.assign(new Error(message), { bodyStatus: status });

const JSON_TYPE = /^application\/(?:[\w.+-]+\+)?json(?:\s*;.*)?$/i;
const FORM_TYPE = /^application\/x-www-form-urlencoded(?:\s*;.*)?$/i;

const parseBody = (headers, text) => {
  if (!text) return {};
  const contentType = String(headers['content-type'] ?? '').trim();
  if (!contentType) throw bodyError(415, 'the request has no content-type. Send application/json or application/x-www-form-urlencoded');
  if (JSON_TYPE.test(contentType)) {
    try {
      return JSON.parse(text);
    } catch (error) {
      throw bodyError(400, error.message);
    }
  }
  if (FORM_TYPE.test(contentType)) return Object.fromEntries(new URLSearchParams(text));
  if (contentType.toLowerCase().startsWith('multipart/form-data')) {
    throw bodyError(415, 'multipart/form-data is not supported by createSsrHandler. Parse the upload in the host server and pass the parsed value as `request.body`, or receive the file in a route of the host');
  }
  throw bodyError(415, `content-type "${contentType}" is not supported. Send application/json or application/x-www-form-urlencoded`);
};

const SSR_OPTIONS = ['config', 'root', 'outDir', 'maxBodyBytes', 'timeoutMs', 'onTimeout', 'log', 'onError', 'hosts', 'initialStateFor', 'stateForBrowser', 'transformResponse'];
const TIMEOUT_POLICIES = ['error', 'serve'];

export const createSsrHandler = async (options = {}) => {
  for (const key of Object.keys(options)) {
    if (!SSR_OPTIONS.includes(key)) fail('createSsrHandler', `unknown option "${key}"`, `${didYouMean(key, SSR_OPTIONS)}Allowed options: ${SSR_OPTIONS.join(', ')}. The data requests of a page are answered by \`fetchFunction\` of the config`);
  }
  const { config, root = projectRoot, outDir = config?.outDir ?? 'dist', maxBodyBytes = 100_000, timeoutMs = config?.renderTimeoutMs ?? 2000, onTimeout = 'error', log = console.warn, onError = console.error, hosts = null, initialStateFor = null, stateForBrowser = config?.stateForBrowser ?? null, transformResponse = null } = options;
  if (!config || typeof config !== 'object') throw new Error('createSsrHandler: pass `config`, the build configuration (loadConfig from @ehtb/agent-ui/build/config.mjs returns it)');
  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes < 1) fail('createSsrHandler', `maxBodyBytes ${preview(maxBodyBytes)} is not allowed`, 'Pass a whole number of bytes, for example maxBodyBytes: 100000');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) fail('createSsrHandler', `timeoutMs ${preview(timeoutMs)} is not allowed`, 'Pass a whole number of milliseconds, 1 or more, for example timeoutMs: 2000');
  if (!TIMEOUT_POLICIES.includes(onTimeout)) fail('createSsrHandler', `onTimeout "${onTimeout}" is not allowed`, `Write onTimeout: "error" (answer 503 and never serve a half-loaded page) or onTimeout: "serve" (answer the partial page with 200). Allowed values: ${TIMEOUT_POLICIES.join(', ')}`);
  const hookAdvice = {
    initialStateFor: 'Write initialStateFor: (request) => ({ session: { user: request.cookies.session ?? null } })',
    stateForBrowser: 'Write stateForBrowser: (state) => ({ ...state, account: { id: state.account.id } }) and leave a server-only key out of the returned object',
    transformResponse: 'Write transformResponse: (request, { headers, body }) => ({ headers: { "strict-transport-security": "max-age=31536000" } })',
  };
  for (const [name, value] of [['initialStateFor', initialStateFor], ['stateForBrowser', stateForBrowser], ['transformResponse', transformResponse]]) {
    if (value !== null && value !== undefined && typeof value !== 'function') {
      const shape = name === 'initialStateFor' ? 'a function of the request' : name === 'stateForBrowser' ? 'a function of (state, request)' : 'a function of (request, response)';
      fail('createSsrHandler', `"${name}" must be ${shape}`, hookAdvice[name]);
    }
  }
  const outputDirectory = resolve(root, outDir);
  // The pages, most specific URL first (loadConfig orders them), each with its matcher and its generated module.
  const pages = (config.pages ?? []).map((page) => ({ ...page, matcher: compileUrlPattern(page.path) }));
  const modules = new Map();
  for (const page of pages) modules.set(page.name, await import(pathToFileURL(resolve(root, page.app))));
  // The built page shells are read once, now, before the handler answers anything: a missing template is a broken deployment,
  // not a page that happens to fail on its first visit. It does not change while this handler serves (a new build restarts the
  // process), and a synchronous read on every request would block the event loop for every other request.
  const templates = new Map();
  for (const page of pages) {
    const templateFile = resolve(outputDirectory, `${page.name}.html`);
    if (!existsSync(templateFile)) throw new Error(`${templateFile} does not exist. Build the site first: agent-ui build`);
    templates.set(page.name, readFileSync(templateFile, 'utf8'));
  }
  const templateFor = (page) => templates.get(page.name);
  const api = config.api ? (await import(pathToFileURL(resolve(root, config.api)))).createApi({ root }) : null;
  const apiPrefix = `${api?.apiBase ?? '/api'}/`;
  const fetchFunction = config.fetchFunction;

  // A trailing slash is the same page: "/product/3/" is "/product/:id".
  const findPage = (pathname) => {
    const normalized = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
    return pages.find((page) => page.matcher.match(normalized));
  };

  const renderPageFor = async (page, context, initialState = {}, url = context.pathname + context.search) => {
    const { create, createShell = null, describePage = null } = modules.get(page.name);
    const template = templateFor(page);
    const sessionState = initialStateFor ? await initialStateFor(context) : null;
    if (sessionState !== null && sessionState !== undefined && !isPlainObject(sessionState)) {
      fail('createSsrHandler initialStateFor', `returned ${preview(sessionState)}, not a state object { namespace: { key: value } }`, 'Return an object in the shape of ui.state() (an empty one when there is no session)');
    }
    const result = await renderPage(create, { url, fetchFunction, initialState: mergeInitialState(sessionState, initialState), createShell, dev: false, request: context, timeoutMs, stateForBrowser });
    try {
      // A half-loaded page is not a finished page. By default the answer is a 503; `onTimeout: 'serve'` keeps the old
      // behavior for a host that prefers the partial page, and either way the timeout is logged so it is not silent.
      if (result.timedOut) {
        const why = `render ${url}: gave up waiting for the page to become ready (its \`ready(state)\` stayed false)`;
        if (onTimeout === 'error') {
          log(`${why}; answered 503 because onTimeout is "error" (pass onTimeout: "serve" to serve the partial page)`);
          throw Object.assign(new Error(`${why}; the page did not become ready within ${timeoutMs} ms`), { timedOut: true });
        }
        log(`${why} and served what exists`);
      }
      const body = renderDocument(template, result, { describePage });
      const status = result.ui.getStatus?.() ?? 200;
      return { status, body };
    } finally {
      // The request is answered from the markup and the state: the apps (their watchers, resources and timers) end here, also on an error.
      destroyApps(result.ui, result.shellApp);
    }
  };

  // The shape of a form outcome, before either kind of answer: exactly one of a rendered page and a redirect.
  const checkFormOutcome = (outcome) => {
    if (!isPlainObject(outcome)) fail('api.handleForm', `answered ${describeValue(outcome)}, not { status, url, initialState?, headers? } or { redirect, headers? }`, 'Answer the page that shows the outcome, for example { status: 200, url: "/contact" }, or a redirect, for example { redirect: "/login" }');
    const redirect = outcome.redirect !== undefined;
    const allowed = redirect ? ['redirect', 'headers'] : ['status', 'url', 'initialState', 'headers'];
    for (const key of Object.keys(outcome)) {
      if (allowed.includes(key)) continue;
      if (redirect && (key === 'status' || key === 'url' || key === 'initialState')) fail('api.handleForm', `answered both "redirect" and "${key}"`, 'Answer one outcome: { redirect, headers? } for a redirect, or { status, url, initialState?, headers? } for a rendered page');
      fail('api.handleForm', `unknown key "${key}"`, `${didYouMean(key, allowed)}Allowed keys: ${allowed.join(', ')}`);
    }
    if (redirect) {
      if (!isLocalPath(outcome.redirect)) fail('api.handleForm', `redirect ${preview(outcome.redirect)} is not a path of this site`, 'Redirect to a local path that starts with "/" and is not "//", with no backslash or encoded separator at the start, for example "/login?next=%2Faccount"; answer a url to render a page instead');
      return;
    }
    if (!Number.isInteger(outcome.status) || typeof outcome.url !== 'string') {
      fail('api.handleForm', `answered ${preview(outcome)}, not { status, url, initialState?, headers? } or { redirect, headers? }`, 'Answer the HTTP status and the URL of the page that shows the outcome (for example "/contact"), or a redirect (for example { redirect: "/contact" })');
    }
    if (outcome.status < 100 || outcome.status > 599) fail('api.handleForm', `answered status ${outcome.status}, not an HTTP status`, 'Return a whole number from 100 to 599 (a rendered form outcome is usually 200)');
    if (outcome.status >= 300 && outcome.status < 400) fail('api.handleForm', `answered status ${outcome.status} with a url`, 'For a redirect after a form post answer { redirect: "/path", headers? }; a rendered page has its own status (usually 200)');
    if (!isLocalPath(outcome.url)) fail('api.handleForm', `url ${preview(outcome.url)} is not a path of this site`, 'Answer a local path that starts with "/" and is not "//", with no backslash or encoded separator at the start, for example "/contact" or "/item/3?ok=1"; answer a redirect instead');
    if (outcome.initialState !== undefined && outcome.initialState !== null && !isPlainObject(outcome.initialState)) {
      fail('api.handleForm', `initialState is ${describeValue(outcome.initialState)}, not an object { namespace: { key: value } }`, 'Nest the outcome by namespace, for example { event: { status: "done" } }');
    }
  };

  // The one hook over a finished answer: { headers?, body? } or null. Headers go through the same check as every other
  // response; `body` is the text this handler would write.
  const checkTransformResult = (result) => {
    if (result === undefined || result === null) return {};
    if (!isPlainObject(result)) fail('createSsrHandler transformResponse', `returned ${describeValue(result)}, not { headers?, body? } or null`, 'Return { headers?, body? } to change the answer, or null to leave it as it is');
    for (const key of Object.keys(result)) {
      if (key !== 'headers' && key !== 'body') fail('createSsrHandler transformResponse', `returned the unknown key "${key}"`, `${didYouMean(key, ['headers', 'body'])}Allowed keys: headers, body`);
    }
    if (result.body !== undefined && typeof result.body !== 'string') fail('createSsrHandler transformResponse', `returned a body that is ${describeValue(result.body)}, not a string`, 'Return the whole body as a string, or leave `body` out to keep the answer as it is');
    const checked = checkResponseHeaders(result.headers, 'createSsrHandler transformResponse', { name: 'headers' });
    return { headers: checked, body: result.body };
  };

  // JSON endpoints and plain form posts, before page rendering.
  const intercept = async (request, context, send) => {
    const { pathname } = context;
    if (!api || (context.method !== 'POST' && !pathname.startsWith(apiPrefix))) return false;
    // Any method but GET and HEAD may carry a body (POST, PUT, PATCH, DELETE).
    const hasBody = context.method !== 'GET' && context.method !== 'HEAD';
    let body = {};
    try {
      if (hasBody) body = request.body !== undefined ? request.body : parseBody(context.headers, await readBody(request, maxBodyBytes));
    } catch (error) {
      const status = error.bodyStatus ?? 400;
      await send(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, JSON.stringify({ message: error.message }));
      return true;
    }
    try {
      const answer = await api.handle({ ...context, body });
      if (answer) {
        if (!isPlainObject(answer)) fail('api.handle', `answered ${preview(answer)}, not { status, body, headers?, raw? }`, 'Answer { status, body, headers? } for a request it handles, or a falsy value for one it does not');
        const answerKeys = ['status', 'body', 'headers', 'raw'];
        for (const key of Object.keys(answer)) {
          if (!answerKeys.includes(key)) fail('api.handle', `answered the unknown key "${key}"`, `${didYouMean(key, answerKeys)}Allowed keys: ${answerKeys.join(', ')}`);
        }
        if (answer.raw !== undefined && typeof answer.raw !== 'boolean') fail('api.handle', `answered raw: ${preview(answer.raw)}, not true or false`, 'Write raw: true when the body is already the exact bytes to send, or leave it out for JSON');
        if (!Number.isInteger(answer.status)) fail('api.handle', `answered ${preview(answer)}, which has no integer "status"`, 'Answer { status, body, headers? } for a request it handles, or a falsy value for one it does not');
        if (answer.status < 100 || answer.status > 599) fail('api.handle', `answered status ${answer.status}, not an HTTP status`, 'Return a whole number from 100 to 599');
        if (answer.raw) {
          const binary = answer.body instanceof Uint8Array;
          if (typeof answer.body !== 'string' && !binary) fail('api.handle', `answered raw: true with a body of type ${describeValue(answer.body)}`, 'Return a string (CSV, XML, plain text) or a Uint8Array (bytes), or leave raw out to send JSON');
          // A raw answer chooses its own media type; guessing it from the body would be wrong for the one case raw exists for.
          const rawHeaders = checkResponseHeaders(answer.headers, 'api.handle', { allow: ['content-type'] });
          if (answer.body.length > 0 && !rawHeaders?.['content-type']) fail('api.handle', 'answered raw: true without a "content-type" header', 'Set headers: { "content-type": "text/csv; charset=utf-8" } (or the type of the bytes) so the browser reads the body correctly');
          await send(answer.status, rawHeaders ?? {}, answer.body, { defaultCacheControl: 'no-store' });
          return true;
        }
        const answerHeaders = checkResponseHeaders(answer.headers, 'api.handle');
        await send(answer.status, mergeResponseHeaders({ 'content-type': 'application/json; charset=utf-8' }, answerHeaders), JSON.stringify(answer.body), { defaultCacheControl: 'no-store' });
        return true;
      }
      const outcome = context.method === 'POST' && (await api.handleForm?.({ ...context, form: body }));
      if (context.method === 'POST' && !outcome && findPage(pathname)) {
        await send(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }, 'not found');
        return true;
      }
      if (!outcome) return false;
      checkFormOutcome(outcome);
      const outcomeHeaders = checkResponseHeaders(outcome.headers, 'api.handleForm', { reserved: ['location', 'cache-control'] });
      if (outcome.redirect !== undefined) {
        await send(303, mergeResponseHeaders({ location: outcome.redirect, 'cache-control': 'no-store' }, outcomeHeaders), '');
        return true;
      }
      const outcomeContext = requestContextForUrl(context, outcome.url);
      const page = findPage(outcomeContext.pathname); // the page is the path; a query or hash is for the page to read
      if (!page) {
        onError(new Error(`handleForm answered the url ${JSON.stringify(outcome.url)}, which is no page. Answer the URL of the page that shows the outcome, for example "/contact"`), context);
        await send(500, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }, SERVER_ERROR);
        return true;
      }
      const rendered = await renderPageFor(page, outcomeContext, outcome.initialState, outcome.url);
      // A response to a form post is never cached; a transform can replace the policy deliberately.
      await send(outcome.status, mergeResponseHeaders({ 'content-type': 'text/html; charset=utf-8' }, outcomeHeaders, { 'cache-control': 'no-store' }), rendered.body, { requestContext: outcomeContext });
      return true;
    } catch (error) {
      if (context.signal?.aborted) return true; // the visitor is gone; nothing to report and nobody to tell
      // A page that did not become ready in time is unavailable, not broken: it gets 503, and the timeout was already logged.
      if (error.timedOut) {
        await send(503, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }, 'service unavailable');
        return true;
      }
      // The request was readable, so the failure is in the endpoint or the render: a server error, not a bad request. The visitor is told
      // nothing about it (a message can hold a path, a query or a secret); the host's log gets the error.
      onError(error, context);
      await send(500, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, JSON.stringify({ message: SERVER_ERROR }));
      return true;
    }
  };

  const render = async (context, send) => {
    const page = findPage(context.pathname);
    if (!page) return false;
    const rendered = await renderPageFor(page, context);
    await send(rendered.status, { 'content-type': 'text/html; charset=utf-8' }, rendered.body, { defaultCacheControl: 'no-cache' });
    return true;
  };

  // The request path as sent (still percent-encoded, because URL patterns decode each segment themselves: decoding it here
  // would turn "/item/a%2Fb" into two segments); null for a malformed percent-encoding (answered 400). The query is parsed
  // in the same step, so a page request parses its URL once.
  const readLocation = (requestUrl) => {
    try {
      const location = parseRequestUrl(requestUrl);
      decodeURIComponent(location.pathname);
      return { pathname: location.pathname, search: location.search };
    } catch {
      return null;
    }
  };

  return async (request, response, next = null) => {
    let send = null;
    let context = null;
    // A visitor who closes the tab stops the work: the page render sees this signal (server/render-page.js), and no answer or
    // error is written to a connection that is gone. `response` is writable only until its close; `request` covers a client
    // that goes away while its body is still being read.
    const controller = new AbortController();
    const abortOnClose = () => {
      if (!response.writableEnded) controller.abort();
    };
    response.on?.('close', abortOnClose);
    request.on?.('aborted', abortOnClose);
    const isGone = () => controller.signal.aborted || response.destroyed === true;
    const reportError = (error, requestContext = context) => {
      if (isGone()) return; // the host's log does not need a failure nobody can receive
      onError(error, requestContext);
    };
    try {
      if (!isAllowedHost(request, hosts)) return void response.writeHead(421, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS }).end('misdirected request: this server answers to its own host names only');
      const location = readLocation(request.url);
      if (location === null) return void response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS }).end('bad request: malformed percent-encoding in the URL');
      context = createRequestContext(request, location, { signal: controller.signal });
      // The hook runs only when the handler writes an answer: a request that goes to next() does not pay for it, and a
      // throwing hook cannot turn a host's static file into a 500.
      send = async (status, headers = {}, body = '', { defaultCacheControl = null, requestContext = context } = {}) => {
        if (isGone()) return; // the request was closed: writing now would touch a dead socket
        try {
          let responseHeaders = mergeResponseHeaders(
            defaultCacheControl && !Object.hasOwn(headers, 'cache-control') ? { ...headers, 'cache-control': defaultCacheControl } : headers,
            SECURITY_HEADERS,
          );
          let responseBody = body;
          const binaryBody = responseBody instanceof Uint8Array;
          // The hook runs for every answer, including a binary raw one (so a site-wide CSP or HSTS header is not skipped). A
          // binary body has no text to inspect or rewrite: its `body` is empty, and returning a body is refused below.
          if (transformResponse) {
            // The hook reads a copy, with its own cookie array: returning a change is the only way to change the answer.
            const inputHeaders = Object.fromEntries(Object.entries(responseHeaders).map(([name, value]) => [name, Array.isArray(value) ? [...value] : value]));
            const transformed = checkTransformResult(await transformResponse(requestContext, { status, headers: inputHeaders, body: binaryBody ? '' : responseBody }));
            if (transformed.headers !== undefined) responseHeaders = mergeResponseHeaders(responseHeaders, transformed.headers);
            if (transformed.body !== undefined) {
              if (binaryBody) fail('createSsrHandler transformResponse', 'returned a body for a binary raw answer', 'A binary raw answer is sent unchanged: return headers only, or leave `body` out');
              responseBody = transformed.body;
            }
            // The host may add policy headers, but never remove the framework's own security header.
            responseHeaders = mergeResponseHeaders(responseHeaders, SECURITY_HEADERS);
          }
          if (isGone()) return; // a transform that awaited the network may have outlived the visitor
          response.writeHead(status, responseHeaders);
          response.end(responseBody);
        } catch (error) {
          if (isGone()) return;
          reportError(error, requestContext);
          if (response.headersSent) return void response.end();
          response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS }).end(SERVER_ERROR);
        }
      };
      if (await intercept(request, context, send)) return;
      if ((context.method === 'GET' || context.method === 'HEAD') && !isFilePath(context.pathname)) {
        if (await render(context, send)) return;
      }
      if (next) return next();
      await send(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }, 'not found');
    } catch (error) {
      if (isGone()) return;
      // A page that did not become ready in time is unavailable, not broken: 503, already logged by renderPageFor.
      if (error.timedOut) {
        if (send) await send(503, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }, 'service unavailable');
        else response.writeHead(503, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS }).end('service unavailable');
        return;
      }
      if (response.headersSent) return void response.end();
      reportError(error);
      if (send) {
        await send(500, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }, SERVER_ERROR);
        return;
      }
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS }).end(SERVER_ERROR);
    } finally {
      response.off?.('close', abortOnClose);
      request.off?.('aborted', abortOnClose);
    }
  };
};
