import type { Server } from 'node:http';
import type { SsrOptions } from '../server/ssr-handler.mjs';

/** The render handler in front of a static server for the built files: what `agent-ui serve` runs. Not for production. */
export function createSsrServer(options: SsrOptions): Promise<Server>;
