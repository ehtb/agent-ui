// The board: three columns of tasks loaded from the server. Behavior only; the content is view.js next to this file.
// The types come from the zod schemas: `TaskItem` is what a task is, and the actions say so in their JSDoc, so `tsc -p .` proves that the
// code which moves data into state agrees with them. The resources use the same schemas to check every answer: `response: Tasks.parse`.
import { withResources } from '@ehtb/agent-ui/resources';
import { Task, Tasks } from './schemas.js';
import { COLUMNS, inColumn, moveTask } from './tasks.js';

/** @typedef {import('./schemas.js').TaskItem} TaskItem */
/** @typedef {import('./schemas.js').MoveBody} MoveBody */

// Every field of a task ("json" is any value): a field the data has and the shape does not is reported when it is written.
/** @type {Record<string, 'string' | 'number' | 'json'>} */
const TASK_FIELDS = { id: 'number', title: 'string', status: 'string', estimate: 'json', labels: 'json' };

/** @type {import('@ehtb/agent-ui').Namespace} */
const board = {
  state: { tasks: [], status: 'idle', error: '', moveRequest: null },
  // The fields the view reads from a task: a typo in an {item} binding fails when the page mounts, and writes are checked in development.
  shapes: { tasks: { fields: TASK_FIELDS }, todo: { fields: TASK_FIELDS }, doing: { fields: TASK_FIELDS }, done: { fields: TASK_FIELDS } },
  derive: {
    todo: (get) => inColumn(get('tasks'), 'todo'),
    doing: (get) => inColumn(get('tasks'), 'doing'),
    done: (get) => inColumn(get('tasks'), 'done'),
    summary: (get) => COLUMNS.map((column) => `${inColumn(get('tasks'), column.status).length} ${column.title.toLowerCase()}`).join(', '),
  },
  actions: {
    loading: { args: {}, run: (store) => { store.set('status', 'loading'); store.set('error', ''); } },
    loaded: {
      args: { data: 'json' },
      /** @type {import('@ehtb/agent-ui').ActionDefinition<{ data: TaskItem[] }>['run']} */
      run: (store, { data }) => { store.set('tasks', data); store.set('status', 'ready'); },
    },
    failed: { args: { message: 'string' }, run: (store, { message }) => { store.set('status', 'failed'); store.set('error', message); } },
    move: {
      args: { id: 'number', status: 'string' },
      /** @type {import('@ehtb/agent-ui').ActionDefinition<{ id: number, status: TaskItem['status'] }>['run']} */
      run: (store, { id, status }) => store.set('moveRequest', { id, status }),
    },
    moveStarted: { args: {}, run: (store) => store.set('error', '') },
    moved: {
      args: { data: 'json' },
      /** @type {import('@ehtb/agent-ui').ActionDefinition<{ data: TaskItem }>['run']} */
      run: (store, { data }) => { store.set('tasks', moveTask(store.get('tasks'), data.id, data.status)); store.set('moveRequest', null); },
    },
    moveFailed: { args: { message: 'string' }, run: (store, { message }) => { store.set('error', message); store.set('moveRequest', null); } },
  },
  resources: [
    { watch: [], owns: ['status'], request: () => ({ url: '/api/tasks' }), onStart: 'loading', onSuccess: 'loaded', onError: 'failed', response: Tasks.parse },
    {
      watch: ['moveRequest'],
      request: (values) => {
        const { moveRequest } = /** @type {{ moveRequest: { id: number, status: MoveBody['status'] } | null }} */ (values);
        return moveRequest ? { url: `/api/tasks/${moveRequest.id}/move`, method: 'POST', body: /** @type {MoveBody} */ ({ status: moveRequest.status }) } : null;
      },
      onStart: 'moveStarted',
      onSuccess: 'moved',
      onError: 'moveFailed',
      response: Task.parse,
    },
  ],
};

/** @type {import('@ehtb/agent-ui/pages').Page} */
export const page = {
  head: { title: 'Board - TypeScript example' },
  namespaces: { board },
  plugins: [withResources],
  ready: (state) => state.board.status === 'ready' || state.board.status === 'failed',
};
