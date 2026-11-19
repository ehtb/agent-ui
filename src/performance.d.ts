// Type declarations for `@ehtb/agent-ui/performance` (src/performance.js). Reference: docs/API.md, "Performance plugin".
import type { PageHead, PagePluginEnvironment } from './pages.js';
import type { AppApi, Namespaces, Plugin, SpecNode } from './ui.js';

export interface PerformanceFinding {
  kind: 'spec' | 'dom-size' | 'list-rows' | 'unmemoized-derive' | 'slow-action' | 'unused-css' | 'lcp-lazy-image' | 'lcp-priority' | 'cls' | 'long-task';
  message: string;
  details: Record<string, any>;
}

export interface AuditSpecOptions {
  head?: PageHead;
  namespaces?: Namespaces;
  hasReady?: boolean;
  where?: string;
}

export interface PerformanceOptions extends AuditSpecOptions {
  onReport?: (finding: PerformanceFinding) => void;
  /** Maximum rendered DOM elements before warning (default 1500, Lighthouse's threshold). */
  elements?: number;
  /** Maximum rows rendered in one list before warning (default 100). */
  listRows?: number;
  /** Maximum milliseconds to recompute the derived values one action made stale (default 16). */
  actionMs?: number;
  /** Maximum milliseconds for a main-thread task before warning (default 50). */
  longTaskMs?: number;
  /** Maximum ratio (0 to 1) of unused CSS rules in a stylesheet with >= 10 rules (default 0.5). */
  unusedCssRatio?: number;
}

/** Static Lighthouse-aligned checks over a spec and its page declaration. Returns a list of "where: problem. fix" strings. */
export function auditSpecPerformance(spec: SpecNode, options?: AuditSpecOptions): string[];

/** The performance plugin for app(): `plugins: [performance]` or `plugins: [performance({ elements: 1500 })]`. */
export function performance(options?: PerformanceOptions): Plugin;
export function performance(api: AppApi): void;

/** The performance plugin as a page lists it: `plugins: [withPerformance]` or `plugins: [withPerformance({ elements: 1500 })]` in page.js. */
export function withPerformance(options?: PerformanceOptions): (environment: PagePluginEnvironment) => Plugin;
export function withPerformance(environment: PagePluginEnvironment): Plugin;
