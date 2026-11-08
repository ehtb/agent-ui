// The production server of this example: `npm run build`, then `node server.mjs`.
//
// It uses Node's own http server and the framework, nothing else. `agent-ui serve` is a development server, so this file is
// the host: it answers /healthz, sends the built files from memory, hands every other request to the framework's page
// renderer, and puts the site's security and cache headers on every answer. Compression is the CDN's or the proxy's: the
// server sends plain bodies and the headers a cache needs (hashed files immutable, the rest with an ETag, pages a CDN
// lifetime), and keeps no rendered page.
//
// Configuration comes from the environment: PORT (default 8080) and HOST (default 0.0.0.0).
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '@ehtb/agent-ui/build/config.mjs';
import { createSsrHandler } from '@ehtb/agent-ui/server/ssr-handler.mjs';
import { MIME_TYPES } from '@ehtb/agent-ui/server/file-types.mjs';

const projectRoot = dirname(fileURLToPath(import.meta.url));

// The one place the site's document policy is written. An app that calls another origin (an API, a font host) adds it to
// connect-src or font-src; an app whose pages emit inline scripts needs a nonce or a hash here instead of 'self'.
export const SECURITY_HEADERS = {
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self'",
    // agent-ui binds style attributes (a page's theme tokens), so inline styles are part of the page.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; '),
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'cross-origin-opener-policy': 'same-origin',
};

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => (entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)])));
  return files.flat();
};

// Every built file, keyed by its URL path. The renderer uses the page shells as templates and reads manifest.json, so
// neither is a file for a visitor. The shells are found by the pages the build reports, not by their .html extension: a
// public/ file that happens to be called index.html is still served when it is not a page shell.
const loadStaticFiles = async (outputDirectory, assetsDir, privateFiles) => {
  let filesOnDisk;
  try {
    filesOnDisk = await walk(outputDirectory);
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`${outputDirectory} does not exist. Build the site first: agent-ui build`);
    throw error;
  }
  const files = new Map();
  for (const file of filesOnDisk) {
    const urlPath = `/${relative(outputDirectory, file).split(sep).join('/')}`;
    if (privateFiles.has(urlPath)) continue;
    const body = await readFile(file);
    const hashedName = urlPath.startsWith(`/${assetsDir}/`);
    files.set(urlPath, {
      body,
      type: MIME_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      // A name with a content hash never changes; anything else keeps its name across deploys and is revalidated by ETag.
      cacheControl: hashedName ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
      etag: `"${createHash('sha256').update(body).digest('base64url').slice(0, 22)}"`,
    });
  }
  return files;
};

// A CDN in front of this server may keep a page for PAGE_CDN_SECONDS while a browser asks again every time. A page that
// depends on the visitor sends `cache-control: private` or `no-store` instead, which keeps its own policy.
const PAGE_CDN_SECONDS = 60;

const pageCache = (request, { status, headers }) =>
  request.method === 'GET' &&
  status === 200 &&
  /^text\/html/.test(headers['content-type'] ?? '') &&
  headers['set-cookie'] === undefined &&
  !/no-store|private/.test(headers['cache-control'] ?? '')
    ? { headers: { 'cache-control': `public, max-age=0, s-maxage=${PAGE_CDN_SECONDS}` } }
    : null;

const sendStatic = (request, response, file) => {
  const validators = { 'cache-control': file.cacheControl, etag: file.etag };
  // `includes` also matches the weak form (W/"...") a CDN turns an ETag into when it compresses, and a list of them.
  if (request.headers['if-none-match']?.includes(file.etag)) return void response.writeHead(304, validators).end();
  response.writeHead(200, {
    ...validators,
    'content-type': file.type,
    'content-length': file.body.length,
  });
  response.end(request.method === 'HEAD' ? undefined : file.body);
};

// No request here has a body, so a slow one is a client holding a connection for nothing. Idle connections stay longer
// than the platform proxy's 60 s: a proxy that reuses one this server has just closed answers the visitor 502.
export const LIMITS = { headersTimeout: 10_000, requestTimeout: 10_000, connectionsCheckingInterval: 5_000, keepAliveTimeout: 65_000 };

export const createAppServer = async ({ root = projectRoot, outDir, log = console } = {}) => {
  const config = await loadConfig({ root, file: 'build.config.mjs', readOnly: true });
  const output = outDir ?? config.outDir;
  const privateFiles = new Set(['/manifest.json', ...(config.pages ?? []).map((page) => `/${page.name}.html`)]);
  const files = await loadStaticFiles(resolve(root, output), config.assetsDir ?? 'assets', privateFiles);
  const render = await createSsrHandler({
    config,
    root,
    outDir: output,
    transformResponse: pageCache,
    onError: (error) => log.error('render_failed', error),
  });

  return createServer(LIMITS, (request, response) => {
    const path = (request.url ?? '/').split('?')[0];
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.setHeader(name, value);
    if (path === '/healthz') return void response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }).end('ok');
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return void response.writeHead(405, { allow: 'GET, HEAD', 'content-type': 'text/plain; charset=utf-8' }).end('method not allowed');
    }
    const file = files.get(path);
    if (file) return sendStatic(request, response, file);
    render(request, response, () => response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }).end('not found'));
  });
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const port = Number(process.env.PORT ?? 8080);
  const host = process.env.HOST ?? '0.0.0.0';
  const server = await createAppServer();
  server.listen(port, host, () => console.log(JSON.stringify({ event: 'server_started', port, host })));
  // A deploy sends SIGTERM: stop taking connections, let the open ones finish, and go.
  const stop = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
