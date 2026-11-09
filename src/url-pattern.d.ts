export interface CompiledPattern {
  /** Params for a location, or null when it does not match. */
  match: (location: string) => Record<string, string> | null;
  build: (params: Record<string, string>) => string;
  paramNames: string[];
  specificity: number[];
  shape: string;
}
/** Patterns: "/about", "/item/:id" (one segment), "/docs/*path" (the rest, last segment only). */
export function compileUrlPattern(pattern: string): CompiledPattern;
/** Most specific first (literal beats :name beats *name); ties keep their order. */
export function sortBySpecificity<T>(entries: T[], readPattern?: (entry: T) => CompiledPattern): T[];
/** How every place that matches a location normalizes it: "/product/3/" is "/product/3" (the root "/" stays as it is). */
export function withoutTrailingSlash(pathname: string): string;
