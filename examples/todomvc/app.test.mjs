// TodoMVC against https://github.com/tastejs/todomvc/blob/master/app-spec.md (one test per spec section; persistence and
// routing do not apply, see pages/page.js), plus agent-facing properties. Headless: assertions on state, action log, DOM structure and mutation counts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { definePage } from '@ehtb/agent-ui/pages';
import {
  mutations,
  fireEvent,
  findByClass,
  findByTag,
  findElements,
  createRoot,
  ShimElement,
} from '@ehtb/agent-ui/testing/dom-shim.mjs';

const { page } = await import('./pages/page.js');
const { view, layout } = await import('./pages/view.js');
const { create } = definePage(page, { path: '/', view, layout });

// Mounts a fresh TodoMVC instance and returns small helpers for driving it like a user would.
const mountTodoMvc = () => {
  const root = createRoot();
  const ui = create({ root, dev: true });

  const byClass = (className) => findByClass(root, className);
  const todoItems = () => findByTag(root, 'li').filter((item) => item.parentElement.classNames.includes('todo-list'));
  const newTodoInput = () => byClass('new-todo')[0];
  const titleLabel = (index) => findByTag(todoItems()[index], 'label')[0];
  const editInput = (index) => findByClass(todoItems()[index], 'edit')[0];
  const titles = () => todoItems().map((item) => findByTag(item, 'label')[0].textContent);
  const counterText = () => byClass('todo-count')[0]?.textContent;

  const typeTodo = async (text) => {
    const input = newTodoInput();
    input.value = text;
    fireEvent(input, 'input');
    fireEvent(input, 'keydown', { key: 'Enter' });
    await ui.settle();
  };
  const toggleTodo = async (index) => {
    const checkbox = findByClass(todoItems()[index], 'toggle')[0];
    checkbox.checked = !checkbox.checked;
    fireEvent(checkbox, 'change');
    await ui.settle();
  };
  const startEditing = async (index) => {
    fireEvent(titleLabel(index), 'dblclick');
    await ui.settle();
  };
  const selectedFilters = () =>
    findElements(root, (element) => element.localName === 'button' && element.classNames.includes('selected')).map(
      (button) => button.textContent,
    );
  const chooseFilter = async (label) => {
    fireEvent(findElements(root, (element) => element.localName === 'button' && element.textContent === label)[0], 'click');
    await ui.settle();
  };

  return {
    root, ui, byClass, todoItems, newTodoInput, editInput, titles, counterText,
    typeTodo, toggleTodo, startEditing, selectedFilters, chooseFilter,
  };
};

test('No todos: main and footer are not rendered, and the new-todo input is focused', async () => {
  const page = mountTodoMvc();
  await page.ui.settle();
  assert.equal(page.byClass('main').length, 0);
  assert.equal(page.byClass('footer').length, 0);
  assert.equal(ShimElement.focusedElement, page.newTodoInput());
});

test('New todo: Enter trims, appends and clears the input; blank input is ignored', async () => {
  const page = mountTodoMvc();
  await page.typeTodo('  buy milk  ');
  assert.equal(page.newTodoInput().value, '');
  await page.typeTodo('walk dog');
  assert.equal(page.newTodoInput().value, '');
  await page.typeTodo('   '); // blank after trim: no todo (reference apps leave the input untouched)
  assert.deepEqual(page.titles(), ['buy milk', 'walk dog']);
  assert.equal(page.byClass('main').length, 1);
  assert.equal(page.byClass('footer').length, 1);
});

test('Counter: pluralized, number wrapped in <strong>', async () => {
  const page = mountTodoMvc();
  await page.typeTodo('a');
  assert.equal(page.counterText(), '1 item left');
  assert.equal(findByTag(page.byClass('todo-count')[0], 'strong')[0].textContent, '1');
  await page.typeTodo('b');
  assert.equal(page.counterText(), '2 items left');
  await page.toggleTodo(0);
  await page.toggleTodo(1);
  assert.equal(page.counterText(), '0 items left');
});

test('Item: the checkbox toggles the `completed` class on the li', async () => {
  const page = mountTodoMvc();
  await page.typeTodo('a');
  await page.typeTodo('b');
  await page.toggleTodo(0);
  assert.ok(page.todoItems()[0].classNames.includes('completed'));
  assert.ok(!page.todoItems()[1].classNames.includes('completed'));
  await page.toggleTodo(0);
  assert.ok(!page.todoItems()[0].classNames.includes('completed'));
});

test('Mark all as complete: sets all, follows single toggles, resets after Clear completed', async () => {
  const page = mountTodoMvc();
  await page.typeTodo('a');
  await page.typeTodo('b');
  const markAll = () => findByClass(page.root, 'toggle-all')[0];

  markAll().checked = true;
  fireEvent(markAll(), 'change');
  await page.ui.settle();
  assert.deepEqual(page.todoItems().map((item) => item.classNames.includes('completed')), [true, true]);
  assert.equal(markAll().checked, true);

  await page.toggleTodo(0);
  assert.equal(markAll().checked, false); // one unchecked -> mark-all unchecks
  await page.toggleTodo(0);
  assert.equal(markAll().checked, true); // all checked again -> mark-all checks

  fireEvent(page.byClass('clear-completed')[0], 'click');
  await page.ui.settle();
  assert.equal(page.byClass('main').length, 0); // list empty -> main hidden
  await page.typeTodo('c');
  assert.equal(markAll().checked, false);

  markAll().checked = false;
  fireEvent(markAll(), 'change');
  await page.ui.settle();
  assert.equal(page.ui.derived().todos.activeCount, 1);
});

test('Clear completed: hidden when nothing is completed, removes completed todos', async () => {
  const page = mountTodoMvc();
  await page.typeTodo('a');
  await page.typeTodo('b');
  assert.equal(page.byClass('clear-completed').length, 0);
  await page.toggleTodo(1);
  assert.equal(page.byClass('clear-completed').length, 1);
  fireEvent(page.byClass('clear-completed')[0], 'click');
  await page.ui.settle();
  assert.deepEqual(page.titles(), ['a']);
  assert.equal(page.byClass('clear-completed').length, 0);
});

test('Destroy button removes the todo', async () => {
  const page = mountTodoMvc();
  for (const title of ['a', 'b', 'c']) await page.typeTodo(title);
  fireEvent(findByClass(page.todoItems()[1], 'destroy')[0], 'click');
  await page.ui.settle();
  assert.deepEqual(page.titles(), ['a', 'c']);
});

test('Editing: dblclick shows a focused input; Enter saves trimmed; Escape discards; blur saves; empty destroys', async () => {
  const page = mountTodoMvc();
  for (const title of ['a', 'b', 'c', 'd']) await page.typeTodo(title);

  // Enter saves (trimmed)
  await page.startEditing(0);
  assert.ok(page.todoItems()[0].classNames.includes('editing'));
  let input = page.editInput(0);
  assert.equal(input.value, 'a');
  assert.equal(input.focusCount, 1);
  input.value = '  a2 ';
  fireEvent(input, 'input');
  fireEvent(input, 'keydown', { key: 'Enter' });
  await page.ui.settle();
  assert.equal(page.titles()[0], 'a2');
  assert.ok(!page.todoItems()[0].classNames.includes('editing'));
  assert.equal(page.editInput(0), undefined);

  // blur (focusout) saves; a second focusout after the input is gone does nothing
  await page.startEditing(1);
  input = page.editInput(1);
  input.value = 'b2';
  fireEvent(input, 'input');
  fireEvent(input, 'focusout');
  fireEvent(input, 'focusout');
  await page.ui.settle();
  assert.equal(page.titles()[1], 'b2');

  // Escape discards the change
  await page.startEditing(2);
  input = page.editInput(2);
  input.value = 'zzz';
  fireEvent(input, 'input');
  fireEvent(input, 'keydown', { key: 'Escape' });
  fireEvent(input, 'focusout');
  await page.ui.settle();
  assert.equal(page.titles()[2], 'c');
  assert.ok(!page.todoItems()[2].classNames.includes('editing'));

  // empty (after trim) destroys the todo
  await page.startEditing(3);
  input = page.editInput(3);
  input.value = '   ';
  fireEvent(input, 'input');
  fireEvent(input, 'keydown', { key: 'Enter' });
  await page.ui.settle();
  assert.deepEqual(page.titles(), ['a2', 'b2', 'c']);
  assert.equal(page.ui.errors.length, 0);
});

test('Filters: shown at model level, the chosen one is marked `selected`, and updates follow', async () => {
  const page = mountTodoMvc();
  for (const title of ['a', 'b', 'c']) await page.typeTodo(title);
  await page.toggleTodo(1);
  assert.deepEqual(page.selectedFilters(), ['All']);

  await page.chooseFilter('Active');
  assert.deepEqual(page.titles(), ['a', 'c']);
  assert.deepEqual(page.selectedFilters(), ['Active']);

  await page.toggleTodo(0); // updated while filtered -> hidden
  assert.deepEqual(page.titles(), ['c']);

  await page.chooseFilter('Completed');
  assert.deepEqual(page.titles(), ['a', 'b']);
  assert.deepEqual(page.selectedFilters(), ['Completed']);

  assert.ok(page.ui.dispatch('filter.set', { value: 7 })); // wrong argument type -> rejected
  page.ui.dispatch('filter.set', { value: 'nonsense' });
  assert.deepEqual(page.selectedFilters(), ['Completed']); // an unknown filter changes nothing
  assert.equal(page.ui.errors.length, 1); // only the rejected dispatch
});

// ---- agent-facing properties (beyond the app spec) ----

test('Agent surface: typed rejection, replay determinism, frozen state, addressable tree', async () => {
  const page = mountTodoMvc();
  await page.typeTodo('a');
  await page.typeTodo('b');
  await page.toggleTodo(0);

  const logLengthBefore = page.ui.log.length;
  assert.ok(page.ui.dispatch('todos.toggle', { id: '1' })); // wrong argument type -> rejected
  assert.equal(page.ui.log.length, logLengthBefore);
  page.ui.errors.length = 0;

  const stateBefore = JSON.stringify(page.ui.state());
  const titlesBefore = page.titles().join();
  assert.equal(JSON.stringify(await page.ui.replay()), stateBefore);
  assert.equal(page.titles().join(), titlesBefore);

  assert.throws(() => page.ui.state().todos.items.push({}), TypeError); // state is frozen in dev

  const tree = page.ui.tree();
  assert.ok(tree.some((entry) => entry.tag === 'input' && JSON.stringify(entry.on['keydown.Enter']) === '["todos.add","draft.clear"]'));
  assert.ok(tree.some((entry) => entry.key === '2' && entry.on.click === 'todos.remove'));
  assert.ok(tree.some((entry) => entry.tag === 'button' && entry.on.click === 'filter.set'));
  assert.ok(tree.some((entry) => entry.checked === true && entry.key === '1')); // checkbox state readable as data
  assert.equal(page.ui.errors.length, 0);
});

test('Performance: with 2000 todos, toggling or deleting one row costs a handful of DOM mutations', async () => {
  const page = mountTodoMvc();
  const started = performance.now();
  for (let index = 0; index < 2000; index++) page.ui.dispatch('todos.add', { title: `todo ${index}` });
  await page.ui.settle();
  const elapsedMs = performance.now() - started;
  assert.equal(page.todoItems().length, 2000);

  await page.toggleTodo(5); // warm-up: makes "Clear completed" appear
  const row = page.todoItems()[1000];
  mutations.count = 0;
  await page.toggleTodo(1000);
  console.log(`  2000 adds + render: ${elapsedMs.toFixed(0)}ms (shim DOM) | mutations for one toggle: ${mutations.count}`);
  assert.ok(mutations.count <= 6, `mutations ${mutations.count}`);
  assert.equal(page.todoItems()[1000], row); // same DOM node: rows are reused, not rebuilt

  mutations.count = 0;
  fireEvent(findByClass(page.todoItems()[10], 'destroy')[0], 'click');
  await page.ui.settle();
  assert.ok(mutations.count <= 6, `delete mutations ${mutations.count}`);
});
