import type { Plugin } from './ui.js';
import type { PageHead } from './pages.js';

/** Keeps the browser's document current while the state changes: the title, the description, the attributes of <html> and <body>, and the meta and link elements of the page's `head`. List it as `plugins: [withHead]`. */
export function withHead(environment: { win: any; page: { path: string; head: PageHead } }): Plugin;
