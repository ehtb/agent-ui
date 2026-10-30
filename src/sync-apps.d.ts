import type { AppApi } from './ui.js';

export interface SyncAppsOptions {
  /** The app that owns the data (the value app() returned). */
  from: AppApi;
  /** The app that wants to know; it changes only through `action`, so its own log stays complete. */
  to: AppApi;
  /** Qualified state or derived keys of `from`. */
  watch: string[];
  /** A qualified action of `to` ("badge.set"). */
  action: string;
  /** Each argument of `action` -> the watched key that supplies it. Must match the action's declared arguments exactly. */
  args: Record<string, string>;
}
/**
 * One-way state sync between two separate apps on the same page. Not for sharing state inside one app, not two-way.
 * Sends the current values at once, then on every change; quiet while either app is replaying. Returns a disposer.
 */
export function syncApps(options: SyncAppsOptions): () => void;
