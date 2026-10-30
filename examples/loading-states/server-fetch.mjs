// Where this example's pages get their data while they are rendered on the server (`agent-ui check`):
// the files in public/, the same bytes the browser fetches from the static host. The framework has no default source of
// data; build.config.mjs names this function as `fetchFunction`.
import { readFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDirectory = resolve(dirname(fileURLToPath(import.meta.url)), 'public');

export const fetchFunction = async (url) => {
  try {
    const file = resolve(publicDirectory, `.${decodeURIComponent(new URL(url, 'http://localhost').pathname)}`);
    if (!file.startsWith(publicDirectory + sep)) return new Response(null, { status: 404 });
    return new Response(await readFile(file, 'utf8'), { headers: { 'content-type': 'application/json' } });
  } catch {
    return new Response(null, { status: 404 });
  }
};
