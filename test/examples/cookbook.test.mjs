// The cookbook (cookbook/) and `agent-ui explain`: the recipes are pages of a real project, so they are checked like any page
// (`agent-ui check` renders every one of them) and driven like a visitor would drive them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ShimElement, createRoot, fireEvent, findElements } from '../support/dom-shim.mjs';
import { createFakeFetch } from '../support/helpers.mjs';
import { definePage } from '../../src/pages.js';
import { loadConfig } from '../../build/config.mjs';
import { checkProject } from '../../cli/check.mjs';
import { explain } from '../../cli/explain.mjs';
import { topics } from '../../cli/explain-topics.mjs';
import { recipes } from '../../cookbook/recipes.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cookbookRoot = join(repositoryRoot, 'cookbook');

// ---- the index ------------------------------------------------------------------------------------------------------------

test('recipes.mjs lists every recipe page of the cookbook, once, with files that exist and a name that explain can tell from a topic', () => {
  const folders = readdirSync(join(cookbookRoot, 'pages'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  assert.deepEqual(recipes.map((recipe) => recipe.name).sort(), folders.sort(), 'a folder below pages/ without a recipe, or a recipe without a folder');
  const names = [...recipes.map((recipe) => recipe.name), ...topics.map((topic) => topic.name)];
  assert.deepEqual(names.filter((name, index) => names.indexOf(name) !== index), [], 'a recipe and a topic with one name');
  for (const recipe of recipes) {
    assert.ok(recipe.title && recipe.use, `${recipe.name} needs a title and a use`);
    for (const file of recipe.files) assert.ok(existsSync(join(cookbookRoot, file)), `${recipe.name}: ${file} does not exist`);
    for (const file of [`pages/${recipe.name}/page.js`, `pages/${recipe.name}/view.js`]) assert.ok(recipe.files.includes(file), `${recipe.name} does not list ${file}`);
    // Every file in the recipe's folder is printed by `explain`: a stylesheet that the page needs is part of the recipe.
    const inFolder = (folder) => readdirSync(join(cookbookRoot, folder), { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? inFolder(`${folder}/${entry.name}`) : [`${folder}/${entry.name}`]));
    for (const file of inFolder(`pages/${recipe.name}`)) assert.ok(recipe.files.includes(file), `${recipe.name} does not list ${file}, which is in its folder`);
  }
});

test('agent-ui check renders every page of the cookbook and finds nothing wrong', async () => {
  const config = await loadConfig({ root: cookbookRoot, mode: { dev: true } });
  const { problems, pagesChecked } = await checkProject({ config, root: cookbookRoot });
  assert.deepEqual(problems, []);
  assert.ok(pagesChecked >= recipes.length + 2, `only ${pagesChecked} pages were checked`);
});

// ---- agent-ui explain -------------------------------------------------------------------------------------------------------

test('explain lists the recipes and the topics, prints a recipe with its files, and refuses an unknown name with a suggestion', async () => {
  const list = await explain();
  for (const name of [...recipes.map((recipe) => recipe.name), ...topics.map((topic) => topic.name)]) assert.ok(list.includes(`  ${name}`), `${name} is not in the list`);
  const nested = await explain('nested-rows');
  assert.match(nested, /^nested-rows: Rows inside rows that read the outer row/);
  assert.ok(nested.includes('--- pages/nested-rows/view.js ---') && nested.includes("{ as: 'order' }"));
  await assert.rejects(explain('nested-rowz'), /there is no recipe or topic "nested-rowz"\. Did you mean "nested-rows"\? Run agent-ui explain for the list/);
  const run = spawnSync(process.execPath, [join(repositoryRoot, 'bin/agent-ui.mjs'), 'explain', 'nope'], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /agent-ui explain: there is no recipe or topic "nope"/);
  assert.equal(spawnSync(process.execPath, [join(repositoryRoot, 'bin/agent-ui.mjs'), 'explain', 'each'], { encoding: 'utf8' }).status, 0);
});

// ---- the recipes, driven like a visitor ---------------------------------------------------------------------------------------

const mountRecipe = async (name, environment = {}) => {
  const folder = pathToFileURL(join(cookbookRoot, 'pages', name, '/'));
  const { page } = await import(new URL('page.js', folder));
  const content = await import(new URL('view.js', folder));
  const root = createRoot();
  const ui = definePage(page, { path: `/${name}`, view: content.view, layout: content.layout, shell: content.shell }).create({ root, dev: true, ...environment });
  await ui.settle();
  const byId = (id) => findElements(root, (element) => element.dataset.id === id);
  const texts = (id) => byId(id).map((element) => element.textContent);
  return { ui, root, byId, texts };
};
const typeInto = (element, value) => {
  element.value = value;
  fireEvent(element, 'input');
};

test('list-edit: add, tick, edit in place (Enter saves, Escape cancels) and remove', async () => {
  const { ui, byId, texts } = await mountRecipe('list-edit');
  typeInto(byId('draft')[0], '  milk ');
  fireEvent(byId('composer')[0], 'submit');
  typeInto(byId('draft')[0], 'eggs');
  fireEvent(byId('composer')[0], 'submit');
  fireEvent(byId('composer')[0], 'submit'); // the draft was cleared: nothing more is added
  await ui.settle();
  assert.deepEqual(texts('note-text'), ['milk', 'eggs']);
  assert.equal(ui.state().composer.draft, '');
  const checkbox = byId('note-done')[0];
  checkbox.checked = true;
  fireEvent(checkbox, 'change');
  await ui.settle();
  assert.equal(ui.derived().notes.remaining, 1);

  fireEvent(byId('note-text')[1], 'dblclick');
  await ui.settle();
  typeInto(byId('note-edit')[0], 'free-range eggs');
  fireEvent(byId('note-edit')[0], 'keydown', { key: 'Enter' });
  fireEvent(byId('note-edit')[0], 'focusout'); // a browser repeats it: saving twice changes nothing
  await ui.settle();
  assert.deepEqual(texts('note-text'), ['milk', 'free-range eggs']);

  fireEvent(byId('note-text')[0], 'dblclick');
  await ui.settle();
  typeInto(byId('note-edit')[0], 'oat milk');
  fireEvent(byId('note-edit')[0], 'keydown', { key: 'Escape' });
  await ui.settle();
  assert.deepEqual(texts('note-text'), ['milk', 'free-range eggs'], 'Escape cancelled the edit');

  fireEvent(byId('note-remove')[0], 'click');
  await ui.settle();
  assert.deepEqual(texts('note-text'), ['free-range eggs']);
  assert.deepEqual(ui.errors, []);
});

test('form-validation: errors show after the first attempt, follow the fields, and a valid form is accepted', async () => {
  const { ui, byId } = await mountRecipe('form-validation');
  assert.equal(byId('email-error').length, 0, 'no error before an attempt');
  fireEvent(byId('signup-form')[0], 'submit');
  await ui.settle();
  assert.equal(byId('email-error')[0].textContent, 'Enter an address like name@example.com');
  assert.equal(byId('password-error')[0].textContent, 'Use at least 8 characters');
  typeInto(byId('email')[0], 'ada@example.com');
  await ui.settle();
  assert.equal(byId('email-error').length, 0, 'the error follows the field');
  assert.equal(ui.derived().signup.valid, false);
  typeInto(byId('password')[0], 'correct horse');
  await ui.settle();
  assert.equal(ui.derived().signup.valid, true);
  fireEvent(byId('signup-form')[0], 'submit');
  await ui.settle();
  assert.equal(byId('welcome')[0].textContent, 'Welcome aboard.');
  assert.equal(byId('signup-form').length, 0);
});

test('async-list: loading, ready, a failed load, and a retry that loads again', async () => {
  let failing = true;
  const fetchFunction = createFakeFetch((url) => (failing ? { ok: false, status: 503, json: async () => ({ message: 'HTTP 503' }) } : [{ id: 1, title: 'Dune', year: 1965 }]));
  const { ui, byId } = await mountRecipe('async-list', { fetchFunction });
  for (let round = 0; round < 5; round++) await ui.settle();
  await new Promise((resolve) => setTimeout(resolve, 5));
  await ui.settle();
  assert.equal(ui.state().books.status, 'failed');
  assert.equal(byId('error')[0].textContent, 'HTTP 503');
  failing = false;
  fireEvent(byId('retry')[0], 'click');
  await new Promise((resolve) => setTimeout(resolve, 5));
  await ui.settle();
  assert.equal(ui.state().books.status, 'ready');
  assert.equal(byId('count')[0].textContent, '1 books');
  assert.deepEqual(byId('book').map((element) => element.textContent), ['Dune (1965)']);
  assert.deepEqual(fetchFunction.calls.map((call) => call.url), ['/books.json', '/books.json']);
});

test('modal: opens, takes and traps the focus, closes on Escape, gives the focus back, and confirms once', async () => {
  const { ui, byId } = await mountRecipe('modal');
  const open = byId('open')[0];
  assert.equal(byId('dialog').length, 0);
  open.focus();
  fireEvent(open, 'click');
  await ui.settle();
  const dialog = byId('dialog')[0];
  assert.equal(byId('dialog').length, 1);
  assert.equal(dialog.localName, 'dialog', 'the native dialog element, not a div with a role');
  assert.equal(ShimElement.focusedElement, dialog, 'the dialog itself takes the focus, not the destructive button');
  assert.equal(byId('page-content')[0].getAttribute('inert'), '', 'the page behind it cannot take the focus');
  fireEvent(dialog, 'keydown', { key: 'Tab' });
  assert.equal(ShimElement.focusedElement, byId('confirm')[0], 'Tab enters the first control');
  byId('cancel')[0].focus();
  fireEvent(byId('cancel')[0], 'keydown', { key: 'Tab' });
  assert.equal(ShimElement.focusedElement, byId('confirm')[0], 'Tab wraps from the last control to the first');
  fireEvent(byId('confirm')[0], 'keydown', { key: 'Tab', shiftKey: true });
  assert.equal(ShimElement.focusedElement, byId('cancel')[0], 'Shift+Tab wraps from the first control to the last');
  fireEvent(byId('confirm')[0], 'keydown', { key: 'Escape' }); // the key bubbles from the focused button to the dialog
  await ui.settle();
  await new Promise((resolve) => setTimeout(resolve, 5)); // the focus goes back after the same render removed `inert`
  assert.equal(byId('dialog').length, 0);
  assert.equal(ShimElement.focusedElement, open, 'the control that opened the dialog gets the focus back');
  assert.equal(byId('page-content')[0].getAttribute('inert'), null);
  fireEvent(open, 'click');
  await ui.settle();
  fireEvent(byId('confirm')[0], 'click');
  await ui.settle();
  assert.deepEqual([ui.state().dialog.confirmed, ui.state().dialog.open], [1, false]);
});

test('modal: reopening before the focus-restore timer cancels the pending restore', async () => {
  const timers = new Map();
  let timerId = 0;
  const win = {
    setTimeout: (callback) => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: (id) => timers.delete(id),
  };
  const { ui, byId } = await mountRecipe('modal', { win });
  const open = byId('open')[0];
  open.focus();
  fireEvent(open, 'click');
  await ui.settle();
  fireEvent(byId('cancel')[0], 'click');
  await ui.settle();
  assert.equal(timers.size, 1, 'closing schedules the focus restore');
  fireEvent(open, 'click');
  await ui.settle();
  assert.equal(timers.size, 0, 'reopening cancels it, so it cannot steal the new dialog focus');
  assert.equal(ShimElement.focusedElement, byId('dialog')[0]);
});

test('combobox: typing filters, the arrow keys move a highlight that stays in range, Enter and a click choose', async () => {
  const { ui, byId, texts } = await mountRecipe('combobox');
  const field = byId('fruit')[0];
  typeInto(field, 'ap');
  await ui.settle();
  assert.deepEqual(texts('option'), ['Apple', 'Apricot', 'Grape']);
  for (let press = 0; press < 5; press++) fireEvent(field, 'keydown', { key: 'ArrowDown' }); // past the last option: stays on it
  fireEvent(field, 'keydown', { key: 'ArrowUp' });
  await ui.settle();
  assert.equal(ui.state().picker.activeIndex, 1);
  fireEvent(field, 'keydown', { key: 'Enter' });
  await ui.settle();
  assert.deepEqual([ui.state().picker.chosen, ui.state().picker.open, field.value], ['Apricot', false, 'Apricot']);
  typeInto(field, 'b');
  await ui.settle();
  fireEvent(byId('option')[1], 'click');
  await ui.settle();
  assert.equal(ui.state().picker.chosen, 'Blueberry');
  typeInto(field, 'zzz');
  await ui.settle();
  assert.equal(byId('fruit-options').length, 0, 'no list when nothing matches');
});

test('drag-reorder: a grip picks a row up, entering another row moves it there, releasing drops it, Escape and a cancelled pointer put it back, and the keyboard does the same', async () => {
  const { ui, byId } = await mountRecipe('drag-reorder');
  const titles = () => ui.state().tasks.items.map((task) => task.title);
  const original = ['Draft the outline', 'Write the tests', 'Ship it'];
  assert.deepEqual(titles(), original);

  // The pointer: pick up the first row, cross itself (nothing moves), cross the last row, release.
  fireEvent(byId('grip')[0], 'pointerdown');
  assert.equal(ui.state().tasks.draggingId, 1);
  assert.equal(ui.state().tasks.startIndex, 0);
  fireEvent(byId('task')[0], 'pointerover');
  fireEvent(byId('task')[2], 'pointerover');
  await ui.settle();
  assert.deepEqual(titles(), ['Write the tests', 'Ship it', 'Draft the outline']);
  fireEvent(byId('reorder-page')[0], 'pointerup');
  await ui.settle();
  assert.equal(ui.state().tasks.draggingId, null);
  fireEvent(byId('task')[1], 'pointerover'); // not dragging: nothing moves
  fireEvent(byId('reorder-page')[0], 'pointerup'); // releasing again changes nothing
  assert.deepEqual(titles(), ['Write the tests', 'Ship it', 'Draft the outline']);

  // Escape puts the row back where it started.
  fireEvent(byId('grip')[2], 'pointerdown'); // 'Draft the outline', now last
  fireEvent(byId('task')[0], 'pointerover');
  await ui.settle();
  assert.deepEqual(titles(), ['Draft the outline', 'Write the tests', 'Ship it']);
  fireEvent(byId('tasks')[0], 'keydown', { key: 'Escape' });
  await ui.settle();
  assert.deepEqual(titles(), ['Write the tests', 'Ship it', 'Draft the outline']);
  assert.equal(ui.state().tasks.draggingId, null);

  // A cancelled pointer (the browser took it) does the same.
  fireEvent(byId('grip')[0], 'pointerdown');
  fireEvent(byId('task')[1], 'pointerover');
  fireEvent(byId('reorder-page')[0], 'pointercancel');
  await ui.settle();
  assert.deepEqual(titles(), ['Write the tests', 'Ship it', 'Draft the outline']);

  // The keyboard: Enter picks up, the arrows move, Enter puts down; the grip is labelled with its row.
  assert.equal(byId('grip')[0].getAttribute('aria-label'), 'Reorder Write the tests');
  fireEvent(byId('grip')[0], 'keydown', { key: 'Enter' });
  fireEvent(byId('grip')[0], 'keydown', { key: 'ArrowDown' });
  fireEvent(byId('grip')[0], 'keydown', { key: 'ArrowDown' });
  fireEvent(byId('grip')[0], 'keydown', { key: 'ArrowDown' }); // past the end: stays last
  await ui.settle();
  assert.deepEqual(titles(), ['Ship it', 'Draft the outline', 'Write the tests']);
  fireEvent(byId('grip')[2], 'keydown', { key: 'Enter' });
  await ui.settle();
  assert.equal(ui.state().tasks.draggingId, null);
  fireEvent(byId('grip')[2], 'keydown', { key: 'ArrowUp' }); // nothing picked up: nothing moves
  assert.deepEqual(titles(), ['Ship it', 'Draft the outline', 'Write the tests']);
  assert.deepEqual(ui.errors, []);
});

test('soft-shell: the page and the shell are separate apps, and the pages list the shell', async () => {
  const { ui, byId } = await mountRecipe('soft-shell');
  fireEvent(byId('bump')[0], 'click');
  await ui.settle();
  assert.equal(ui.state().visit.count, 1);
  assert.equal(byId('other-link')[0].getAttribute('data-soft'), '');
  assert.equal(byId('other-link')[0].getAttribute('href'), '/soft-shell/other');
});

test('nested-rows: the inner template reads the outer row, in the label and in the handler', async () => {
  const { ui, byId, texts } = await mountRecipe('nested-rows');
  assert.deepEqual(texts('line-label'), ['Ada: pen', 'Ada: ink', 'Bo: pad']);
  fireEvent(byId('line-remove')[2], 'click'); // Bo's only line
  fireEvent(byId('line-remove')[1], 'click'); // Ada's second
  await ui.settle();
  assert.deepEqual(ui.state().orders.list.map((order) => order.lines.map((line) => line.sku)), [['pen'], []]);
  assert.deepEqual(texts('line-label'), ['Ada: pen']);
});

test('row-state: each row opens on its own, keeps its note, and is forgotten with its person', async () => {
  const { ui, byId } = await mountRecipe('row-state');
  fireEvent(byId('person-toggle')[1], 'click');
  await ui.settle();
  typeInto(byId('person-note')[0], 'prefers email');
  await ui.settle();
  assert.deepEqual(ui.state().details.rowState, { 2: { open: true, note: 'prefers email' } });
  assert.deepEqual(byId('person').map((element) => element.classNames.includes('open')), [false, true, false]);
  fireEvent(byId('person-toggle')[1], 'click');
  await ui.settle();
  assert.equal(byId('person-note').length, 0);
  assert.deepEqual(ui.state().details.rowState, { 2: { note: 'prefers email' } }, 'a closed row keeps its note');
  fireEvent(byId('person-remove')[1], 'click');
  await ui.settle();
  assert.deepEqual(ui.state().details.rowState, {}, 'removing the person forgot the row');
  assert.deepEqual(ui.errors, []);
});

test('svg-icons: the stars follow the rating, the line follows the data, and every svg says what it shows or is hidden', async () => {
  const { ui, byId, root } = await mountRecipe('svg-icons');
  const pressed = () => byId('star').map((element) => element.getAttribute('aria-pressed'));
  assert.deepEqual(pressed(), ['true', 'true', 'true', 'false', 'false']);
  fireEvent(byId('star')[4], 'click');
  await ui.settle();
  assert.deepEqual(byId('star').map((element) => element.classNames.includes('on')), [true, true, true, true, true]);
  assert.deepEqual(findElements(root, (element) => element.localName === 'use').map((element) => element.getAttribute('href')), Array(5).fill('/icons.svg#star'));
  assert.equal(byId('sparkline-line')[0].getAttribute('points'), '0,13.333333333333334 10,8.88888888888889 20,15.555555555555555 30,2.2222222222222214 40,6.666666666666668 50,0 60,4.444444444444445');
  ui.dispatch('visits.add', { count: 1 });
  await ui.settle();
  assert.match(byId('sparkline')[0].getAttribute('aria-label'), /^Visits this week, from 5 to 1 a day$/);
  for (const drawing of findElements(root, (element) => element.localName === 'svg')) {
    assert.ok(drawing.getAttribute('aria-hidden') === 'true' || drawing.getAttribute('aria-label'), 'an svg is decoration or says what it shows');
  }
  assert.deepEqual(ui.errors, []);
});

test('format-values: money and dates come out as the reader writes them, and a change formats one row', async () => {
  const { ui, texts } = await mountRecipe('format-values');
  assert.deepEqual(texts('invoice'), ['Ada: €1,234.56, due 12 Mar 2026', 'Bo: €99.00, due 1 Apr 2026']);
  assert.equal(texts('total')[0], 'Total €1,333.56');
  const before = ui.derived().invoices.rows;
  ui.dispatch('invoices.setAmount', { id: 2, cents: 10000 });
  await ui.settle();
  const after = ui.derived().invoices.rows;
  assert.equal(after[0], before[0], 'the row of the invoice that did not change is the same object');
  assert.notEqual(after[1], before[1]);
  assert.equal(texts('invoice')[1], 'Bo: €100.00, due 1 Apr 2026');
});

test('draw-into-element: the plugin draws into its element, follows the state, reports a click as an action and cleans up', async () => {
  const { ui, byId, root } = await mountRecipe('draw-into-element');
  const bars = () => findElements(root, (element) => element.getAttribute('data-bar') !== null);
  assert.deepEqual(bars().map((bar) => bar.textContent), ['###', '#####', '##']);
  fireEvent(bars()[1], 'click');
  assert.equal(ui.state().sales.selected, 1);
  fireEvent(byId('add')[0], 'click');
  await ui.settle();
  assert.equal(bars().length, 4);
  assert.deepEqual(ui.errors, []);
  ui.destroy();
  assert.equal(bars().length, 0);
});

test('server-hooks: the page status, signed session, transform, API headers and form redirect fit together', async () => {
  const { initialStateFor, transformResponse, createApi } = await import('../../cookbook/server-hooks.mjs');
  const page = await mountRecipe('server-hooks');
  assert.equal(page.ui.getStatus(), 403);
  const signedIn = await mountRecipe('server-hooks', { initialState: { session: { user: 'ada' } } });
  assert.equal(signedIn.ui.getStatus(), 200);
  assert.equal(signedIn.texts('who')[0], 'Signed in as ada.');

  const api = createApi();
  const login = api.handleForm({ pathname: '/server-hooks/login', form: { user: 'ada' } });
  assert.equal(login.redirect, '/server-hooks');
  assert.match(login.headers['set-cookie'], /^session=[^;]+; Path=\/; HttpOnly; Secure; SameSite=Lax$/);
  const token = login.headers['set-cookie'].match(/^session=([^;]+)/)[1];
  assert.deepEqual(initialStateFor({ cookies: { session: token } }), { session: { user: 'ada' } });
  assert.deepEqual(initialStateFor({ cookies: { session: 'ada' } }), { session: { user: null } }, 'an unsigned name is not trusted');
  assert.deepEqual(initialStateFor({ cookies: {} }), { session: { user: null } });
  assert.deepEqual(api.handleForm({ pathname: '/server-hooks/login', form: { user: 'x; Domain=.example.com' } }), {
    status: 400,
    url: '/server-hooks',
    initialState: { session: { user: null } },
  }, 'a cookie cannot be injected through the display name');

  const html = transformResponse(
    { pathname: '/server-hooks' },
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: '<html><body><script type="application/json" id="agent-ui-state">{}</script></body></html>' },
  );
  assert.match(html.headers['content-security-policy'], /style-src 'self'/);
  assert.match(html.headers['content-security-policy'], /'nonce-/);
  assert.match(html.body, /<script nonce="[^"]+" type="application\/json" id="agent-ui-state">/);

  assert.deepEqual(api.handle({ pathname: '/api/server-hooks', cookies: { session: token }, query: new URLSearchParams('q=hello') }), {
    status: 200,
    body: { user: 'ada', q: 'hello' },
    headers: { 'cache-control': 'no-store', 'set-cookie': 'seen=1; Path=/; HttpOnly; Secure; SameSite=Lax' },
  });
  assert.equal(api.handle({ pathname: '/api/server-hooks', cookies: { session: 'admin' }, query: new URLSearchParams() }).body.user, null);

  // The full handler cases live in test/handler.test.mjs (303, merged set-cookie, next) and test/safety.test.mjs
  // (421 and malformed-URL 400 bypass, body-read 400, throwing-hook 500).
});

test('browser-only-plugin: saves a pause after the last change, saves at once when the page is hidden, and does nothing while the server renders', async () => {
  const timers = new Map();
  const listeners = new Map();
  let nextTimer = 1;
  const win = {
    setTimeout: (callback) => { timers.set(nextTimer, callback); return nextTimer++; },
    clearTimeout: (id) => timers.delete(id),
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type) => listeners.delete(type),
  };
  const requests = [];
  const fetchFunction = async (url, init) => { requests.push([url, init.method, JSON.parse(init.body).text]); return { ok: true }; };
  const { ui, byId } = await mountRecipe('browser-only-plugin', { win, fetchFunction });
  typeInto(byId('text')[0], 'a');
  typeInto(byId('text')[0], 'ab');
  assert.equal(timers.size, 1, 'a change restarts the one timer');
  [...timers.values()][0]();
  await ui.settle();
  assert.deepEqual(requests, [['/note', 'PATCH', 'ab']]);
  assert.equal(ui.state().note.status, 'saved');
  typeInto(byId('text')[0], 'abc');
  listeners.get('pagehide')();
  await ui.settle();
  assert.equal(requests.length, 2, 'hiding the page saved the last edit');
  assert.deepEqual(ui.errors, []);
  ui.destroy();
  assert.equal(listeners.size, 0, 'the listener was removed');

  // The server renders the same page: the plugin leaves it alone, and ending the page works.
  const { renderPage } = await import('../../server/render-page.js');
  const folder = pathToFileURL(join(cookbookRoot, 'pages', 'browser-only-plugin', '/'));
  const { page } = await import(new URL('page.js', folder));
  const content = await import(new URL('view.js', folder));
  const { create } = definePage(page, { path: '/browser-only-plugin', view: content.view });
  const rendered = await renderPage(create, { dev: false, url: '/browser-only-plugin' });
  assert.equal(requests.length, 2);
  rendered.ui.destroy();

  // A failed save is reported, not shown as saved.
  for (const failing of [async () => ({ ok: false }), async () => { throw new Error('offline'); }]) {
    const failure = await mountRecipe('browser-only-plugin', { win, fetchFunction: failing });
    typeInto(failure.byId('text')[0], 'x');
    [...timers.values()].at(-1)();
    await failure.ui.settle();
    assert.equal(failure.ui.state().note.status, 'failed');
    failure.ui.destroy();
  }
});

test('the recipes need no file that is not listed: every import of a recipe resolves to a file listed for it, to the framework, or to the shared recipe files', () => {
  for (const recipe of recipes) {
    for (const file of recipe.files.filter((name) => name.endsWith('.js'))) {
      for (const [, specifier] of readFileSync(join(cookbookRoot, file), 'utf8').matchAll(/from '(\.[^']*)'/g)) {
        const target = join(dirname(file), specifier).split('\\').join('/');
        assert.ok(existsSync(join(cookbookRoot, target)), `${recipe.name}: ${file} imports ${specifier}, which does not exist`);
        assert.ok(recipe.files.includes(target) || target === 'recipes.mjs', `${recipe.name}: ${file} imports ${target}, which the recipe does not list`);
      }
    }
  }
});
