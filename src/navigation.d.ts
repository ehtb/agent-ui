import type { Plugin } from './ui.js';

export interface NavigationOptions {
  win: any;
  fetchFunction: (url: string, init?: object) => Promise<any>;
  /** The name of the shell this plugin belongs to: a page of another shell is loaded normally. */
  shellName: string;
  /** Loads the entry file of the next page. Default: a dynamic import(). */
  importModule?: (url: string) => Promise<unknown>;
  /** Adds a stylesheet and resolves when it has loaded. Default: a <link> in the document's head. */
  loadStylesheet?: (href: string) => Promise<unknown>;
}
/** What a soft navigation reads from a document's text: the state the page starts from, its entry file and its stylesheets. */
export function readDocument(text: string): { state: Record<string, any>; entryUrl: string | null; stylesheets: string[] };
/** Fetches the document of a link as a page load would get it: { text, key } for a plain page (`key`: the site's path and search it came from, which a redirect to this site moves), { reason } for what a soft navigation cannot show in place. A fetch that throws throws. Without `origin` a redirect is a reason. */
export function fetchPlainDocument(
  fetchFunction: (url: string, init?: object) => Promise<any>,
  key: string,
  options?: { origin?: string | null; basePath?: string },
): Promise<{ text: string; key: string; reason?: undefined } | { reason: string; text?: undefined; key?: undefined }>;
/** The plugin with its parts injectable (tests, unusual hosts). It adds `navigate(href)` to the shell's app, and `extendNavigation({ document, swap })` and `softLinkTarget(element)` for the plugins listed after it (`withPrefetch`, `withViewTransition`). */
export function navigation(options: NavigationOptions): Plugin;
/** The plugin as a shell lists it: `defineShell({ plugins: [withNavigation] })`. */
export function withNavigation(environment: { win: any; fetchFunction: any; shellName: string; basePath?: string }): Plugin;
