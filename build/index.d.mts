import type { BuildConfig, PageRecord } from './config.mjs';
import type { BuildManifest } from './build.mjs';

export { loadConfig, DEFAULT_OUT_DIR, type BuildConfig, type LoadedConfig, type PageRecord } from './config.mjs';
export { frameworkBuildOptions } from './presets.mjs';
export { build, type BuildOptions, type BuildPage, type BuildChunk, type BuildManifest } from './build.mjs';
/** The pages below pages/, most specific URL first. */
export function discoverPages(projectRoot: string, directory?: string): { name: string; path: string; folder: string; file: string; viewFile: string; stylesheet: string | null }[];
/** Renders the pages into the built site. Returns the URLs that were written. */
export function prerender(options: { projectRoot: string; outDir: string; fetchFunction?: BuildConfig['fetchFunction']; pages: PageRecord[]; cacheBust?: unknown; timeoutMs?: number; stateForBrowser?: BuildConfig['stateForBrowser'] }): Promise<string[]>;
/** The table `agent-ui build` prints. */
export function formatReport(manifest: BuildManifest): string;
