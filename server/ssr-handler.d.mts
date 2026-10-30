import type { IncomingMessage, ServerResponse } from 'node:http';
import type { BuildConfig } from '../build/config.mjs';
import type { CheckedResponseHeaders, ResponseHeaders } from '../src/http-headers.js';
import type { StateSnapshot } from '../src/ui.js';
import type { RequestContext } from './request.mjs';

export type RequestHandler = (request: IncomingMessage, response: ServerResponse, next?: (error?: unknown) => void) => void | Promise<void>;
export interface SsrOptions {
  /** The build configuration (what `loadConfig` returns). */
  config: BuildConfig;
  root?: string;
  outDir?: string;
  /** Largest request body the API and form handling reads, in bytes. Default 100000. */
  maxBodyBytes?: number;
  /** How long a page that declares `ready` may take to become ready. Default: `config.renderTimeoutMs` or 2000. */
  timeoutMs?: number;
  /** What a page that did not become ready in time answers: `'error'` (503, the default) or `'serve'` (the partial page with 200). */
  onTimeout?: 'error' | 'serve';
  /** Where render timeouts and similar warnings go. Default: `console.warn`. */
  log?: (message: string) => void;
  /** Called with the error behind every 500, and the request context when there is one. The visitor is only told "internal server error". Default: `console.error`. */
  onError?: (error: unknown, request?: RequestContext) => void;
  /** The Host names the handler answers to (a request with another Host header gets 421, which stops DNS rebinding). `null`, the default, answers to any: a host that serves the public leaves it out. */
  hosts?: readonly string[] | null;
  /**
   * The public state a page starts from, for example `{ session: { user: request.cookies.session ?? null } }`.
   * Every key must be declared by the page, and the result is written into the document: keep a session token in an
   * HttpOnly cookie, never in this state. The server waits for the result; null or undefined means no extra state.
   */
  initialStateFor?: ((request: RequestContext) => StateSnapshot | null | undefined | Promise<StateSnapshot | null | undefined>) | null;
  /**
   * The state a browser may receive, after the page has rendered: keep the namespaces and keys the page declares and leave a
   * server-only key out. It cannot add a key. The markup is already rendered from the full state, so this does not hide a
   * value the page shows. Defaults to `config.stateForBrowser`.
   */
  stateForBrowser?: ((state: StateSnapshot, request: RequestContext) => StateSnapshot | Promise<StateSnapshot>) | null;
  /**
   * The one hook over a finished answer this handler writes once a request context exists (except the 421 and the
   * malformed-URL 400, which are written before it): pages, API answers, form outcomes, its 404 and 500, and the 400 for a
   * body it cannot read. It may add or replace response headers (CSP, HSTS, a site cookie, a cache policy) and rewrite
   * the body (for example a CSP nonce on inline scripts; the body may be HTML, JSON or plain text, so check the content
   * type first). A binary raw answer has no text: its `body` is empty, and returning a body for it is refused while its
   * headers still change. The headers it returns go through the same check as every other header; `set-cookie` values add up.
   * Return null or undefined to leave the answer as it is. It does not run for a request this handler does not answer,
   * nor for the 421 and 400 answered before a request context exists.
   */
  transformResponse?: ((request: RequestContext, response: Readonly<{ status: number; headers: CheckedResponseHeaders; body: string }>) => TransformResponseResult | null | undefined | Promise<TransformResponseResult | null | undefined>) | null;
}
export interface TransformResponseResult {
  /** Headers to add to or replace in the answer. `set-cookie` values add up. */
  headers?: ResponseHeaders;
  /** The whole body to write instead, as a string. */
  body?: string;
}
/** A request listener that renders the pages with real URLs per request, plus the project's API and form posts. Fits `app.use(handler)`; whatever it does not answer goes to `next()`. */
export function createSsrHandler(options: SsrOptions): Promise<RequestHandler>;
