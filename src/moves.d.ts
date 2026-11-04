// Type declarations for `@ehtb/agent-ui/moves` (src/moves.js). Reference: docs/API.md, "Moves".
import type { Plugin } from './ui.js';

/** Slides a row with `transition` to its new place when its list reorders, for app(): `plugins: [moves]`. Without it the rows jump. */
export const moves: Plugin;
/** The same plugin as a page lists it: `plugins: [withMoves]` in page.js. */
export function withMoves(environment?: unknown): Plugin;
