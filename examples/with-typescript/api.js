// The server side of the board (Node only; never bundled for the browser). The same zod schemas as the pages: `MoveBody` checks what
// arrives, and the types of the handlers come from them, so `tsc` proves the handlers return what the pages expect.
import { MoveBody } from './pages/schemas.js';

/** @typedef {import('./pages/schemas.js').TaskItem} TaskItem */

/** @returns {TaskItem[]} */
const initialTasks = () => [
  { id: 1, title: 'Write the schema', status: 'done', estimate: 2, labels: ['api'] },
  { id: 2, title: 'Check the answers', status: 'doing', estimate: null, labels: ['api', 'server'] },
  { id: 3, title: 'Check the page', status: 'todo', estimate: 1, labels: [] },
];

const build = () => {
  let tasks = initialTasks();
  return {
    apiBase: '/api',
    /** @param {{ method: string, pathname: string, body?: unknown }} request */
    handle: ({ method, pathname, body }) => {
      if (method === 'GET' && pathname === '/api/tasks') return { status: 200, body: tasks };
      const move = pathname.match(/^\/api\/tasks\/(\d+)\/move$/);
      if (method === 'POST' && move) {
        const task = tasks.find((candidate) => candidate.id === Number(move[1]));
        if (!task) return { status: 404, body: { message: 'No such task.' } };
        const parsed = MoveBody.safeParse(body);
        if (!parsed.success) return { status: 422, body: { message: parsed.error.issues.map((issue) => issue.message).join('; ') } };
        const moved = { ...task, status: parsed.data.status };
        tasks = tasks.map((candidate) => (candidate === task ? moved : candidate));
        return { status: 200, body: moved };
      }
      return pathname.startsWith('/api/') ? { status: 404, body: { message: 'No such endpoint.' } } : null;
    },
    /** Back to the first three tasks (tests). */
    reset: () => {
      tasks = initialTasks();
    },
  };
};

let shared = null; // one instance per process: the answers while rendering and the HTTP endpoints see the same tasks
export const createApi = () => (shared ??= build());
