// The board end to end: the zod schemas are the one description of a task. The resources check every answer with them (a wrong
// one is a failed load), the server checks what it receives, and the helpers are plain functions over the type they give.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '@ehtb/agent-ui';
import { definePage } from '@ehtb/agent-ui/pages';
import { createRoot, createWindow, findElements, fireEvent } from '@ehtb/agent-ui/testing/dom-shim.mjs';
import { assertNoErrors, createFakeFetch, flushAsync } from '@ehtb/agent-ui/testing/helpers.mjs';
import { createApi } from './api.js';
import { page } from './pages/page.js';
import { view } from './pages/view.js';
import { Tasks } from './pages/schemas.js';
import { inColumn, moveTask } from './pages/tasks.js';

const definition = definePage(page, { path: '/', view });

// The api answers in process, like server-fetch.mjs does for the server.
const apiFetch = (api) =>
  createFakeFetch((url, init) => {
    const answer = api.handle({ method: init?.method ?? 'GET', pathname: url, body: init?.body ? JSON.parse(init.body) : {} });
    return { ok: answer.status < 300, status: answer.status, json: async () => answer.body };
  });

const mount = async (fetchFunction) => {
  const root = createRoot();
  const ui = definition.create({ root, win: createWindow(), fetchFunction, dev: true });
  await flushAsync(ui);
  const texts = (id) => findElements(root, (element) => element.attributes['data-id'] === id).map((element) => element.textContent);
  const buttons = (id) => findElements(root, (element) => element.localName === 'button' && element.parentNode?.attributes?.['data-id'] === id);
  return { ui, root, texts, buttons };
};

test('the page validates against its namespaces, and the column bindings are checked against the shape', () => {
  assert.deepEqual(validate(definition.spec, { namespaces: definition.namespaces }), []);
  const broken = JSON.parse(JSON.stringify(definition.spec).replace('"title"', '"titel"'));
  assert.match(validate(broken, { namespaces: definition.namespaces })[0], /unknown item field titel\. Did you mean "title"\?/);
});

test('the board loads the tasks into three columns and moving a task asks the server and replaces one task', async () => {
  const api = createApi();
  api.reset();
  const { ui, texts, buttons } = await mount(apiFetch(api));
  assert.equal(ui.state().board.status, 'ready');
  assert.equal(texts('summary')[0], '1 to do, 1 doing, 1 done');
  assert.deepEqual(texts('task-todo').map((text) => text.replace(/Move to \w+$/, '')), ['Check the page']);
  fireEvent(buttons('task-todo')[0], 'click');
  await flushAsync(ui);
  assert.equal(texts('summary')[0], '0 to do, 2 doing, 1 done');
  Tasks.parse(ui.state().board.tasks);
  assertNoErrors(ui);
  api.reset();
});

test('an answer that does not fit the schema is a failed load with zod\'s message, never data in the list', async () => {
  const { ui } = await mount(createFakeFetch(() => [{ id: 1, title: 'x', status: 'late', estimate: null, labels: [] }]));
  assert.equal(ui.state().board.status, 'failed');
  assert.match(ui.state().board.error, /^the response from \/api\/tasks does not fit: .*status/s);
  assert.deepEqual(ui.state().board.tasks, []);
});

test('the server refuses a body that does not fit the schema', () => {
  const api = createApi();
  assert.equal(api.handle({ method: 'POST', pathname: '/api/tasks/2/move', body: { status: 'late' } }).status, 422);
  assert.equal(api.handle({ method: 'POST', pathname: '/api/tasks/9/move', body: { status: 'done' } }).status, 404);
  api.reset();
});

test('the helpers are plain functions over the type the schema describes', () => {
  const tasks = Tasks.parse([{ id: 1, title: 'x', status: 'todo', estimate: null, labels: [] }]);
  const moved = moveTask(tasks, 1, 'done');
  assert.equal(moved[0].status, 'done');
  assert.equal(moveTask(moved, 1, 'done')[0], moved[0], 'a task that did not change keeps its reference');
  assert.deepEqual(inColumn(moved, 'todo'), []);
});
