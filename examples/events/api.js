// Server side of the events example (Node only; never bundled for the browser). Loaded by server/ssr-handler.mjs when
// the build config names it as `api`. Each page owns its endpoints; composeApi mounts them below /api/<name>/.
import { composeApi } from './compose-api.js';
import { createEventApi } from './pages/event/[id]/api.js';
import { createContactApi } from './pages/contact/api.js';

// One instance per process: the HTTP endpoints (server/ssr-handler.mjs) and the in-process answers used while rendering
// (server-fetch.mjs) must see the same data.
let shared = null;
const buildApi = () => {
  const { registrations, ...event } = createEventApi(); // what is not part of the route's table stays with the caller
  const { messages, ...contact } = createContactApi();
  return { ...composeApi({ routes: { event, contact } }), registrations, messages };
};

export const createApi = () => (shared ??= buildApi());
