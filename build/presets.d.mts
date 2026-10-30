/**
 * The framework's own build settings: the runtime chunk, validator handling, `minify` and `hash`.
 * Spread it into your build config: `{ ...frameworkBuildOptions({ dev, validator, projectRoot }), entries: ... }`.
 * Production leaves the spec validator out (`validator: 'omit'`); development includes it.
 */
export function frameworkBuildOptions(options?: {
  dev?: boolean;
  validator?: 'include' | 'omit';
  /** The directory the build runs in. Default: the current directory. */
  projectRoot?: string;
}): {
  manualChunks: Record<string, string[]>;
  replaceModules: Record<string, string>;
  minify: boolean;
  hash: boolean;
};
