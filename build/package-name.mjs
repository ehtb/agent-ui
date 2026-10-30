// The name this package is installed and imported by, read from its package.json so that generated code and checks never repeat it.
import { readFileSync } from 'node:fs';

export const packageName = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).name;
