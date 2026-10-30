// Not part of `npm test`. Run with: npm run benchmark
// Measures CPU cost of updates in the TodoMVC example against the shim DOM (so numbers reflect the runtime, not a real
// browser: use them to compare versions of the runtime, not to compare with other frameworks).
import { definePage } from '@ehtb/agent-ui/pages';
import { createRoot, mutations } from '@ehtb/agent-ui/testing/dom-shim.mjs';

const { page } = await import('./pages/page.js');
const { view, layout } = await import('./pages/view.js');
const { app } = await import('@ehtb/agent-ui');
const { create } = definePage(page, { path: '/', view, layout });

const format = (milliseconds) => milliseconds.toFixed(2).padStart(8);

const measure = async (label, mount, size) => {
  const ui = mount();
  let started = performance.now();
  for (let index = 0; index < size; index++) ui.dispatch('todos.add', { title: `todo ${index}` });
  await ui.settle();
  const addAll = performance.now() - started;

  const repetitions = 50;
  mutations.count = 0;
  started = performance.now();
  for (let index = 0; index < repetitions; index++) {
    ui.dispatch('todos.toggle', { id: 1 + index * Math.floor(size / repetitions) });
    await ui.settle();
  }
  const toggle = (performance.now() - started) / repetitions;
  const toggleMutations = mutations.count / repetitions;

  started = performance.now();
  for (let index = 0; index < repetitions; index++) {
    ui.dispatch('draft.set', { value: `draft ${index}` });
    await ui.settle();
  }
  const keystroke = (performance.now() - started) / repetitions;

  console.log(
    `${label.padEnd(24)} ${String(size).padEnd(6)} add all ${format(addAll)} ms | toggle one ${format(toggle)} ms ` +
      `(${toggleMutations.toFixed(1)} DOM mutations) | keystroke ${format(keystroke)} ms`,
  );
};

for (const size of [1000, 5000, 20000]) {
  await measure('page (definePage)', () => create({ root: createRoot(), dev: false }), size);
  await measure('runtime only', () => app({ namespaces: { filter: page.namespaces.filter, todos: page.namespaces.todos, draft: page.namespaces.draft, editing: page.namespaces.editing }, spec: view, root: createRoot(), dev: false }), size);
}
