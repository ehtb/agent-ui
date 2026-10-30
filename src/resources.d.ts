import type { Plugin } from './ui.js';

export interface ResourceRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}
export interface ResourceDefinition {
  /** Keys the request depends on: keys of the declaring namespace plain, keys of other namespaces as "namespace.key". */
  watch: string[];
  /** Return null when there is nothing to load right now (cancels what is in flight). */
  request: (values: Record<string, any>) => ResourceRequest | null;
  /** The verbs (no namespace prefix) of actions of the declaring namespace. */
  onStart: string;
  onSuccess: string;
  onError: string;
  /** Optional, args {}: dispatched when `request` returns null while a request is in flight. */
  onCancel?: string;
  /** Optional, args {}: dispatched when `request` returns null after a request started or settled (after onCancel when one was in flight). */
  onIdle?: string;
  /** Optional state keys of the declaring namespace (no prefix) that only this resource's lifecycle actions may write. */
  owns?: string[];
  /** Optional check of the JSON the request answers (zod: `Items.parse`). It throws when the data does not fit; then onError runs with the message and onSuccess does not. */
  response?: (data: unknown) => unknown;
  delayMs?: number;
  /**
   * Optional. `'never'`: the server already ran this resource and its result is in the state the document carries, so do not
   * load it again on mount in the browser. A later change to a watched key still loads. Requires `owns`. Default: load on mount.
   */
  revalidate?: 'never';
}
/** The plugin as a page lists it: `plugins: [withResources]`. */
export function withResources(environment: { fetchFunction: any; win?: any; serverRendered?: boolean }): Plugin;
/** Runs the `resources` of every namespace of the app. */
export function resources(fetchFunction: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<any>, options?: { win?: any; serverRendered?: boolean }): Plugin;
