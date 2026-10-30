import type { Plugin } from './ui.js';

/** {eventName or "keydown.Control+k": [actionName, args?, options?]}; args are literals or {event: "path"}. */
export function windowEvents(target: any, handlers: Record<string, [string, Record<string, unknown>?, { preventDefault?: boolean; stopPropagation?: boolean }?]>): Plugin;
