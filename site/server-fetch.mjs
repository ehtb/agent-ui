// The search index is the only data the site fetches. While a page is rendered on the server, the framework asks this
// function for it (the same bytes the static host serves from public/); in the browser the resource uses fetch.
import { readFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDirectory = resolve(dirname(fileURLToPath(import.meta.url)), 'public');

export const fetchFunction = async (url) => {
  try {
    const { pathname } = new URL(url, 'http://localhost');
    const sitePath = pathname.startsWith('/agent-ui/') ? pathname.slice('/agent-ui'.length) : pathname;
    const file = resolve(publicDirectory, `.${decodeURIComponent(sitePath)}`);
    if (!file.startsWith(publicDirectory + sep)) return new Response(null, { status: 404 });
    return new Response(await readFile(file, 'utf8'), { headers: { 'content-type': 'application/json' } });
  } catch {
    return new Response(null, { status: 404 });
  }
};
