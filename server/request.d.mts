import type { IncomingMessage } from 'node:http';

/** The request data a page's state, API and form handler share. */
export interface RequestContext {
  /** Uppercase: "GET", "POST", ... */
  method: string;
  /** As sent, still percent-encoded. */
  pathname: string;
  /** The query string with its "?", or "". */
  search: string;
  /** Decoded query parameters; a repeated name has every value (getAll). */
  query: URLSearchParams;
  /** The request headers, names lower case as Node gives them. */
  headers: Record<string, string | string[] | undefined>;
  /** Raw cookie values, not decoded. */
  cookies: Record<string, string>;
  /** Aborted when the client closes the connection before the answer is written. Pass it to a query or an upstream call; a resource already combines it with its own. */
  signal: AbortSignal | null;
}
/** The cookies of a Cookie header. */
export function parseCookies(header: string | null | undefined): Record<string, string>;
/** One request context from a Node request and the path the handlers read. */
export function createRequestContext(request: Pick<IncomingMessage, 'method' | 'headers'>, location: { pathname: string; search?: string }, options?: { signal?: AbortSignal | null }): RequestContext;
/** True when a redirect or rendered form outcome stays on this site: starts with "/", not "//", no backslash, whitespace, control or non-ASCII character, and no encoded slash or backslash at the start. */
export function isLocalPath(value: unknown): value is string;
/** The URL of a request target; "//about" is a path of this site, not the host "about". */
export function parseRequestUrl(requestUrl: string): URL;
/** The request as a page sees it when a form outcome renders that page: the POST's method, headers and cookies, with the page's path, search and query. */
export function requestContextForUrl(context: RequestContext, url: string): RequestContext;
export const LOOPBACK_HOSTS: readonly string[];
/** True when the Host header of the request is one of `hosts` (null: any host). */
export function isAllowedHost(request: IncomingMessage, hosts: readonly string[] | null): boolean;
/** The hosts a server listening on `address` answers to: this machine's names for a loopback address, null (any) for the rest. */
export function hostsFor(address: string): readonly string[] | null;
