// Type declarations for `@ehtb/agent-ui/follow` (src/follow.js). Reference: docs/API.md, "Following the pointer".
import type { Plugin } from './ui.js';

/** The plugin behind the `follow` prop, for app(): `plugins: [follow]`. While `follow` is true the element tracks the pointer through --follow-x / --follow-y. */
export const follow: Plugin;
/** The same plugin as a page lists it: `plugins: [withFollow]` in page.js. */
export function withFollow(environment?: unknown): Plugin;
