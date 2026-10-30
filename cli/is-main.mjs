// True when `metaUrl` (a module's import.meta.url) is the script Node was started with, also when it was started
// through a symlink (npm links bin scripts) or from a path containing spaces. Use: if (isMain(import.meta.url)) { ... }
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const isMain = (metaUrl) => {
  if (!process.argv[1]) return false;
  try {
    return metaUrl === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
};
