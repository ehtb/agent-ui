/** A real browser for tests: Chrome, headless, driven over the DevTools protocol (no dependency). See the top of browser.mjs. */
export interface BrowserPage {
  evaluate(expression: string): Promise<any>;
  /** Waits until the expression is true in the page; `timeout` defaults to 8000 ms. */
  until(expression: string, what: string, options?: { timeout?: number }): Promise<void>;
  report: { loads: string[]; console: string[] };
  send(method: string, params?: Record<string, unknown>): Promise<any>;
  click(selector: string): Promise<void>;
  doubleClick(selector: string): Promise<void>;
  type(selector: string, text: string, options?: { replace?: boolean }): Promise<void>;
  press(key: string, modifiers?: number): Promise<void>;
  settle(): Promise<boolean>;
  auditPerformance(options?: { unusedCssRatio?: number; maxDomElements?: number }): Promise<{
    renderBlockingResources: { url: string; transferSize: number; duration: number }[];
    stylesheets: { href: string; totalRules: number; unusedRules: number; unusedRatio: number }[];
    domElements: number;
    problems: string[];
  }>;
}
export interface Browser {
  open(url: string): Promise<BrowserPage>;
  close(): Promise<void>;
}
export function findChrome(): string | null;
export function launchBrowser(): Promise<Browser | null>;
export function serveSite(options: { projectRoot: string; outDir?: string; dev?: boolean }): Promise<{ url: string; close(): void }>;
