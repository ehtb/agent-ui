import { test } from 'node:test';
import assert from 'node:assert/strict';
import { definePage } from '@ehtb/agent-ui/pages';
import { fireEvent, findByClass, findByTag, findElements, createRoot } from '@ehtb/agent-ui/testing/dom-shim.mjs';
import { page } from './pages/page.js';
import { view } from './pages/view.js';

const { create } = definePage(page, { path: '/', view });

const mount = () => {
  const root = createRoot();
  const ui = create({ root, dev: true });
  const byId = (id) => findElements(root, (element) => element.attributes['data-id'] === id)[0];
  const rows = () => findByClass(root, 'contact-row');
  const names = () => rows().map((row) => findByClass(row, 'contact-name')[0]?.textContent);
  const type = async (id, value) => {
    const input = byId(id);
    input.value = value;
    fireEvent(input, 'input');
    await ui.settle();
  };
  const addContact = async (name, email, group = 'friends') => {
    ui.dispatch('form.setName', { value: name });
    ui.dispatch('form.setEmail', { value: email });
    ui.dispatch('form.setGroup', { value: group });
    ui.dispatch('form.submit', {});
    await ui.settle();
  };
  return { root, ui, byId, rows, names, type, addContact };
};

test('validation shows and clears the error', async () => {
  const { ui, byId, addContact } = mount();
  await addContact('', 'a@b.c');
  assert.equal(byId('form-error').textContent, 'Name is required');
  assert.equal(ui.state().contacts.items.length, 0);
  await addContact('Ann', 'nope');
  assert.equal(byId('form-error').textContent, 'Email must contain @');
  await addContact('Ann', 'ann@x.io');
  assert.equal(byId('form-error'), undefined);
  assert.equal(ui.state().form.name, '');
  assert.equal(ui.state().form.email, '');
  assert.equal(ui.errors.length, 0);
});

test('typing in the form and submitting it works through the DOM; submit never reloads the page', async () => {
  const { ui, byId, type, names } = mount();
  await type('draft-name', 'Zed');
  await type('draft-email', 'zed@x.io');
  const select = byId('draft-group');
  select.value = 'work';
  fireEvent(select, 'change');
  let defaultPrevented = false;
  fireEvent(byId('add-form'), 'submit', { preventDefault: () => (defaultPrevented = true) });
  await ui.settle();
  assert.equal(defaultPrevented, true);
  assert.deepEqual(ui.state().contacts.items, [{ id: 1, name: 'Zed', email: 'zed@x.io', group: 'work' }]);
  assert.deepEqual(names(), ['Zed']);
  assert.equal(byId('draft-name').value, '');
});

test('search, group filter, sort and summary', async () => {
  const { ui, byId, type, names, addContact } = mount();
  await addContact('Bob', 'bob@x.io', 'work');
  await addContact('alice', 'a@home.org', 'family');
  await addContact('Carl', 'carl@x.io', 'friends');
  assert.deepEqual(names(), ['alice', 'Bob', 'Carl']);
  assert.equal(byId('summary').textContent, '3 of 3 shown');
  await type('search', 'X.IO');
  assert.deepEqual(names(), ['Bob', 'Carl']);
  assert.equal(byId('summary').textContent, '2 of 3 shown');
  fireEvent(byId('sort-toggle'), 'click');
  await ui.settle();
  assert.deepEqual(names(), ['Carl', 'Bob']);
  assert.equal(byId('sort-toggle').textContent, 'Name Z-A');
  const filterButtons = findByTag(byId('contacts-app'), 'button').filter((button) => ['all', 'friends', 'work', 'family'].includes(button.textContent));
  fireEvent(filterButtons.find((button) => button.textContent === 'work'), 'click');
  await ui.settle();
  assert.deepEqual(names(), ['Bob']);
  assert.ok(filterButtons.find((button) => button.textContent === 'work').classNames.includes('selected'));
  assert.equal(ui.errors.length, 0);
});

test('inline edit: Enter saves, Escape cancels, dblclick starts', async () => {
  const { ui, root, names, addContact } = mount();
  await addContact('Bob', 'bob@x.io');
  const startEdit = async () => {
    fireEvent(findByClass(root, 'contact-name')[0], 'dblclick');
    await ui.settle();
    return findByClass(root, 'edit-name')[0];
  };
  let input = await startEdit();
  assert.equal(input.value, 'Bob');
  input.value = 'Robert';
  fireEvent(input, 'input');
  fireEvent(input, 'keydown', { key: 'Escape' });
  await ui.settle();
  assert.deepEqual(names(), ['Bob']);
  assert.equal(findByClass(root, 'edit-name').length, 0);
  input = await startEdit();
  input.value = 'Robert';
  fireEvent(input, 'input');
  fireEvent(input, 'keydown', { key: 'Enter' });
  await ui.settle();
  assert.deepEqual(names(), ['Robert']);
  assert.equal(ui.state().editing.id, null);
  assert.equal(ui.dispatch('editing.save', {}), undefined);
  assert.equal(ui.errors.length, 0);
});

test('delete, clear all visibility', async () => {
  const { ui, byId, root, names, addContact } = mount();
  assert.equal(byId('clear-all'), undefined);
  await addContact('Bob', 'bob@x.io');
  await addContact('Amy', 'amy@x.io');
  assert.ok(byId('clear-all'));
  fireEvent(findByClass(root, 'delete')[0], 'click');
  await ui.settle();
  assert.deepEqual(names(), ['Bob']);
  fireEvent(byId('clear-all'), 'click');
  await ui.settle();
  assert.equal(byId('clear-all'), undefined);
  assert.equal(ui.state().contacts.items.length, 0);
});

test('replay reproduces state', async () => {
  const { ui } = mount();
  ui.dispatch('form.setName', { value: 'Q' });
  ui.dispatch('form.setEmail', { value: 'q@q' });
  ui.dispatch('form.submit', {});
  const log = [...ui.log];
  const snapshot = await ui.replay(log);
  assert.equal(snapshot.contacts.items.length, 1);
  assert.equal(ui.dispatch('contacts.remove', { id: 'x' }).includes('want number'), true);
});

test('clearing all contacts also ends an edit in progress: contacts.clear calls editing.cancel', async () => {
  const { ui, root, addContact } = mount();
  await addContact('Bob', 'bob@x.io');
  fireEvent(findByClass(root, 'contact-name')[0], 'dblclick');
  await ui.settle();
  assert.equal(ui.state().editing.id, 1);
  assert.equal(ui.dispatch('contacts.clear', {}), undefined);
  assert.deepEqual([ui.state().contacts.items, ui.state().editing], [[], { id: null, name: '' }]);
  assert.deepEqual(ui.log.at(-1), ['contacts.clear', {}]); // one logged action, the call is part of it
});

test('a namespace cannot write another: a form action that writes the contacts is refused', async () => {
  const { app } = await import('@ehtb/agent-ui');
  const { namespaces } = await import('./pages/page.js');
  const rogue = { ...namespaces, form: { ...namespaces.form, actions: { ...namespaces.form.actions, sneak: { args: {}, run: (store) => store.set('contacts.items', []) } } } };
  const ui = app({ namespaces: rogue, spec: view, root: createRoot(), dev: true });
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.match(ui.dispatch('form.sneak', {}), /state key "contacts\.items" belongs to namespace "contacts", and form\.sneak belongs to "form"\. An action writes only its own namespace/);
  } finally {
    console.error = originalError;
  }
});

test('the contact shape catches a typo in a binding and a malformed contact', async () => {
  const { validate, app } = await import('@ehtb/agent-ui');
  const { namespaces } = await import('./pages/page.js');
  const typo = JSON.parse(JSON.stringify(view).replace('"item":"email"', '"item":"emial"'));
  assert.match(validate(typo, { namespaces })[0], /unknown item field emial\. Did you mean "email"\?/);
  const rogue = { ...namespaces, contacts: { ...namespaces.contacts, actions: { ...namespaces.contacts.actions, broken: { args: {}, run: (store) => store.set('items', [{ id: 1, name: 'x' }]) } } } };
  const ui = app({ namespaces: rogue, spec: view, root: createRoot(), dev: true });
  const original = console.error;
  console.error = () => {};
  try {
    assert.match(ui.dispatch('contacts.broken', {}), /item 0 is missing the field "email"/);
  } finally {
    console.error = original;
  }
});
