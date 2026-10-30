// Resolving a requested URL path to a file inside a directory, and refusing everything that would leave it.
//
// A plain `startsWith(directory)` is not enough: with the directory "/site/dist" it admits "/site/dist-secret/key". The
// check here compares whole path segments (through path.relative), so only the directory itself and what is below it
// pass. Symbolic links inside the directory are followed as they are: do not put links to private files in it.
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { parseRequestUrl } from '../server/request.mjs';

// Returns the absolute path of `requestedPath` ("/assets/app.js", "data.json") inside `directory`, or null when the
// path would leave the directory ("/../x", "/%2e%2e/x" after decoding, an absolute path, a NUL byte).
export const resolveInside = (directory, requestedPath) => {
  if (typeof requestedPath !== 'string' || requestedPath.includes('\0')) return null;
  const root = resolve(directory);
  const full = resolve(root, `.${requestedPath.startsWith('/') ? '' : '/'}${requestedPath}`);
  const inside = relative(root, full);
  if (inside === '') return full;
  if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) return null;
  return full;
};

// Decodes the path of a request URL. Throws a BadRequestError (answer 400) for malformed percent-encoding.
export class BadRequestError extends Error {}
export const readPathname = (requestUrl) => {
  try {
    return decodeURIComponent(parseRequestUrl(requestUrl).pathname);
  } catch {
    throw new BadRequestError(`the URL "${String(requestUrl).slice(0, 100)}" is not valid (malformed percent-encoding)`);
  }
};
