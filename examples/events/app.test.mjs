// End to end tests of the events example: the real build, a real HTTP server (server rendering, JSON API, plain form
// posts, static files), and the browser app (the built-from-source client code on the shim DOM) talking to that server.
// Covers: static site generation, static files, per-request rendering, hydration/takeover, forms with and without
// JavaScript, client and server validation, navigation with real URLs, replay and failure recovery.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRoot, createWindow, findElements, fireEvent } from '@ehtb/agent-ui/testing/dom-shim.mjs';
import { createFakeFetch, sleep } from '@ehtb/agent-ui/testing/helpers.mjs';
import { compileUrlPattern } from '@ehtb/agent-ui/url-pattern';

const { build } = await import('@ehtb/agent-ui/build/build.mjs');
const { createSsrServer } = await import('@ehtb/agent-ui/cli/ssr-server.mjs');
const { loadConfig } = await import('@ehtb/agent-ui/build/config.mjs');
const { prerender } = await import('@ehtb/agent-ui/build/prerender.mjs');
const { definePage } = await import('@ehtb/agent-ui/pages');
const pageModules = [
  ['/event/archived', await import('./pages/event/archived/page.js'), await import('./pages/event/archived/view.js')],
  ['/event/:id', await import('./pages/event/[id]/page.js'), await import('./pages/event/[id]/view.js')],
  ['/event/*path', await import('./pages/event/[...path]/page.js'), await import('./pages/event/[...path]/view.js')],
  ['/contact', await import('./pages/contact/page.js'), await import('./pages/contact/view.js')],
  ['/about', await import('./pages/about/page.js'), await import('./pages/about/view.js')],
  ['/faq', await import('./pages/faq/page.js'), await import('./pages/faq/view.js')],
  ['/', await import('./pages/page.js'), await import('./pages/view.js')],
];
const definitions = pageModules.map(([path, pageModule, viewModule]) => ({ path, matcher: compileUrlPattern(path), definition: definePage(pageModule.page, { path, view: viewModule.view, layout: viewModule.layout }) }));
// The page that serves a URL, as the render server picks it (the most specific pattern first).
const create = (environment) => definitions.find(({ matcher }) => matcher.match(environment.win.location.pathname.replace(/(.)\/$/, '$1'))).definition.create(environment);

const repositoryRoot = dirname(fileURLToPath(import.meta.url));
const outDir = '.output-test';
const events = JSON.parse(readFileSync(join(repositoryRoot, 'public/events.json'), 'utf8'));
let server;
let base;

before(async () => {
  const config = await loadConfig({ root: repositoryRoot });
  build({ ...config, projectRoot: repositoryRoot, outDir });
  server = await createSsrServer({ config, outDir, root: repositoryRoot });
  await new Promise((resolveListening) => server.listen(0, resolveListening));
  base = `http://localhost:${server.address().port}`;
});

after(() => {
  server?.closeAllConnections?.();
  server?.close();
  rmSync(join(repositoryRoot, outDir), { recursive: true, force: true });
});

beforeEach(async () => (await import('./api.js')).createApi().reset()); // the API the server uses is one instance per process

// ---- helpers -----------------------------------------------------------------------------------------------------

const get = async (path, origin = base) => {
  const response = await fetch(origin + path);
  return { status: response.status, html: await response.text(), type: response.headers.get('content-type') };
};
const post = async (path, body, kind = 'json') => {
  const response = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': kind === 'json' ? 'application/json' : 'application/x-www-form-urlencoded' },
    body: kind === 'json' ? JSON.stringify(body) : new URLSearchParams(body).toString(),
  });
  const text = await response.text();
  return { status: response.status, text, json: response.headers.get('content-type')?.includes('json') ? JSON.parse(text) : null };
};
const markup = (html) => html.slice(html.indexOf('<!--ssr:start-->'), html.indexOf('<!--ssr:end-->'));
const embeddedState = (html) => JSON.parse(html.match(/<script type="application\/json" id="agent-ui-state"[^>]*>([\s\S]*?)<\/script>/)[1]);
const validPerson = (overrides = {}) => ({ name: 'Ada Lovelace', email: 'ada@example.com', tickets: 1, ticketType: 'standard', newsletter: false, notes: '', ...overrides });

const waitFor = async (condition, message = 'condition') => {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (condition()) return;
    await sleep(10);
  }
  assert.fail(`timed out waiting for ${message}`);
};

// The browser: takes over the page the server rendered for `path`, talking to the real server for data and API.
const boot = async (path, { fetchFunction = null, html = null } = {}) => {
  const page = html ?? (await get(path)).html;
  const calls = [];
  const realFetch = fetchFunction ?? ((url, init) => fetch(base + url, init));
  const recordingFetch = (url, init) => {
    calls.push({ url, method: init?.method ?? 'GET' });
    return realFetch(url, init);
  };
  const win = createWindow(path);
  const root = createRoot();
  const ui = create({ root, win, fetchFunction: recordingFetch, dev: true, initialState: embeddedState(page) });
  ui.dispatch('route.hydrate');
  // The app refreshes the events on mount (status goes loading -> ready); wait for that to finish.
  await waitFor(() => !ui.state().events || ui.state().events.status === 'ready', 'initial data refresh');
  const byId = (id) => findElements(root, (element) => element.attributes['data-id'] === id)[0];
  const text = () => JSON.stringify(ui.outline());
  const type = (id, value) => {
    const element = byId(id);
    element.value = value;
    fireEvent(element, 'input');
  };
  const choose = (id, value) => {
    const element = byId(id);
    element.value = value;
    fireEvent(element, 'change');
  };
  const check = (id, checked) => {
    const element = byId(id);
    element.checked = checked;
    fireEvent(element, 'change');
  };
  const submit = () => {
    const event = { preventDefault() { event.prevented = true; }, prevented: false };
    fireEvent(byId('signup-form'), 'submit', event);
    return event;
  };
  const click = (id) => fireEvent(byId(id), 'click');
  return { ui, win, root, calls, byId, text, type, choose, check, submit, click };
};
const fillValid = (browser, overrides = {}) => {
  const person = validPerson(overrides);
  browser.type('name', person.name);
  browser.type('email', person.email);
  browser.type('tickets', String(person.tickets));
};

// ---- static files -----------------------------------------------------------------------------------------------------

test('a file of public/ is copied to the site untouched', () => {
  assert.equal(readFileSync(join(repositoryRoot, outDir, 'terms.html'), 'utf8'), readFileSync(join(repositoryRoot, 'public/terms.html'), 'utf8'));
});

test('terms.html is plain static HTML: no state script, no module script, served as HTML', async () => {
  const terms = await get('/terms.html');
  assert.equal(terms.status, 200);
  assert.match(terms.type, /text\/html/);
  assert.doesNotMatch(terms.html, /agent-ui-state|type="module"/);
  assert.match(terms.html, /plain static HTML file/);
});

// ---- server rendering -----------------------------------------------------------------------------------------------

test('every route is rendered for its URL, with real links and the right status', async () => {
  const list = await get('/');
  assert.equal(list.status, 200);
  for (const event of events) assert.ok(markup(list.html).includes(event.title), event.title);
  assert.match(markup(list.html), /href="\/event\/1"/);
  assert.match(markup(list.html), /href="\/terms\.html"/);
  assert.match(markup(list.html), /4 events/);
  assert.match(markup(list.html), /Server-rendered: waiting for JavaScript/);

  assert.match(markup((await get('/about')).html), /About these meetups/);
  assert.match(markup((await get('/faq')).html), /What if an event is full\?/);

  const detail = await get('/event/2');
  assert.equal(detail.status, 200);
  assert.ok(markup(detail.html).includes('Hands-on: server rendering'));
  assert.ok(!markup(detail.html).includes('Friday social')); // only this event is in the markup
  assert.deepEqual(embeddedState(detail.html).route, { params: { id: '2' }, hydrated: false });

  const missing = await get('/event/999');
  assert.equal(missing.status, 404);
  assert.match(markup(missing.html), /Event not found/);
  assert.equal((await get('/nothing-here')).status, 404);
});

test('the form is accessible and works as a plain HTML form: fields have names and labels', async () => {
  const html = markup((await get('/event/1')).html);
  for (const name of ['name', 'email', 'tickets', 'ticketType', 'notes', 'newsletter']) assert.match(html, new RegExp(`name="${name}"`), name);
  for (const label of ['Full name', 'Email', 'Number of tickets', 'Ticket type', 'Notes', 'Send me the newsletter']) assert.ok(html.includes(`aria-label="${label}"`), label);
  assert.match(html, /<button [^>]*type="submit"/);
});

// ---- the API -----------------------------------------------------------------------------------------------------

test('API: success, field errors, duplicates, capacity, unknown event and malformed requests', async () => {
  const ok = await post('/api/event/1/signup', validPerson({ tickets: 2 }));
  assert.equal(ok.status, 201);
  assert.match(ok.json.reference, /^EVT-1-\d+$/);
  assert.equal(ok.json.seatsLeft, 118);

  const invalid = await post('/api/event/1/signup', validPerson({ name: 'A', email: 'nope', tickets: 9 }));
  assert.equal(invalid.status, 422);
  assert.deepEqual(Object.keys(invalid.json.errors).sort(), ['email', 'name', 'tickets']);
  assert.equal(invalid.json.message, 'Please fix the highlighted fields.');

  const duplicate = await post('/api/event/1/signup', validPerson({ tickets: 1 }));
  assert.equal(duplicate.status, 409);
  assert.match(duplicate.json.message, /already registered/);

  assert.equal((await post('/api/event/3/signup', validPerson({ email: 'a@x.io', tickets: 2 }))).status, 201);
  const soldOut = await post('/api/event/3/signup', validPerson({ email: 'b@x.io' }));
  assert.equal(soldOut.status, 409);
  assert.match(soldOut.json.message, /sold out/);
  assert.equal((await post('/api/event/4/signup', validPerson({ tickets: 20 }))).status, 422); // more than the capacity of 15

  assert.equal((await post('/api/event/99/signup', validPerson())).status, 404);
  assert.equal((await post('/api/nothing', {})).status, 404);
  const broken = await fetch(`${base}/api/event/1/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json' });
  assert.equal(broken.status, 400);

  const count = await (await fetch(`${base}/api/event/1/registrations`)).json();
  assert.deepEqual([count.count, count.seatsTaken], [1, 2]);
});

// ---- forms without JavaScript ------------------------------------------------------------------------------------

test('plain form post: a valid sign-up returns the confirmation page; the registration is real', async () => {
  const response = await post('/event/1/signup', { name: 'Grace Hopper', email: 'grace@example.com', tickets: '2', ticketType: 'vip', notes: 'hi' }, 'form');
  assert.equal(response.status, 200);
  assert.match(markup(response.text), /id="signup-confirmation"[^>]*>You are registered\. Your reference is EVT-1-1\./);
  assert.doesNotMatch(markup(response.text), /id="signup-form"/);
  assert.equal(embeddedState(response.text).event.status, 'done');
  assert.equal((await (await fetch(`${base}/api/event/1/registrations`)).json()).seatsTaken, 2);
});

test('plain form post: invalid input comes back as a 422 page with messages and the typed values kept', async () => {
  const response = await post('/event/2/signup', { name: '', email: 'not-an-email', tickets: '1', ticketType: 'standard', notes: 'keep me' }, 'form');
  assert.equal(response.status, 422);
  const html = markup(response.text);
  assert.match(html, /id="error-name"[^>]*>Enter your name/);
  assert.match(html, /id="error-email"[^>]*>Enter a valid email address\./);
  assert.match(html, /value="not-an-email"/);
  assert.match(html, />keep me<\/textarea>/);
  assert.match(html, /Please fix the highlighted fields\./);
  assert.equal((await (await fetch(`${base}/api/event/2/registrations`)).json()).count, 0); // nothing was registered
});

test('plain form post: duplicates and sold-out events show the server message; unknown events are 404', async () => {
  const fields = { name: 'Ada Lovelace', email: 'ada@example.com', tickets: '2', ticketType: 'standard' };
  assert.equal((await post('/event/3/signup', fields, 'form')).status, 200);
  const duplicate = await post('/event/3/signup', fields, 'form');
  assert.equal(duplicate.status, 409);
  assert.match(markup(duplicate.text), /already registered for this event/);
  const soldOut = await post('/event/3/signup', { ...fields, email: 'other@example.com' }, 'form');
  assert.match(markup(soldOut.text), /sold out/);
  assert.equal((await post('/event/99/signup', fields, 'form')).status, 404);
});

// ---- hydration: the browser takes over --------------------------------------------------------------------------

test('takeover: the first render shows the server content with no loading flash, then the app becomes interactive', async () => {
  const page = (await get('/event/1')).html;
  const win = createWindow('/event/1');
  const root = createRoot();
  const ui = create({ root, win, fetchFunction: () => new Promise(() => {}), dev: true, initialState: embeddedState(page) });
  const text = () => JSON.stringify(ui.outline());
  assert.ok(text().includes('Intro to agent-driven UIs')); // before any fetch resolves
  assert.ok(text().includes('Server-rendered: waiting for JavaScript'));
  ui.dispatch('route.hydrate');
  await ui.settle();
  assert.ok(text().includes('Interactive: the browser has taken over'));
  assert.equal(ui.errors.length, 0);
});

test('takeover keeps a server-computed outcome: a confirmation or error page does not get reset', async () => {
  const done = await post('/event/1/signup', { name: 'Grace Hopper', email: 'grace@example.com', tickets: '1', ticketType: 'standard' }, 'form');
  const browser = await boot('/event/1', { html: done.text });
  assert.ok(browser.text().includes('Your reference is EVT-1-1'));
  assert.equal(browser.ui.state().event.status, 'done');

  const invalid = await post('/event/2/signup', { name: '', email: 'bad', tickets: '1', ticketType: 'standard' }, 'form');
  const retry = await boot('/event/2', { html: invalid.text });
  assert.deepEqual(Object.keys(retry.ui.state().event.errors).sort(), ['email', 'name']);
  assert.ok(retry.text().includes('Enter a valid email address.'));
  // ... and the visitor can fix it right there, with JavaScript now running.
  fillValid(retry, { name: 'Alan Turing', email: 'alan@example.com' });
  retry.submit();
  await waitFor(() => retry.ui.state().event.status === 'done', 'confirmation');
  assert.match(retry.ui.state().event.reference, /^EVT-2-/);
});

// ---- the form with JavaScript -----------------------------------------------------------------------------------

test('client validation: nothing is sent until the form is valid, errors clear as the field is edited', async () => {
  const browser = await boot('/event/1');
  const requestsBefore = browser.calls.length;
  const event = browser.submit();
  await browser.ui.settle();
  assert.equal(event.prevented, true); // no page reload
  assert.deepEqual(Object.keys(browser.ui.state().event.errors).sort(), ['email', 'name']);
  assert.ok(browser.text().includes('Enter your name'));
  assert.equal(browser.calls.length, requestsBefore); // no request

  browser.type('name', 'Ada');
  await browser.ui.settle();
  assert.ok(!('name' in browser.ui.state().event.errors) && 'email' in browser.ui.state().event.errors);
  browser.type('tickets', '9');
  browser.type('email', 'ada@example.com');
  browser.submit();
  await browser.ui.settle();
  assert.deepEqual(Object.keys(browser.ui.state().event.errors), ['tickets']);
  assert.equal(browser.calls.filter((call) => call.method === 'POST').length, 0);
  assert.equal(browser.ui.errors.length, 0);
});

test('client submit: busy state, one request even if submitted twice, confirmation, then register another person', async () => {
  const browser = await boot('/event/1');
  fillValid(browser, { tickets: 2 });
  browser.choose('ticket-type', 'vip');
  browser.check('newsletter', true);
  browser.type('notes', 'front row please');
  browser.submit();
  browser.submit(); // a repeated Enter
  await browser.ui.settle();
  assert.equal(browser.ui.state().event.status, 'submitting');
  assert.equal(browser.byId('signup-submit').disabled, true);
  await waitFor(() => browser.ui.state().event.status === 'done', 'confirmation');
  assert.equal(browser.calls.filter((call) => call.method === 'POST').length, 1);
  assert.ok(browser.text().includes('You are registered. Your reference is EVT-1-1.'));
  assert.equal(browser.byId('signup-form'), undefined);
  assert.equal((await (await fetch(`${base}/api/event/1/registrations`)).json()).seatsTaken, 2);

  browser.click('signup-another');
  await browser.ui.settle();
  assert.ok(browser.byId('signup-form'));
  assert.deepEqual(browser.ui.state().event.values, { name: '', email: '', tickets: '1', ticketType: 'standard', newsletter: false, notes: '' });
  assert.equal(browser.ui.errors.length, 0);
});

test('client submit: the server can still refuse (duplicate, sold out) and the message is shown with the form kept', async () => {
  await post('/api/event/3/signup', validPerson({ email: 'first@example.com', tickets: 1 }));
  const browser = await boot('/event/3');
  fillValid(browser, { name: 'First Again', email: 'first@example.com' });
  browser.submit();
  await waitFor(() => browser.ui.state().event.message !== '', 'refusal');
  assert.match(browser.ui.state().event.message, /already registered/);
  assert.equal(browser.ui.state().event.status, 'editing');
  assert.ok(browser.byId('signup-form') && browser.text().includes('already registered'));
  assert.equal(browser.ui.state().event.values.name, 'First Again'); // nothing typed is lost

  browser.type('email', 'second@example.com');
  browser.type('tickets', '2');
  browser.submit();
  await waitFor(() => /Only 1 seat left/.test(browser.ui.state().event.message), 'capacity message');
  browser.type('tickets', '1');
  browser.submit();
  await waitFor(() => browser.ui.state().event.status === 'done', 'confirmation');
});

test('all form controls are labelled and addressable for other agents (tree())', async () => {
  const browser = await boot('/event/1');
  const entries = browser.ui.tree();
  for (const id of ['name', 'email', 'tickets', 'ticket-type', 'notes', 'newsletter']) {
    const entry = entries.find((candidate) => candidate.id === id);
    assert.ok(entry && entry.label, `${id} has a label`);
  }
  assert.deepEqual(entries.find((candidate) => candidate.id === 'signup-form').on, { submit: 'event.submit' });
});

// ---- links between pages ----------------------------------------------------------------------------------------------

test('every page is its own document: links are plain, each URL opens its page, and an unknown event shows a not-found view', async () => {
  const home = await boot('/');
  const links = home.ui.tree().filter((entry) => entry.tag === 'a').map((entry) => entry.href);
  for (const href of ['/', '/about', '/faq', '/contact', '/event/archived', '/terms.html', '/event/1']) assert.ok(links.includes(href), href);
  assert.ok(!home.text().includes('About these meetups')); // a link opens another page, it does not swap this one

  const about = await boot('/about');
  assert.ok(about.text().includes('About these meetups'));
  assert.ok(!about.text().includes('Intro to agent-driven UIs'));
  const event = await boot('/event/2');
  assert.deepEqual(event.ui.state().route.params, { id: '2' });
  assert.ok(event.byId('signup-form'));
  const missing = await boot('/event/999');
  assert.equal(missing.ui.derived().event.isNotFound, true);
  assert.ok(missing.text().includes('Event not found.'));
  assert.equal(missing.ui.errors.length, 0);
});

test('a page opens with a fresh form, whatever another page had typed', async () => {
  const first = await boot('/event/1');
  first.type('name', 'Half typed');
  first.submit();
  await first.ui.settle();
  assert.ok(Object.keys(first.ui.state().event.errors).length > 0);
  const second = await boot('/event/2');
  assert.equal(second.ui.state().event.values.name, '');
  assert.deepEqual(second.ui.state().event.errors, {});
});

test('search and category filters narrow the list, with a count and an empty state', async () => {
  const browser = await boot('/');
  assert.equal(browser.ui.derived().list.visible.length, 4);
  browser.type('search', 'HANDS-ON'); // case-insensitive
  await browser.ui.settle();
  assert.deepEqual(browser.ui.derived().list.visible.map((event) => event.id), [2]);
  assert.equal(browser.byId('result-count').textContent, '1 event');
  browser.type('search', '');
  browser.choose('category', 'workshop');
  await browser.ui.settle();
  assert.deepEqual(browser.ui.derived().list.visible.map((event) => event.id), [2, 4]);
  browser.type('search', 'friday');
  await browser.ui.settle();
  assert.equal(browser.ui.derived().list.visible.length, 0);
  assert.equal(browser.byId('result-count').textContent, '0 events');
  assert.ok(browser.text().includes('No events match your search.'));
  browser.choose('category', 'not-a-category'); // unknown values fall back to all
  assert.equal(browser.ui.state().list.category, 'all');
});

// ---- replay and failure ----------------------------------------------------------------------------------------------

test('a whole session replays from its action log without touching the network', async () => {
  const browser = await boot('/event/4');
  fillValid(browser, { name: 'Replay Person', email: 'replay@example.com' });
  browser.submit();
  await waitFor(() => browser.ui.state().event.status === 'done', 'confirmation');
  const log = browser.ui.log.slice();
  const finalState = JSON.stringify(browser.ui.state());
  const requests = browser.calls.length;

  const replayed = await browser.ui.replay(log);
  assert.equal(JSON.stringify(replayed), finalState);
  assert.equal(browser.calls.length, requests); // resources stay quiet while replaying
  assert.equal((await (await fetch(`${base}/api/event/4/registrations`)).json()).count, 1); // and nothing was registered twice
});

test('loading failure shows a message and a retry that recovers', async () => {
  let failing = true;
  const flaky = createFakeFetch((url) => (url === '/events.json' ? (failing ? { ok: false, status: 503 } : events) : { ok: false, status: 404 }));
  const win = createWindow('/');
  const root = createRoot();
  const ui = create({ root, win, fetchFunction: flaky, dev: true });
  await waitFor(() => ui.state().events.status === 'failed', 'failure');
  const text = () => JSON.stringify(ui.outline());
  assert.ok(text().includes('Could not load events: HTTP 503'));
  failing = false;
  fireEvent(findElements(root, (element) => element.attributes['data-id'] === 'reload')[0], 'click');
  await waitFor(() => ui.state().events.status === 'ready', 'recovery');
  assert.equal(ui.derived().list.visible.length, 4);
  assert.ok(!text().includes('Could not load events'));
  assert.equal(ui.errors.length, 0);
});

// ---- pages with their own design, API and head ---------------------------------------------------------------

test('each page has its own title and description, and the contact page uses a different shell', async () => {
  const list = (await get('/')).html;
  const contact = (await get('/contact')).html;
  const event = (await get('/event/2')).html;
  assert.match(list, /<title>Meetups<\/title>/);
  assert.match(contact, /<title>Contact - Meetups<\/title>/);
  assert.match(event, new RegExp(`<title>${events[1].title} - Meetups</title>`));
  assert.match(event, new RegExp(`<meta name="description" content="${events[1].summary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">`));
  // Different structure, not only different content.
  assert.match(markup(contact), /data-id="focused-app"/);
  assert.match(markup(contact), /<aside/);
  assert.doesNotMatch(markup(contact), /site-nav/);
  assert.match(markup(list), /site-nav/);
  assert.doesNotMatch(markup(list), /focused-app/);
  assert.match(contact, /<title>Contact - Meetups<\/title>/);
});

test('each route answers only for its own API paths', async () => {
  const message = { name: 'Ada Lovelace', email: 'ada@example.com', message: 'Is there a waiting list for workshops?' };
  const sent = await post('/api/contact/message', message);
  assert.equal(sent.status, 201);
  assert.equal(sent.json.reference, 'MSG-1');
  const invalid = await post('/api/contact/message', { name: 'A', email: 'x', message: 'short' });
  assert.equal(invalid.status, 422);
  assert.deepEqual(Object.keys(invalid.json.errors).sort(), ['email', 'message', 'name']);
  // Another route's endpoint is not reachable under this route's name, and the reverse.
  assert.equal((await post('/api/contact/1/signup', validPerson())).status, 404);
  assert.equal((await post('/api/event/message', message)).status, 404);
  assert.equal((await post('/api/event/1/signup', validPerson())).status, 201);
});

test('contact form works as a plain HTML form and with JavaScript', async () => {
  const fields = { name: 'Grace Hopper', email: 'grace@example.com', message: 'Can we host a talk next spring?' };
  const done = await post('/contact', fields, 'form');
  assert.equal(done.status, 200);
  assert.match(markup(done.text), /Your reference is MSG-1/);
  const invalid = await post('/contact', { ...fields, email: 'nope' }, 'form');
  assert.equal(invalid.status, 422);
  assert.match(markup(invalid.text), /Enter a valid email address/);
  assert.match(invalid.text, /value="Grace Hopper"/); // the typed values come back

  // With JavaScript: validates first, then sends once, then confirms.
  const browser = await boot('/contact');
  assert.deepEqual(browser.ui.state().route.params, {});
  const before = browser.calls.length;
  fireEvent(browser.byId('contact-form'), 'submit', { preventDefault() {} });
  await browser.ui.settle();
  assert.equal(browser.calls.length, before); // nothing sent while invalid
  assert.deepEqual(Object.keys(browser.ui.state().contact.errors).sort(), ['email', 'message', 'name']);
  browser.type('contact-name', 'Alan Turing');
  browser.type('contact-email', 'alan@example.com');
  browser.type('contact-message', 'Do you record the talks?');
  fireEvent(browser.byId('contact-form'), 'submit', { preventDefault() {} });
  await waitFor(() => browser.ui.state().contact.status === 'done', 'confirmation');
  assert.match(browser.ui.state().contact.reference, /^MSG-/);
  assert.equal(browser.calls.filter((call) => call.url === '/api/contact/message').length, 1);
  assert.equal(browser.ui.errors.length, 0);
});

// ---- a specific route next to a parameter route ------------------------------------------------------------------------

test('/event/archived is its own page; /event/<id> still reaches the event page', async () => {
  const archived = await get('/event/archived');
  assert.equal(archived.status, 200);
  assert.match(archived.html, /<title>Archived events - Meetups<\/title>/);
  assert.match(markup(archived.html), /data-id="archived-view"/);
  assert.doesNotMatch(markup(archived.html), /Event not found|event-view/);
  assert.deepEqual(embeddedState(archived.html).route.params, {});
  assert.match(markup(archived.html), /2 archived events/); // events 1 and 2 are dated before the cutoff
  assert.doesNotMatch(markup(archived.html), new RegExp(events[2].title));

  const event = await get('/event/1');
  assert.match(markup(event.html), /data-id="event-view"/);
  assert.deepEqual(embeddedState(event.html).route.params, { id: '1' });
  // An id that does not exist is still the event page, with its own 404.
  const missing = await get('/event/abc');
  assert.equal(missing.status, 404);
  assert.match(markup(missing.html), /Event not found/);
});

test('the archived page lists its events as plain links to the event pages', async () => {
  const browser = await boot('/event/archived');
  assert.equal(browser.ui.derived().eventArchived.events.length, 2);
  const hrefs = browser.ui.tree().filter((entry) => entry.tag === 'a').map((entry) => entry.href);
  assert.ok(hrefs.includes('/event/2'));
});

test('/event/*path is the wildcard: deeper URLs get a 404 page and never take /event/:id or /event/archived', async () => {
  const deep = await get('/event/1/foo/bar');
  assert.equal(deep.status, 404);
  assert.deepEqual(embeddedState(deep.html).route.params, { path: '1/foo/bar' });
  assert.match(markup(deep.html), /There is no page at \/event\/1\/foo\/bar\./);
  assert.match(deep.html, /<title>Page not found - Meetups<\/title>/);
  // Below the literal URL is the wildcard's too; the literal URL itself and /event/<id> are not.
  assert.deepEqual(embeddedState((await get('/event/archived/old/2019')).html).route.params, { path: 'archived/old/2019' });
  assert.match((await get('/event/archived')).html, /archived-view/);
  assert.match((await get('/event/2')).html, /event-view/);
  // In the browser the same URL reaches the same page.
  const browser = await boot('/event/3/x');
  assert.deepEqual(browser.ui.state().route.params, { path: '3/x' });
});

test('a static site is refused: the event pages have parameters, so they have no single file', async () => {
  const config = await loadConfig({ root: repositoryRoot });
  await assert.rejects(
    prerender({ projectRoot: repositoryRoot, outDir, pages: config.pages }),
    /page "\/event\/:id".*has parameters, so a static site has no single file for it/,
  );
});
