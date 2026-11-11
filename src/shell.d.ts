import type { Namespace, Plugin, SpecNode } from './ui.js';

export interface ShellRead {
  /** Qualified keys of the page's app. */
  watch: string[];
  /** A qualified action of the shell ("frame.setCartCount"). */
  action: string;
  /** Each argument of the action -> the watched key that supplies it. */
  args: Record<string, string>;
}
export interface ShellDefinition {
  /** The name view.js repeats (`export const shell = { name, view }`). */
  name: string;
  /** What the shell keeps in state. "route" is reserved: route.path is the path of the page that is showing. */
  namespaces?: Record<string, Namespace>;
  /** True makes the browser console show what the shell's app does. Default false. */
  debug?: boolean;
  /** What the shell needs from outside its state, for example [withNavigation]. */
  plugins?: ((environment: ShellPluginEnvironment) => Plugin)[];
  /** What the shell shows of the page, one way (syncApps). Checked when a page starts with the shell. */
  reads?: ShellRead[];
}
/** What a shell's plugin factory receives: the app's environment, the shell's name and, for withNavigation, its base path. */
export interface ShellPluginEnvironment {
  root: any;
  win: any;
  fetchFunction: any;
  dev: boolean;
  shellName: string;
  basePath?: string;
  isServerRendering?: boolean;
  serverRendered?: boolean;
  /** True for the first start of a server-rendered document: the shell takes over the server's markup (a shell that reads from its page does so without reporting differences). */
  adopt?: boolean;
  initialState?: Record<string, Record<string, any>>;
}
export interface Shell {
  kind: 'shell';
  name: string;
  /** Every namespace the shell's app has (its own and `route`). */
  namespaces: Record<string, Namespace>;
  createApp(environment: { root: any; win: any; fetchFunction: any; dev?: boolean; basePath?: string; isServerRendering?: boolean }, view: SpecNode): any;
  /** What the shell adds to the route namespace of its pages: route.destination and route.go. */
  route: { state: Record<string, unknown>; actions: Record<string, unknown> };
  /** The first page of a browser document, with the shell around it. */
  start(entry: any, environment: any): { entry: any; ui: any; shellApp: any; slot: any };
  connect(pageApp: any, shellApp: any, win: any, basePath?: string): () => void;
}
/** The shell's behavior, imported by the page.js of every page that uses it. Its content is `{ name, view }` exported from view.js. */
export function defineShell(definition: ShellDefinition): Shell;
