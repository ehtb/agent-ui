// The relative module specifier one file writes to import another, in the POSIX form the bundler reads.
import { dirname, relative } from 'node:path';

export const toPosixPath = (path) => path.split('\\').join('/');

export const importPath = (fromFile, toFile) => {
  const path = toPosixPath(relative(dirname(fromFile), toFile));
  return path.startsWith('.') ? path : `./${path}`;
};
