import type { RequestContext } from '../server/request.mjs';
/** One page found in the folders below pages/ (added by loadConfig; never written in the configuration). */
export interface PageRecord {
  /** The file and folder name in the output: "index" for "/", "event-id" for "/event/:id". */
  name: string;
  /** The URL pattern: "/", "/about", "/event/:id", "/docs/*path". */
  path: string;
  /** The generated module the server imports (create, createShell, describePage, ...). */
  app: string;
  /** The page.js the page comes from. */
  file: string;
  /** The view.js whose content the page ships; loadConfig sets it (a page list written by hand does not need it). */
  viewFile?: string;
}
/** What build.config.mjs returns (or returns from a function of the mode). Unknown options are errors. Which pages exist is not configured: it follows from the folders below pages/. */
export interface BuildConfig {
  outDir?: string;
  assetsDir?: string;
  publicDir?: string | string[] | null;
  hash?: boolean;
  /** Writes a `.map` file next to every chunk. */
  sourceMaps?: boolean;
  minify?: boolean;
  transform?: ((code: string, context: { file: string; kind: 'javascript' | 'css' }) => string) | null;
  manualChunks?: Record<string, string[]>;
  /** Shared chunks smaller than this many bytes of source are folded into a bigger shared chunk (default 4096; 0 turns it off). */
  minSharedChunkBytes?: number;
  replaceModules?: Record<string, string>;
  api?: string;
  /** Answers the data requests a page makes while it is rendered (`agent-ui build --static`, `agent-ui check`, `agent-ui serve`). There is no default source. */
  fetchFunction?: (url: string, init?: RequestInit) => Promise<unknown>;
  /** How long a page that declares `ready` may take to become ready while it is rendered (default 2000). */
  renderTimeoutMs?: number;
  /** The state a browser may receive: keep the page's namespaces and keys, leave a server-only key out. It cannot add a namespace or key. The markup is rendered from the full state. */
  stateForBrowser?: ((state: Record<string, any>, request: RequestContext | null) => Record<string, any> | Promise<Record<string, any>>) | null;
}
/** The configuration after loadConfig: the user's options plus the pages, the entries the bundler builds from them and the configuration file they came from. */
export interface LoadedConfig extends BuildConfig {
  outDir: string;
  /** The configuration file that was loaded (relative to the project root); a build stamps it. */
  configFile: string;
  pages: PageRecord[];
  entries: { name: string; path: string; url: string }[];
}
export const DEFAULT_OUT_DIR: 'dist';
/** Reads and checks build.config.mjs, finds the pages and writes their generated modules to .agent-ui/. Throws with every problem listed. */
export function loadConfig(options?: {
  root?: string;
  file?: string;
  mode?: { dev?: boolean; validator?: 'include' | 'omit' };
  fresh?: boolean;
}): Promise<LoadedConfig>;
