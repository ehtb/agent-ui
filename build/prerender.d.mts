import type { BuildConfig, PageRecord } from './config.mjs';

/** Refuses a static build that cannot be written: a page with parameters whose view.js lists no `paths`, or a URL another page owns. */
export function assertStaticSite(pages: PageRecord[], options: { projectRoot: string; cacheBust?: unknown }): Promise<void>;

/** Renders the pages into the built site. Returns the URLs that were written. */
export function prerender(options: {
  projectRoot: string;
  outDir: string;
  fetchFunction?: BuildConfig['fetchFunction'];
  pages: PageRecord[];
  cacheBust?: unknown;
  timeoutMs?: number;
  stateForBrowser?: BuildConfig['stateForBrowser'];
}): Promise<string[]>;
