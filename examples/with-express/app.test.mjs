// The front end on the headless DOM shim, with a fake fetch standing in for Express. Needs no server and no Express.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoot, createWindow } from '@ehtb/agent-ui/testing/dom-shim.mjs';
import { createFakeFetch, deferred, flushAsync } from '@ehtb/agent-ui/testing/helpers.mjs';
import { definePage } from '@ehtb/agent-ui/pages';
import { page as entriesPage } from './pages/page.js';
import { view as entriesView, pending as entriesPending } from './pages/view.js';
import { page as entryPage } from './pages/entry/[id]/page.js';
import { view as entryView, pending as entryPending } from './pages/entry/[id]/view.js';
import { page as signPage } from './pages/sign/page.js';
import { view as signView } from './pages/sign/view.js';
import { page as aboutPage } from './pages/about/page.js';
import { view as aboutView } from './pages/about/view.js';
import { layout } from './pages/layout.js';

const definitions = [
  [/^\/$/, definePage(entriesPage, { path: '/', view: entriesView, layout, pending: entriesPending })],
  [/^\/entry\/[^/]+$/, definePage(entryPage, { path: '/entry/:id', view: entryView, layout, pending: entryPending })],
  [/^\/sign$/, definePage(signPage, { path: '/sign', view: signView, layout })],
  [/^\/about$/, definePage(aboutPage, { path: '/about', view: aboutView, layout })],
];
// The page that serves the URL, as the server would pick it.
const create = (environment) => definitions.find(([pattern]) => pattern.test(environment.win.location.pathname))[1].create(environment);

const entries = [{ id: 1, name: 'Ada', message: 'First!' }];
const reply = (status, body) => ({ ok: status < 400, status, json: async () => body }); // a Response-like object

const boot = async (respond, path = '/') => {
  const fake = createFakeFetch(respond);
  const ui = create({ root: createRoot(), win: createWindow(path), fetchFunction: fake, dev: true });
  await flushAsync(ui);
  return { ui, fake };
};

test('loads the entries on mount', async () => {
  const { ui } = await boot(() => entries);
  assert.equal(ui.state().guestbook.status, 'ready');
  assert.equal(ui.derived().guestbook.entryCount, '1 entry');
});

test('a refusal from the server is shown and the form is kept', async () => {
  const { ui } = await boot((url, init) => (init?.method === 'POST' ? reply(422, { message: 'Enter your name (at least 2 characters).' }) : entries), '/sign');
  ui.dispatch('sign.setName', { value: 'A' });
  ui.dispatch('sign.setMessage', { value: 'hello' });
  ui.dispatch('sign.send');
  await flushAsync(ui);
  assert.equal(ui.state().sign.note, 'Enter your name (at least 2 characters).');
  assert.equal(ui.state().sign.message, 'hello');
  assert.equal(ui.state().sign.status, 'editing');
});

test('a sent entry clears the form and shows the confirmation; a repeated send is ignored while sending', async () => {
  const { ui, fake } = await boot((url, init) => (init?.method === 'POST' ? reply(201, { id: 2, ...JSON.parse(init.body) }) : entries), '/sign');
  ui.dispatch('sign.setName', { value: 'Grace' });
  ui.dispatch('sign.setMessage', { value: 'Hello' });
  ui.dispatch('sign.send');
  ui.dispatch('sign.send');
  await flushAsync(ui);
  assert.equal(ui.state().sign.name, '');
  assert.equal(ui.state().sign.sent.id, 2);
  assert.equal(fake.calls.filter((call) => call.options?.method === 'POST').length, 1);
  assert.equal(ui.errors.length, 0);
});

test('each URL shows its own page', async () => {
  const home = await boot(() => entries, '/');
  assert.deepEqual(home.ui.state().route.params, {});
  assert.ok(JSON.stringify(home.ui.outline()).includes('entries-view'));
  const first = await boot(() => entries, '/entry/1');
  assert.equal(first.ui.derived().entry.current.name, 'Ada');
  assert.equal(first.ui.derived().entry.isMissing, false);
  const missing = await boot(() => entries, '/entry/99');
  assert.equal(missing.ui.derived().entry.isMissing, true);
  const about = await boot(() => entries, '/about');
  assert.ok(JSON.stringify(about.ui.outline()).includes('about-view'));
  assert.equal(about.ui.errors.length, 0);
});

test('a page opened by its URL starts on that page', async () => {
  const { ui } = await boot(() => entries, '/entry/1');
  assert.deepEqual(ui.state().route.params, { id: '1' });
});

test('while the entries load the page shows its pending view; the entries appear when they are there', async () => {
  const pending = deferred();
  const { ui } = await boot(() => pending, '/entry/1');
  const shown = () => JSON.stringify(ui.outline());
  assert.equal(ui.isReady(), false);
  assert.ok(shown().includes('entry-pending'));
  assert.equal(shown().includes('entry-view'), false);
  pending.resolve(entries);
  await flushAsync(ui);
  assert.equal(ui.isReady(), true);
  assert.equal(ui.getStatus(), 200);
  assert.ok(shown().includes('entry-view'));
  assert.equal(shown().includes('entry-pending'), false);
});

test('an id that names no entry answers 404 once the entries are there, and a failed load answers 503', async () => {
  const missing = await boot(() => entries, '/entry/99');
  assert.equal(missing.ui.getStatus(), 404);
  const failed = await boot(() => new Error('network down'), '/entry/1');
  assert.equal(failed.ui.getStatus(), 503);
  assert.equal(failed.ui.isReady(), true); // finished, so the server stops waiting and renders the error banner
});

test('a page the server rendered stays on screen while the entries refresh in the background', async () => {
  const refresh = deferred();
  const fake = createFakeFetch(() => refresh);
  const ui = create({ root: createRoot(), win: createWindow('/'), fetchFunction: fake, dev: true, initialState: { guestbook: { status: 'ready', entries } } });
  await flushAsync(ui);
  assert.equal(fake.calls.length, 1); // the browser refreshes on mount
  assert.equal(ui.state().guestbook.status, 'ready'); // a refresh must not take a ready page back to pending
  assert.equal(JSON.stringify(ui.outline()).includes('entries-pending'), false);
  refresh.resolve([...entries, { id: 2, name: 'Grace', message: 'Hi' }]);
  await flushAsync(ui);
  assert.equal(ui.state().guestbook.entries.length, 2);
});
