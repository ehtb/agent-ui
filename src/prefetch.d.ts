import type { Plugin } from './ui.js';

export interface PrefetchOptions {
  win: any;
  fetchFunction: (url: string, init?: object) => Promise<any>;
  /** The path the site is served below (default: the root), to read where a redirect led. */
  basePath?: string;
  /** The clock that ages a fetched document (default: Date.now), for tests. */
  now?: () => number;
}
/** The plugin with its parts injectable (tests, unusual hosts). The shell lists the navigation plugin before it. */
export function prefetch(options: PrefetchOptions): Plugin;
/** The plugin as a shell lists it: `defineShell({ plugins: [withNavigation, withPrefetch] })`. */
export function withPrefetch(environment: { win: any; fetchFunction: any; basePath?: string }): Plugin;
