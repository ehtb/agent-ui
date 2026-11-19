import type { Plugin } from './ui.js';

/** What `withPrefetch({ ... })` takes: two more triggers (each costs a server render for a link that may not be followed) and how long a fetched document is used. */
export interface PrefetchChoices {
  /** Also fetch at the press, for any pointer (a touch has no hover). Default false. */
  pointerdown?: boolean;
  /** Also fetch a soft link once when it scrolls into view. Default false. */
  viewport?: boolean;
  /** Milliseconds a fetched document is used, 1000 to 600000 (default 5000). */
  maxAge?: number;
}
export interface PrefetchOptions extends PrefetchChoices {
  win: any;
  fetchFunction: (url: string, init?: object) => Promise<any>;
  /** The path the site is served below (default: the root), to read where a redirect led. */
  basePath?: string;
  /** The clock that ages a fetched document (default: Date.now), for tests. */
  now?: () => number;
}
/** The plugin with its parts injectable (tests, unusual hosts). The shell lists the navigation plugin before it. */
export function prefetch(options: PrefetchOptions): Plugin;
/** The plugin as a shell lists it: `defineShell({ plugins: [withNavigation, withPrefetch] })`, or `withPrefetch({ viewport: true })` to choose triggers. */
export function withPrefetch(environment: { win: any; fetchFunction: any; basePath?: string }): Plugin;
export function withPrefetch(choices?: PrefetchChoices): (environment: { win: any; fetchFunction: any; basePath?: string }) => Plugin;
