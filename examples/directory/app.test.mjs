// The directory example end to end: two pages sharing an async resource, route params, nested lists, otherwise, window events.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fireEvent, findElements, createRoot, createWindow } from '@ehtb/agent-ui/testing/dom-shim.mjs';
import { flushAsync, createFakeFetch, deferred, outlineById } from '@ehtb/agent-ui/testing/helpers.mjs';
import { definePage } from '@ehtb/agent-ui/pages';

const { page: listPage } = await import('./pages/page.js');
const { view: listView, layout } = await import('./pages/view.js');
const { page: personPage } = await import('./pages/person/[id]/page.js');
const { view: personView } = await import('./pages/person/[id]/view.js');
const list = definePage(listPage, { path: '/', view: listView, layout });
const person = definePage(personPage, { path: '/person/:id', view: personView, layout });
const people = JSON.parse(readFileSync(new URL('./public/people.json', import.meta.url), 'utf8'));

// Opens the page that serves `url`, as the server would pick it.
const mountDirectory = async ({ url = '/', respond } = {}) => {
  const root = createRoot();
  const win = createWindow(url);
  const create = url.startsWith('/person/') ? person.create : list.create;
  const fetchFunction = createFakeFetch(respond ?? ((url) => (url === '/people.json' ? people : { ok: false, status: 404 })));
  const ui = create({ root, win, fetchFunction, dev: true });
  await flushAsync(ui);
  const names = () => findElements(root, (element) => element.classNames.includes('person')).map((row) => row.childNodes[0].textContent);
  const byId = (id) => findElements(root, (element) => element.attributes['data-id'] === id)[0];
  return { root, win, ui, fetchFunction, names, byId };
};

test('loads people on mount (loading state first), lists them, shows the count', async () => {
  const gate = deferred();
  const root = createRoot();
  const win = createWindow('/');
  const ui = list.create({ root, win, fetchFunction: createFakeFetch(() => gate), dev: true });
  await ui.settle();
  assert.equal(outlineById(ui.outline(), 'loading')?.text, 'Loading people…');
  gate.resolve(people);
  await flushAsync(ui);
  assert.equal(outlineById(ui.outline(), 'loading'), undefined);
  assert.equal(outlineById(ui.outline(), 'count').text, '8 of 8 shown');
  assert.equal(ui.errors.length, 0);
});

test('search filters by name or tag; escape (a window shortcut) clears it; team select options come from the data', async () => {
  const { ui, win, names, byId } = await mountDirectory();
  const search = byId('search');
  search.value = 'ada';
  fireEvent(search, 'input');
  await ui.settle();
  assert.deepEqual(names(), ['Ada Lovelace']);
  search.value = 'crypto';
  fireEvent(search, 'input');
  await ui.settle();
  assert.deepEqual(names(), ['Alan Turing']);
  win.fireWindowEvent('keydown', { key: 'Escape' });
  await ui.settle();
  assert.equal(names().length, 8);
  assert.equal(byId('search').value, '');

  const optionLabels = outlineById(ui.outline(), 'team').children.map((option) => option.text);
  assert.deepEqual(optionLabels, ['All teams', 'engineering', 'operations', 'research']);
  const team = byId('team');
  team.value = 'operations';
  fireEvent(team, 'change');
  await ui.settle();
  assert.deepEqual(names(), ['Dorothy Vaughan']);
});

test('rows show nested tag lists, or the otherwise branch when a person has no tags', async () => {
  const { ui } = await mountDirectory();
  const rows = outlineById(ui.outline(), 'people').children;
  const tagsOf = (row) => row.children.find((child) => child.classes?.includes('tags'))?.children.map((tag) => tag.text);
  assert.deepEqual(tagsOf(rows[0]), ['math', 'notes']);
  assert.deepEqual(tagsOf(rows[2]), ['logic', 'crypto', 'machines']);
  const barbara = rows.find((row) => row.children[0].text === 'Barbara Liskov');
  assert.equal(tagsOf(barbara), undefined);
  assert.ok(barbara.children.some((child) => child.classes?.includes('no-tags')));
});

test('person links are plain links to the person page, which shows the person from the URL, or a not-found otherwise branch', async () => {
  const { ui } = await mountDirectory();
  const link = ui.tree().find((entry) => entry.tag === 'a' && entry.label === 'Alan Turing');
  assert.equal(link.href, '/person/3');

  const detail = await mountDirectory({ url: link.href });
  assert.deepEqual(detail.ui.state().route.params, { id: '3' });
  assert.equal(detail.byId('person-name').textContent, 'Alan Turing');
  assert.equal(detail.byId('person-email').textContent, 'alan@example.org');
  assert.equal(detail.byId('list-view'), undefined);
  assert.equal(detail.byId('back').attributes.href, '/');

  const missing = await mountDirectory({ url: '/person/99' });
  assert.equal(outlineById(missing.ui.outline(), 'not-found').text, 'No such person.');
  assert.equal(missing.ui.getStatus(), 404);
  assert.equal(detail.ui.getStatus(), 200);
  assert.equal(detail.ui.isReady(), true);
});

test('deep link on load: the page opens directly on a person (state comes from the URL, data from the resource)', async () => {
  const { ui, byId } = await mountDirectory({ url: '/person/2' });
  assert.equal(byId('person-name').textContent, 'Grace Hopper');
  assert.equal(ui.state().route.params.id, '2');
  assert.equal(person.describePage(ui.state()).title, 'Grace Hopper');
});

test('failures are visible and recoverable: HTTP error shows an alert, reload succeeds', async () => {
  const { ui, byId } = await mountDirectory();
  fireEvent(byId('failure'), 'click'); // switches the request to a missing file
  await flushAsync(ui);
  assert.equal(outlineById(ui.outline(), 'error').text, 'Could not load people: HTTP 404');
  assert.equal(ui.state().people.list.length, 8); // the last good data stays
  fireEvent(byId('failure'), 'click');
  await flushAsync(ui);
  assert.equal(outlineById(ui.outline(), 'error'), undefined);
  assert.equal(ui.state().people.status, 'ready');
});

test('offline and online window events toggle the banner', async () => {
  const { ui, win } = await mountDirectory();
  assert.equal(outlineById(ui.outline(), 'offline'), undefined);
  win.fireWindowEvent('offline');
  await ui.settle();
  assert.equal(outlineById(ui.outline(), 'offline').text, 'You are offline. Showing the last loaded data.');
  win.fireWindowEvent('online');
  await ui.settle();
  assert.equal(outlineById(ui.outline(), 'offline'), undefined);
});

test('replay rebuilds the whole session (data, filters) with no new requests', async () => {
  const { ui, fetchFunction, byId } = await mountDirectory();
  const search = byId('search');
  search.value = 'grace';
  fireEvent(search, 'input');
  await flushAsync(ui);
  const before = JSON.stringify(ui.state());
  const requests = fetchFunction.calls.length;
  assert.equal(JSON.stringify(await ui.replay()), before);
  await flushAsync(ui);
  assert.equal(fetchFunction.calls.length, requests);
  assert.equal(ui.errors.length, 0);
});

test('the interactive surface lists inputs with values and the select with its current value', async () => {
  const { ui } = await mountDirectory();
  const tree = ui.tree();
  assert.deepEqual(tree.find((entry) => entry.id === 'team'), {
    id: 'team', key: undefined, tag: 'select', label: 'Team', value: 'all', on: { change: 'filters.setTeam' },
  });
  assert.equal(tree.find((entry) => entry.id === 'search').on.input, 'filters.setQuery');
});
