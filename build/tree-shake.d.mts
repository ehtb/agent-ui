import type { BuildConfig } from './config.mjs';

/** The tool for `treeShake` in build.config.mjs, made from the esbuild module the project installs (the framework never imports it). */
export function esbuildTreeShake(esbuild: { transformSync(code: string, options: object): { code: string; map: string } }, options?: {
  /** Calls with no effect that esbuild may drop when their result is unused, for example `['defineElement', 'Object.freeze']`. */
  pure?: string[];
}): NonNullable<BuildConfig['treeShake']>;
