import type { BuildConfig, PageRecord } from './config.mjs';

/** One page of a static site: its generated module and the URLs to write. */
export interface StaticPage {
  page: PageRecord;
  module: any;
  urls: string[];
}

/** Refuses a static build that cannot be written: a page with parameters whose view.js lists no `paths`, or a URL another page owns. Returns the pages with their URLs. */
export function assertStaticSite(pages: PageRecord[], options: { projectRoot: string; cacheBust?: unknown }): Promise<StaticPage[]>;

/** Renders the pages into the built site. Returns the URLs that were written. */
export function prerender(options: {
  projectRoot: string;
  outDir: string;
  fetchFunction?: BuildConfig['fetchFunction'];
  pages: PageRecord[];
  cacheBust?: unknown;
  timeoutMs?: number;
  stateForBrowser?: BuildConfig['stateForBrowser'];
  basePath?: string;
}): Promise<string[]>;
