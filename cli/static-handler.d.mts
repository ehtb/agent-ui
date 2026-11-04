import type { IncomingMessage, ServerResponse, Server } from 'node:http';

export interface StaticOptions {
  /** Changes every HTML file sent from disk for example to add a script. */
  transformHtml?: ((html: string) => string) | null;
  /** Returns `[{ pattern: '/product/:id', page: 'product-id.html' }]` (most specific first): the page shell to send for a URL that matches and has no file. */
  rewrites?: () => { pattern: string; page: string }[];
  /** The directory served with immutable caching: a name. Default `'assets'`. */
  assetsDir?: string;
  /** Handles a request before anything else; return true when it answered. */
  intercept?: ((request: IncomingMessage, response: ServerResponse, pathname: string) => Promise<boolean>) | null;
  /** The Host names the handler answers to (another gets 421: DNS rebinding). `null`, the default: any. */
  hosts?: readonly string[] | null;
  /** Called with errors the handler turns into a 500. Default `console.error`. */
  onError?: (error: unknown) => void;
  /** Serves the site below this path, for example '/shop': a path outside it is not this site's (404, or `next()`). Default ''. */
  basePath?: string;
}
export type StaticHandler = (request: IncomingMessage, response: ServerResponse, next?: (error?: unknown) => void) => Promise<void>;
/** A request listener for a directory of built files. With `next`, requests it would answer 403, 404 or 405 go to `next()`. */
export function createStaticHandler(rootDirectory: string, options?: StaticOptions): StaticHandler;
export function createStaticServer(rootDirectory: string, options?: StaticOptions): Server;
