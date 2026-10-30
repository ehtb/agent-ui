import type { BuildConfig, LoadedConfig, PageRecord } from './config.mjs';

export { loadConfig, DEFAULT_OUT_DIR, type BuildConfig, type LoadedConfig, type PageRecord } from './config.mjs';
export { frameworkBuildOptions } from './presets.mjs';
/** What the bundler takes: the loaded configuration without the project's own options, or entries written out (tests). */
export type BuildOptions = Omit<BuildConfig, 'api' | 'fetchFunction'> & { projectRoot: string; entries: { name: string; path: string }[]; pages?: PageRecord[]; configFile?: string };
/** Builds the site into `config.outDir` and returns the manifest. Throws a BuildError that names the file. */
export function build(config: BuildOptions): {
  pages: Record<string, unknown>;
  chunks: Record<
    string,
    {
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
  >;
  assetsDir: string;
  /** Problems the build found that do not stop it (view code in a browser bundle); `formatReport` prints them. */
  warnings: string[];
};
/** The pages below pages/, most specific URL first. */
export function discoverPages(projectRoot: string, directory?: string): { name: string; path: string; folder: string; file: string; viewFile: string; stylesheet: string | null }[];
/** Renders the pages into the built site. Returns the URLs that were written. */
export function prerender(options: { projectRoot: string; outDir: string; fetchFunction?: BuildConfig['fetchFunction']; pages: PageRecord[]; cacheBust?: unknown; timeoutMs?: number; stateForBrowser?: BuildConfig['stateForBrowser'] }): Promise<string[]>;
export function formatReport(manifest: ReturnType<typeof import('./build.mjs').build>): string;
