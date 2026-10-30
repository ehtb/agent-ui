// What the board's data looks like, written once as zod schemas (zod/mini; a browser bundle gets the file esbuild makes of it, see build.config.mjs).
// zod is the library of this project (agent-ui imports none):
//   - TypeScript takes the types from them (`z.infer`), so `tsc` checks the code that handles the data;
//   - the resources check every answer with them (`response: Tasks.parse` in page.js);
//   - the server checks what it receives with them (api.js).
import * as z from 'zod/mini';

export const Status = z.enum(['todo', 'doing', 'done']);

export const Task = z.object({
  id: z.number(),
  title: z.string(),
  status: Status,
  estimate: z.nullable(z.number()),
  labels: z.array(z.string()),
});
export const Tasks = z.array(Task);

/** What the browser sends to move a task. */
export const MoveBody = z.object({ status: Status });

/** @typedef {z.infer<typeof Task>} TaskItem */
/** @typedef {z.infer<typeof MoveBody>} MoveBody */
