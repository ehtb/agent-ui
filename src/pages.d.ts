import type { Namespace, Plugin, SpecNode, StateSnapshot } from './ui.js';
import type { Shell } from './shell.js';

/** A value of an attribute: a literal, or a function of the state snapshot. false, null and undefined leave the attribute out; true writes it bare. */
export type HeadValue = string | number | boolean | null | undefined | ((state: StateSnapshot) => string | number | boolean | null | undefined);
export type HeadAttributes = Record<string, HeadValue>;
/** An element of the document: meta and link follow the state; script, style and base are written once, with literal attributes. */
export interface LiteralHeadElement<Tag extends string = 'meta' | 'link' | 'base' | 'script' | 'style'> {
  tag: Tag;
  props?: HeadAttributes;
  /** The text of a script or style: a literal string. */
  children?: string;
}
/** A script of a data type (application/ld+json, application/json, importmap, speculationrules) may build its text from the state, from a string or any JSON value. */
export interface DataScriptElement {
  tag: 'script';
  props: HeadAttributes & { type: 'application/ld+json' | 'application/json' | 'importmap' | 'speculationrules' };
  children?: string | ((state: StateSnapshot) => unknown);
}
export type HeadElement = LiteralHeadElement | DataScriptElement;
/** The elements at the end of <body>: everything of <head> except base. */
export type BodyElement = LiteralHeadElement<'meta' | 'link' | 'script' | 'style'> | DataScriptElement;
export interface PageHead {
  title: string | ((state: StateSnapshot) => string);
  description?: string | ((state: StateSnapshot) => string);
  /** Attributes of <html> (lang, dir, class, data-*). */
  html?: HeadAttributes;
  /** Attributes of <body>. */
  body?: HeadAttributes;
  /** Elements of <head>: meta, link, base, script, style. */
  tags?: HeadElement[];
  /** Elements at the end of <body>: meta, link, script, style. */
  bodyTags?: BodyElement[];
}
export interface DocumentDescription {
  title: string;
  description: string;
  html: Record<string, string | true>;
  body: Record<string, string | true>;
  tags: { tag: string; attributes: Record<string, string | true>; text: string }[];
  bodyTags: { tag: string; attributes: Record<string, string | true>; text: string }[];
}
export interface Page {
  head: PageHead;
  /** Everything the page keeps in state, by name. "route" is reserved: route.params holds the URL's parameters. */
  namespaces?: Record<string, Namespace>;
  /** True makes the browser console show what the page's app does: the state, and every action with what it changed. Default false. */
  debug?: boolean;
  /** What the page needs from outside its state, imported by the page: `[withResources]`, `[({ win }) => windowEvents(win, {...})]`. */
  plugins?: ((environment: PagePluginEnvironment) => Plugin)[];
  /** True when the page has what it needs. The server waits for it before rendering; the view's `pending` shows until then. */
  ready?: (state: StateSnapshot) => boolean;
  /** HTTP status of the page when a server renders it (404 for an unknown id). */
  status?: (state: StateSnapshot) => number;
  /** The shell this page lives in (defineShell, @ehtb/agent-ui/shell): it stays when a soft link replaces the page. Its content is the `shell` of view.js. */
  shell?: Shell;
}
/** What view.js exports: the content, and optionally the shell around it. */
export interface PageContent {
  view: SpecNode;
  /** (content) => spec: the shell around the content, imported from a shared module. */
  layout?: (content: SpecNode) => SpecNode;
  /** Shown instead of `view` while the page's `ready` is false. Needs `ready` in page.js. */
  pending?: SpecNode;
  /** The content of the shell page.js names: { name, view }, the view holding pageSlot() once. */
  shell?: ShellContent;
  /** A page with parameters: the URLs `agent-ui check` renders and `agent-ui build --static` writes, or a function (possibly async) that returns them. view.js runs only in Node. */
  paths?: string[] | (() => string[] | Promise<string[]>);
}
export interface ShellContent {
  name: string;
  view: SpecNode;
}
/** What a page's plugin factory receives: the app's environment, plus the page it is listed in. */
export interface PagePluginEnvironment {
  root: any;
  win: any;
  fetchFunction: any;
  dev: boolean;
  basePath: string;
  /** True while a server renders the page: a plugin with an effect of its own returns early. */
  isServerRendering: boolean;
  /** True when the browser started from markup and state a server wrote. */
  serverRendered?: boolean;
  initialState?: StateSnapshot;
  debug?: boolean;
  page: { path: string; head: PageHead };
}
/** What create() and mount() receive: the environment, the root to render into, the state to start from and, in a document with a shell, the shell's app. */
export interface PageEnvironment {
  root: any;
  win: any;
  fetchFunction: any;
  dev: boolean;
  basePath?: string;
  isServerRendering?: boolean;
  serverRendered?: boolean;
  initialState?: StateSnapshot;
  debug?: boolean;
  shell?: any;
}
export interface PageDefinition {
  path: string;
  namespaces: Record<string, Namespace>;
  spec: SpecNode;
  /** The page's app. `shell` is the app of the page's shell, when it has one. */
  create: (environment: PageEnvironment) => any;
  /** Creates the page's app and tells it the browser has taken over (route.hydrate). */
  mount: (environment: PageEnvironment) => any;
  /** The shell's app; undefined for a page without a shell. */
  createShell?: (environment: { root: any; win: any; fetchFunction: any; dev: boolean; basePath?: string; isServerRendering?: boolean }) => any;
  shellName?: string;
  /** The namespaces of the shell's app (its own and `route`), for validating its content. */
  shellNamespaces?: Record<string, Namespace>;
  shellContent?: ShellContent;
  describePage: (state: StateSnapshot, options?: { basePath?: string }) => DocumentDescription;
}
/** `view` (with `layout` and `pending`) or `spec` (already built): exactly one is given. A production entry passes `spec`, a development entry `view`/`layout`/`pending`. */
export type PageOptions = { path: string; shell?: ShellContent } & ({ view: SpecNode; layout?: (content: SpecNode) => SpecNode; pending?: SpecNode; spec?: undefined } | { spec: SpecNode; view?: undefined; layout?: undefined; pending?: undefined });
/** The `view`, `layout` and `pending` of a `import * as` view.js module, after checking that it exports nothing else. */
export function contentOf(viewModule: Record<string, unknown>, file: string): { view: SpecNode; layout?: (content: SpecNode) => SpecNode; pending?: SpecNode; shell?: ShellContent };
/** The `page` of an `import * as` page.js module, after checking that the module exports one: a misspelt export fails with the file and the fix. */
export function pageOf(pageModule: Record<string, unknown>, file: string): Page;
export function definePage(page: Page, options: PageOptions): PageDefinition;
/** What a generated browser entry calls: registers the page under `url` (its own file) and starts it when it is the first in the document. */
export function startPage(page: Page, options: { path: string; dev: boolean; basePath?: string; url?: string; spec?: SpecNode; view?: SpecNode; layout?: (content: SpecNode) => SpecNode; pending?: SpecNode; shell?: ShellContent }): PageDefinition;
/** The definition registered by the entry file at `url`, if that file was loaded. */
export function findEntry(url: string): PageDefinition | undefined;
/** What runs in this document: the page's definition and app, its shell app (null without a shell) and the element the page lives in; null before the first page started. Soft navigation keeps it current. */
export function currentPage(): { entry: PageDefinition; ui: any; shellApp: any; slot: any; dev: boolean; basePath: string } | null;
