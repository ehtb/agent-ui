// Static file serving for the built site: a request handler (createStaticHandler) or a ready server (createStaticServer). `agent-ui dev`
// serves the build with it, and `agent-ui serve` sends the files of the build with it after the page renderer has had its turn. The
// framework ships no production file server: a deployed site is served by the host's own (express.static, nginx, a CDN).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { BadRequestError, readPathname, resolveInside } from './safe-path.mjs';
import { compileUrlPattern } from '../src/url-pattern.js';
import { isAllowedHost, parseRequestUrl } from '../server/request.mjs';
import { MIME_TYPES, SECURITY_HEADERS, isFilePath } from '../server/file-types.mjs';
import { withoutBase } from '../src/base-path.js';
import { fail } from '../src/messages.js';
import { BASE_PATH_ADVICE, isBasePath } from '../src/base-path-checks.js';

// `transformHtml` (html) => html changes every HTML file the handler sends from disk (the dev server adds its hot reload script).
//
// `assetsDir` (a name) marks the directory served as immutable. `rewrites` (a function returning [{ pattern: '/product/:id', page: 'product-id.html' }],
// most specific first) serves `page` for every path without a known file extension that matches `pattern` and has no file of its own: the
// dev server answers a URL with the shell of the page it belongs to, which renders in the browser.
// `intercept` (request, response, pathname) => Promise<boolean> handles requests before anything else (the dev server's hot reload stream and script);
// return true when it answered. `basePath` (src/base-path.js) serves the site below that path: "/shop/assets/a.js" is the file
// assets/a.js, and a path outside the base is not this site's (404, or `next()`). `intercept` sees the path as sent.
//
// createStaticHandler returns the request listener without creating a server: `handler(request, response, next?)` is a
// Node http listener that also fits Express-style `app.use(handler)` and (through `reply.raw`) Fastify. When a `next`
// function is given, requests this handler would answer with 403, 404 or 405 are passed to `next()` instead, so the
// host's own routes and other middleware get them. createStaticServer is the same listener on its own http server.
export const createStaticHandler = (rootDirectory, { transformHtml = null, rewrites = () => [], assetsDir = 'assets', intercept = null, onError = console.error, hosts = null, basePath = '' } = {}) => {
  if (!isBasePath(basePath)) fail('createStaticHandler', `basePath ${JSON.stringify(basePath)} is not allowed`, BASE_PATH_ADVICE);
  // A rewrite pattern is compiled once: the list is read per request (the dev server's pages change when a page folder is added), but a
  // pattern changes only when its page does.
  const matchers = new Map();
  const matcherFor = (pattern) => {
    let matcher = matchers.get(pattern);
    if (!matcher) {
      matcher = compileUrlPattern(pattern);
      matchers.set(pattern, matcher);
    }
    return matcher;
  };
  const serve = async (request, response, next) => {
    if (!isAllowedHost(request, hosts)) return void response.writeHead(421, { 'content-type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS }).end('misdirected request: this server answers to its own host names only');
    const wirePath = readPathname(request.url);
    if (intercept && (await intercept(request, response, wirePath))) return;
    const urlPath = withoutBase(basePath, wirePath);
    if (urlPath === null) {
      if (next) return next();
      response.writeHead(404, SECURITY_HEADERS).end('not found');
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      if (next) return next();
      response.writeHead(405, { allow: 'GET, HEAD', 'content-type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS }).end('method not allowed');
      return;
    }
    // Patterns decode each segment themselves, so they match the path as sent (an encoded "%2F" stays inside one parameter).
    const rawPath = withoutBase(basePath, parseRequestUrl(request.url).pathname) ?? '/';
    const rawWithoutSlash = rawPath.length > 1 && rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath;
    const rewrite = !isFilePath(urlPath) && rewrites().find(({ pattern }) => matcherFor(pattern).match(rawWithoutSlash));
    const requested = resolveInside(rootDirectory, rewrite ? rewrite.page : urlPath === '/' ? 'index.html' : urlPath);
    if (!requested) {
      if (next) return next();
      response.writeHead(403, SECURITY_HEADERS).end('forbidden');
      return;
    }
    try {
      if (!(await stat(requested)).isFile()) throw new Error('not a file');
      const content = await readFile(requested); // before the headers: a file that cannot be read must not leave a half-written 200
      response.writeHead(200, {
        ...SECURITY_HEADERS,
        'content-type': MIME_TYPES[extname(requested)] || 'application/octet-stream',
        // Files under the assets directory (config `assetsDir`, default "assets") have content hashes in their names, so they never change.
        'cache-control': urlPath.includes(`/${assetsDir}/`) ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
      response.end(transformHtml && extname(requested) === '.html' ? transformHtml(content.toString('utf8')) : content);
    } catch {
      if (next) return next();
      response.writeHead(404, SECURITY_HEADERS).end('not found');
    }
  };
  // Nothing thrown while answering may escape: an unhandled rejection would hang the response and can end the process.
  const handler = async (request, response, next = null) => {
    try {
      await serve(request, response, next);
    } catch (error) {
      if (!(error instanceof BadRequestError)) onError(error);
      if (response.headersSent) return response.end();
      const bad = error instanceof BadRequestError;
      response.writeHead(bad ? 400 : 500, { 'content-type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS }).end(bad ? error.message : 'internal server error');
    }
  };
  return handler;
};

export const createStaticServer = (rootDirectory, options = {}) => {
  const handler = createStaticHandler(rootDirectory, options);
  return createServer((request, response) => handler(request, response));
};
