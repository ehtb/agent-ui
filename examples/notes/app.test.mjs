import { test } from 'node:test';
import assert from 'node:assert/strict';
import { definePage } from '@ehtb/agent-ui/pages';
import { createRoot } from '@ehtb/agent-ui/testing/dom-shim.mjs';
import { page } from './pages/page.js';
import { view } from './pages/view.js';

const { create } = definePage(page, { path: '/', view });

test('adds a note through the form action', async () => {
  const ui = create({ root: createRoot(), dev: true });
  ui.dispatch('composer.setDraft', { value: 'buy milk' });
  ui.dispatch('composer.submit');
  await ui.settle();
  assert.deepEqual(ui.state().notes.items, [{ id: 1, text: 'buy milk' }]);
  assert.equal(ui.state().composer.draft, ''); // cleared by composer.submit after it called notes.add
  assert.deepEqual(ui.log.map(([name]) => name), ['composer.setDraft', 'composer.submit']); // the call is part of the submit
  assert.equal(ui.errors.length, 0);
});

test('the counter uses the singular for exactly one note', async () => {
  const ui = create({ root: createRoot(), dev: true });
  const label = () => ui.outline()[0].children.at(-1).text;
  assert.equal(label(), '0 notes');
  ui.dispatch('composer.setDraft', { value: 'a' });
  ui.dispatch('composer.submit');
  await ui.settle();
  assert.equal(label(), '1 note');
  ui.dispatch('composer.setDraft', { value: 'b' });
  ui.dispatch('composer.submit');
  await ui.settle();
  assert.equal(label(), '2 notes');
});

test('an empty draft adds nothing, and the unsent draft is not a note', async () => {
  const ui = create({ root: createRoot(), dev: true });
  ui.dispatch('composer.setDraft', { value: '   ' });
  ui.dispatch('composer.submit');
  assert.deepEqual(ui.state().notes.items, []);
  ui.dispatch('composer.setDraft', { value: 'keep me' });
  ui.dispatch('composer.submit');
  ui.dispatch('composer.setDraft', { value: 'unsent' });
  await ui.settle();
  assert.deepEqual(ui.state().notes.items, [{ id: 1, text: 'keep me' }]);
  assert.equal(ui.state().composer.draft, 'unsent');
});
