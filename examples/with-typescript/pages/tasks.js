// Pure helpers over tasks, typed by the schema: the type of a task is `TaskItem`, which is `z.infer<typeof Task>`, so a field that
// is renamed in schemas.js is a compile error here.

/** @typedef {import('./schemas.js').TaskItem} TaskItem */

/**
 * The tasks with one of them moved to another column. Tasks that did not change keep their reference.
 * @param {TaskItem[]} tasks
 * @param {number} id
 * @param {TaskItem['status']} status
 * @returns {TaskItem[]}
 */
export const moveTask = (tasks, id, status) => tasks.map((task) => (task.id === id && task.status !== status ? { ...task, status } : task));

/**
 * The tasks of one column.
 * @param {TaskItem[]} tasks
 * @param {TaskItem['status']} status
 * @returns {TaskItem[]}
 */
export const inColumn = (tasks, status) => tasks.filter((task) => task.status === status);

/** @typedef {{ status: TaskItem['status'], title: string, next: TaskItem['status'] | null }} Column */

/** @type {ReadonlyArray<Column>} */
export const COLUMNS = [
  { status: 'todo', title: 'To do', next: 'doing' },
  { status: 'doing', title: 'Doing', next: 'done' },
  { status: 'done', title: 'Done', next: null },
];
