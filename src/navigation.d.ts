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
/** The plugin with its parts injectable (tests, unusual hosts). It adds `navigate(href)` to the shell's app. */
export function navigation(options: NavigationOptions): Plugin;
/** The plugin as a shell lists it: `defineShell({ plugins: [withNavigation] })`. */
export function withNavigation(environment: { win: any; fetchFunction: any; shellName: string }): Plugin;
