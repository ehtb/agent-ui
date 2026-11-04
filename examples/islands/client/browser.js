// The browser's entry, loaded as a module by the page (server.js). The import map in the page says where the package's modules are.
import { startIslands } from './islands.js';

startIslands({ document, dev: false });
