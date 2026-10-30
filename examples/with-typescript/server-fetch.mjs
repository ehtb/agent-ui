// Where this example's pages get their data while they are rendered on the server (`agent-ui check`, `agent-ui serve`):
// requests to /api/ are answered in process by api.js, the same instance that serves the HTTP endpoints.
import { createApi } from './api.js';

export const fetchFunction = async (url, init = {}) => {
  const { pathname } = new URL(url, 'http://localhost');
  const answer = createApi().handle({ method: init.method ?? 'GET', pathname, body: init.body ? JSON.parse(init.body) : {} });
  return answer ? Response.json(answer.body, { status: answer.status }) : new Response(null, { status: 404 });
};
