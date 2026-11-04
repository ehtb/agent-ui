import type { AppApi } from '../src/ui.js';
import type { RequestContext } from './request.mjs';

export interface CreateEnvironment {
  root: any;
  win: any;
  fetchFunction: (url: string, init?: object, request?: RequestContext | null) => Promise<any>;
  dev: boolean;
  /** Overrides the page's `debug` flag. The server renders with false; a browser leaves it out and the page decides. */
  debug?: boolean;
  initialState: Record<string, any>;
  /** The app of the page's shell, when it has one. */
  shell?: AppApi | null;
  /** True when the app started from state a server wrote: false while rendering on the server. */
  serverRendered?: boolean;
  /** The path the site is served below ('' for the root). */
  basePath?: string;
}
export function renderPage(
  create: (environment: CreateEnvironment) => AppApi,
  options: {
    url?: string;
    fetchFunction?: CreateEnvironment['fetchFunction'];
    timeoutMs?: number;
    dev: boolean;
    initialState?: Record<string, any>;
    createShell?: ((environment: Omit<CreateEnvironment, 'initialState' | 'shell'>) => AppApi) | null;
    request?: RequestContext | null;
    /** The state a browser may receive: keep the namespaces and keys the page declares, leave a server-only key out. It cannot add a namespace or key. The markup is rendered from the full state. */
    stateForBrowser?: ((state: Record<string, any>, request: RequestContext | null) => Record<string, any> | Promise<Record<string, any>>) | null;
    /** Stops the render when the client goes away; defaults to `request.signal`. The rejected error has `name: 'AbortError'`. */
    signal?: AbortSignal | null;
    /** The path the site is served below, for example '/shop': `url` is the site's own path; the page's root-absolute URLs carry the base. Default ''. */
    basePath?: string;
  },
): Promise<{ html: string; state: Record<string, unknown>; stateScript: string; ui: AppApi; shell: boolean; shellApp: AppApi | null; timedOut: boolean; basePath: string }>;
/** Used when no fetchFunction is given: absolute http(s) URLs go to the real fetch, a relative URL fails with the fix. */
export const defaultFetchFunction: CreateEnvironment['fetchFunction'];
export function createServerWindow(url?: string): any;
/** Ends the page's app and its shell's; the shell is ended last even when the page's cleanup throws. */
export function destroyApps(ui: AppApi | null | undefined, shellApp?: AppApi | null): void;
/** A TypeError or ReferenceError from a plugin on the server window, with the fix added; any other error unchanged. */
export function explainServerFailure(error: unknown): unknown;
export function stateScriptHtml(state: unknown, elementId?: string): string;
