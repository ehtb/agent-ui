import type { BuildConfig, PageRecord } from './config.mjs';

/** What the bundler takes: the loaded configuration without the project's own options, or entries written out (tests). */
export type BuildOptions = Omit<BuildConfig, 'api' | 'fetchFunction'> & {
  projectRoot: string;
  entries: { name: string; path: string }[];
  pages?: PageRecord[];
  configFile?: string;
};

/** One page in the built site, as `manifest.json` describes it. */
export interface BuildPage {
  html: string;
  entryChunk: string;
  chunksLoadedAtStartup: string[];
  lazyChunks: string[];
  stylesheets: string[];
  stylesheetsSize: { bytes: number; gzipBytes: number };
  /** What a first visit downloads before the page runs: JavaScript and stylesheets, each file gzipped on its own. */
  startupSize: { bytes: number; gzipBytes: number };
}

/** One chunk in the built site, as `manifest.json` describes it. */
export interface BuildChunk {
  /** Why the chunk exists: 'manual', 'entry', 'lazy (dynamic import)' or 'shared by ...'. */
  reason: string;
  javascript: string;
  sourceMap?: string;
  stylesheet?: string;
  modules: string[];
  /** Bytes of each module's code inside the chunk. */
  moduleSizes: Record<string, number>;
  /** True when a page downloads it at startup, false when only a dynamic import fetches it. */
  loadsEagerly: boolean;
  /** The chunks it imports statically, and the ones it may fetch later. */
  imports: string[];
  lazyImports: string[];
  size: { bytes: number; gzipBytes: number };
  stylesheetSize?: { bytes: number; gzipBytes: number };
}

/** What a build returns: the manifest written to `manifest.json`, plus what the report says about it. */
export interface BuildManifest {
  pages: Record<string, BuildPage>;
  chunks: Record<string, BuildChunk>;
  assetsDir: string;
  basePath: string;
  /** The source files the build was made from, and their stamp (what `agent-ui serve` compares to detect a stale build). */
  sources: { files: string[]; hash: string };
  /** Problems the build found that do not stop it (view code in a browser bundle); `formatReport` prints them. */
  warnings: string[];
}

/** Builds the site into `config.outDir` and returns the manifest. Throws a BuildError that names the file. */
export function build(config: BuildOptions): BuildManifest;

/** Refuses an output directory that is not plainly a build output (the project root, a source directory, a project). */
export function assertSafeOutputDirectory(options: { projectRoot: string; outDir: string; entryPaths: string[]; publicDirectories: string[] }): void;
