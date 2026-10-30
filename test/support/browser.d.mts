/** A real browser for tests: Chrome, headless, driven over the DevTools protocol (no dependency). See the top of browser.mjs. */
export interface BrowserPage {
  evaluate(expression: string): Promise<any>;
  until(expression: string, what: string): Promise<void>;
  report: { loads: string[]; console: string[] };
  send(method: string, params?: Record<string, unknown>): Promise<any>;
  click(selector: string): Promise<void>;
  doubleClick(selector: string): Promise<void>;
  type(selector: string, text: string, options?: { replace?: boolean }): Promise<void>;
  press(key: string, modifiers?: number): Promise<void>;
  settle(): Promise<boolean>;
}
export interface Browser {
  open(url: string): Promise<BrowserPage>;
  close(): Promise<void>;
}
export function findChrome(): string | null;
export function launchBrowser(): Promise<Browser | null>;
export function serveSite(options: { projectRoot: string; outDir?: string; dev?: boolean }): Promise<{ url: string; close(): void }>;
