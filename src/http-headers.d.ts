/** A value of a response header: a string, a number, or (for `set-cookie` only) a list of them. */
export type ResponseHeaderValue = string | number | string[];
export type ResponseHeaders = Record<string, ResponseHeaderValue>;
/** Headers after the check: names lower case, values strings, and only `set-cookie` may be a list. */
export type CheckedResponseHeaders = Record<string, string | string[]>;
export interface CheckResponseHeadersOptions {
  /** How the value is named in an error ("headers", "the headers of an outcome"). */
  name?: string;
  /** Header names this response writes itself, so the author must leave them out. */
  reserved?: readonly string[];
  /** Framework-owned header names this particular response may set (a raw API answer sets its own content type). */
  allow?: readonly string[];
}
/** Check and normalize response headers; undefined when there are none. */
export function checkResponseHeaders(headers: ResponseHeaders | null | undefined, where: string, options?: CheckResponseHeadersOptions): CheckedResponseHeaders | undefined;
/** Lay response headers over each other; `set-cookie` values are joined, every other name is replaced. */
export function mergeResponseHeaders(...layers: Array<CheckedResponseHeaders | null | undefined>): CheckedResponseHeaders;
