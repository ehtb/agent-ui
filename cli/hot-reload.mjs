// Hot reload for `agent-ui dev`: after every rebuild, the dev server tells the open pages what changed and the page swaps itself
// (src/hot.js) instead of reloading. The static handler knows nothing about it; it gets the two hooks (`intercept`, `transformHtml`).
//
// How a swap can import "the new version of a file": the build of a dev site has stable file names (index.js), and a browser keeps a
// module by its URL. So after each build `versionOutput` writes the version of every chunk into the URLs that name it: `./agent-ui.js?v=3fa9`
// in the chunks' imports and in the pages' `<script>` and `<link>` tags. A chunk's version is the hash of its text and of the versions of the
// chunks it imports, so a chunk that did not change keeps its URL (and its module, with its state) and a chunk that did, and every chunk
// above it, gets a new one. The framework is one chunk that never changes while a project is edited (build/presets.mjs), so the registry of
// pages (src/pages.js) is never evaluated twice.
//
// What the message says (JSON over server-sent events, /__dev/events):
//   { hello: '<server>-<time>', build: 0 }                the stream is open: the server, and the last build it published
//   { reload: true, build: 3 }                            the page cannot be swapped: the framework changed, a page was added or removed,
//                                                         a page's set of stylesheet chunks changed, or a file of the output that is
//                                                         not code changed (public/)
//   { reload: false, build: 3, css: { '/assets/index.css': '3fa9' }, entries: { '/assets/index.js': { url: '/assets/index.js?v=9c21', onlyEntry: true } } }
//                                                         the stylesheets that changed, and the entry files of the pages whose chunks changed
//                                                         (`onlyEntry`: nothing but the entry chunk of that page changed)
// The client (cli/hot-client.js) decides what applies to the page it runs; a reload is the fallback for anything it cannot swap.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { toPosixPath } from '../build/import-path.mjs';

const CLIENT_PATH = '/__dev/client.js';
const EVENTS_PATH = '/__dev/events';
const hashOf = (text) => createHash('sha1').update(text).digest('hex').slice(0, 8);
const baseName = (url) => url.slice(url.lastIndexOf('/') + 1);

// The names of the chunks the framework's own modules are in: a change there cannot be swapped (build/presets.mjs puts src/** in 'agent-ui').
const FRAMEWORK_CHUNKS = ['agent-ui', 'validator'];

// Files of the output that are neither code nor generated pages (what publicDir copied): one fingerprint for all of them.
const fingerprintStaticFiles = (directory, assetsDir) => {
  const parts = [];
  const walk = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true }).sort((first, second) => first.name.localeCompare(second.name))) {
      const path = join(folder, entry.name);
      const name = toPosixPath(relative(directory, path));
      if (entry.isDirectory()) {
        if (name !== assetsDir) walk(path);
      } else if (name !== 'manifest.json' && !name.endsWith('.html')) {
        parts.push(`${name}:${statSync(path).size}:${hashOf(readFileSync(path))}`);
      }
    }
  };
  walk(directory);
  return hashOf(parts.join('\n'));
};

// Writes the versions into the files of a finished dev build and says what changed since `previous` (the result of the build before, or
// null for the first). Returns { state, message }: `state` is what the next call wants as `previous`.
export const versionOutput = ({ directory, manifest, previous = null }) => {
  const chunks = manifest.chunks;
  const names = Object.keys(chunks);
  const fileOf = (url) => join(directory, url.slice((manifest.basePath ?? '').length).replace(/^\//, ''));
  const texts = Object.fromEntries(names.map((name) => [name, readFileSync(fileOf(chunks[name].javascript), 'utf8')]));
  const nameOfFile = Object.fromEntries(names.map((name) => [baseName(chunks[name].javascript), name]));

  // A chunk's version needs the versions of the chunks it imports first; a cycle (a lazy import back to its importer) counts as no version.
  const versions = {};
  const visiting = new Set();
  const versionOf = (name) => {
    if (versions[name] !== undefined) return versions[name];
    if (visiting.has(name)) return '';
    visiting.add(name);
    const dependencies = [...chunks[name].imports, ...chunks[name].lazyImports].map(versionOf);
    visiting.delete(name);
    return (versions[name] = hashOf(`${texts[name]}\n${dependencies.join(',')}`));
  };
  names.forEach(versionOf);
  const stylesheets = {};
  for (const name of names) if (chunks[name].stylesheet) stylesheets[chunks[name].stylesheet] = hashOf(readFileSync(fileOf(chunks[name].stylesheet), 'utf8'));
  // The stylesheet chunks a page links, in order. Chunk names do not change when only their CSS content changes, so a normal
  // CSS edit can still swap in place; a page that gains or loses a stylesheet chunk needs a reload because the new <link>
  // cannot be swapped for one that is not in its document.
  const pageStyleChunks = Object.fromEntries(
    Object.entries(manifest.pages).map(([name, page]) => [name, page.chunksLoadedAtStartup.filter((chunkName) => chunks[chunkName]?.stylesheet).join(' ')]),
  );

  // A static import or re-export starts its line (generated chunks are written that way); a dynamic import can be anywhere.
  // A chunk file is named after a page ("event-id"), so "~" is a legal character in its name (build/pages.mjs).
  const IMPORT = /(^[ \t]*(?:import|export)\b[^'"\n;]*?\bfrom\s*|\bimport\(\s*)(["'])\.\/([\w.~-]+\.js)\2/gm;
  for (const name of names) {
    const text = texts[name].replace(IMPORT, (whole, before, quote, file) => (nameOfFile[file] ? `${before}${quote}./${file}?v=${versions[nameOfFile[file]]}${quote}` : whole));
    writeFileSync(fileOf(chunks[name].javascript), text);
  }
  const versionOfUrl = (url) => {
    const name = names.find((candidate) => chunks[candidate].javascript === url);
    if (name) return versions[name];
    return stylesheets[url];
  };
  for (const page of Object.values(manifest.pages)) {
    const file = join(directory, page.html);
    const html = readFileSync(file, 'utf8').replace(/\b(src|href)="(\/[^"?]+\.(?:js|css))"/g, (whole, attribute, url) => (versionOfUrl(url) ? `${attribute}="${url}?v=${versionOfUrl(url)}"` : whole));
    writeFileSync(file, html);
  }

  const state = { versions, stylesheets, pageStyleChunks, pages: Object.keys(manifest.pages).sort().join(), files: fingerprintStaticFiles(directory, manifest.assetsDir ?? 'assets') };
  if (!previous) return { state, message: null };
  const changed = names.filter((name) => previous.versions[name] !== versions[name]);
  const message = { reload: false, css: {}, entries: {} };
  const styleChunksChanged = Object.keys(pageStyleChunks).some((name) => previous.pageStyleChunks?.[name] !== pageStyleChunks[name]);
  if (previous.pages !== state.pages || previous.files !== state.files || styleChunksChanged || changed.some((name) => FRAMEWORK_CHUNKS.includes(name)) || Object.keys(previous.versions).some((name) => !(name in versions))) message.reload = true;
  for (const [url, version] of Object.entries(stylesheets)) if (previous.stylesheets[url] !== version) message.css[url] = version;
  for (const page of Object.values(manifest.pages)) {
    const entry = chunks[page.entryChunk];
    if (!changed.includes(page.entryChunk)) continue;
    const others = page.chunksLoadedAtStartup.filter((name) => name !== page.entryChunk && changed.includes(name));
    message.entries[entry.javascript] = { url: `${entry.javascript}?v=${versions[page.entryChunk]}`, onlyEntry: others.length === 0 };
  }
  return { state, message };
};

//   const hot = createHotReload();
//   createStaticServer(directory, { intercept: hot.intercept, transformHtml: hot.transformHtml });
//   hot.publish(message);   every open page hears it;   hot.close() ends the streams
export const createHotReload = () => {
  const listeners = new Set();
  const clientSource = readFileSync(new URL('./hot-client.js', import.meta.url), 'utf8');
  const serverId = `${process.pid}-${Date.now()}`; // a client that finds another id after a reconnect knows the dev server was restarted
  let build = 0; // a client that was hidden in the Back/Forward cache missed broadcasts, so hello says how many there were
  return {
    intercept: async (request, response, pathname) => {
      if (pathname === CLIENT_PATH) {
        response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' }).end(clientSource);
        return true;
      }
      if (pathname !== EVENTS_PATH) return false;
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      response.write(`data: ${JSON.stringify({ hello: serverId, build })}\n\n`);
      listeners.add(response);
      request.on('close', () => listeners.delete(response));
      return true;
    },
    transformHtml: (html) => html.replace('</body>', () => `<script src="${CLIENT_PATH}"></script></body>`),
    publish: (message) => {
      build += 1;
      const payload = { ...message, build };
      for (const response of listeners) response.write(`data: ${JSON.stringify(payload)}\n\n`);
    },
    close: () => {
      for (const response of listeners) response.end();
      listeners.clear();
    },
  };
};
