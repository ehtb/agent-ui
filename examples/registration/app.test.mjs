// The form in the browser app, on the headless DOM shim, with a fetch the test controls: fields that show and hide each
// other, a collapsible panel, lists fetched from the server (with a slow answer, a missing list and a failure).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRoot, createWindow, findElements, fireEvent } from '@ehtb/agent-ui/testing/dom-shim.mjs';
import { createFakeFetch, deferred, flushAsync } from '@ehtb/agent-ui/testing/helpers.mjs';
import { definePage } from '@ehtb/agent-ui/pages';
import { page } from './pages/page.js';
import { view } from './pages/view.js';

const { create } = definePage(page, { path: '/', view });

const publicDirectory = join(dirname(fileURLToPath(import.meta.url)), 'public');
const readJson = (file) => JSON.parse(readFileSync(join(publicDirectory, file), 'utf8'));
const notFound = { ok: false, status: 404, json: async () => null };

// Answers like the real public/ folder: a country list, and a region list for some countries only.
const serveFiles = (url) => {
  try {
    return readJson(url.slice(1));
  } catch {
    return notFound;
  }
};

const open = async (respond = serveFiles) => {
  const fake = createFakeFetch(respond);
  const root = createRoot();
  const ui = create({ root, win: createWindow('/'), fetchFunction: fake, dev: true });
  await flushAsync(ui);
  const byId = (id) => findElements(root, (element) => element.attributes['data-id'] === id)[0];
  return { ui, fake, byId };
};
// The ids of everything rendered. Updates are scheduled, so wait for them first (state and derived values are always current).
const ids = async (ui) => {
  await ui.settle();
  const found = [];
  const walk = (nodes) => nodes.forEach((node) => { found.push(node.id); walk(node.children ?? []); });
  walk(ui.outline());
  return found;
};
const fill = (ui, values) => Object.entries(values).forEach(([name, value]) => assert.equal(ui.dispatch('form.setField', { name, value }), undefined));

const validValues = { fullName: 'Ada Lovelace', email: 'ada@example.com', password: 'analytical1', passwordConfirm: 'analytical1', street: 'Kade 1', city: 'Utrecht', postalCode: '3511 AA' };

test('the country list is fetched on mount; the select says so while it loads', async () => {
  const response = deferred();
  const { ui } = await open(() => response);
  assert.equal(ui.state().countries.status, 'loading');
  assert.equal(ui.derived().countries.busy, true);
  assert.equal(ui.tree().find((node) => node.id === 'country').label, 'Country');
  response.resolve(readJson('countries.json'));
  await flushAsync(ui);
  assert.equal(ui.state().countries.status, 'ready');
  assert.equal(ui.state().countries.list.length, 10);
  assert.equal(ui.derived().countries.busy, false);
});

test('a failed country list offers to try again', async () => {
  let answer = notFound;
  const { ui } = await open(() => answer);
  assert.equal(ui.state().countries.status, 'failed');
  assert.ok((await ids(ui)).includes('countries-retry'));
  answer = readJson('countries.json');
  ui.dispatch('countries.reload');
  await flushAsync(ui);
  assert.equal(ui.state().countries.status, 'ready');
  assert.equal((await ids(ui)).includes('countries-retry'), false);
});

test('choosing a country fetches its regions and shows the region field; a country without a list hides it', async () => {
  const { ui, fake } = await open();
  ui.dispatch('form.setCountry', { value: 'NL' });
  await flushAsync(ui);
  assert.equal(fake.calls.at(-1).url, '/regions/NL.json');
  assert.equal(ui.state().regions.status, 'ready');
  assert.equal(ui.state().regions.list.length, 12);
  assert.ok((await ids(ui)).includes('region'));
  ui.dispatch('form.setCountry', { value: 'JP' }); // no regions/JP.json: a 404 is an answer
  await flushAsync(ui);
  assert.equal(ui.state().regions.status, 'none');
  assert.equal((await ids(ui)).includes('region'), false);
  assert.equal(ui.errors.length, 0);
});

test('changing the country empties the region that depended on the old one', async () => {
  const { ui } = await open();
  ui.dispatch('form.setCountry', { value: 'NL' });
  await flushAsync(ui);
  fill(ui, { region: 'utrecht' });
  ui.dispatch('form.setCountry', { value: 'US' });
  assert.equal(ui.state().form.region, '');
  assert.equal(ui.state().regions.status, 'loading');
  await flushAsync(ui);
  assert.equal(ui.state().regions.list[0].name, 'California');
});

test('only the latest country counts: a slow answer for the old one is ignored', async () => {
  const slow = deferred();
  const { ui } = await open((url) => (url === '/regions/NL.json' ? slow : serveFiles(url)));
  ui.dispatch('form.setCountry', { value: 'NL' });
  await flushAsync(ui);
  ui.dispatch('form.setCountry', { value: 'US' });
  await flushAsync(ui);
  slow.resolve(readJson('regions/NL.json'));
  await flushAsync(ui);
  assert.equal(ui.state().form.country, 'US');
  assert.equal(ui.state().regions.list[0].name, 'California');
});

test('a failed region request (not a 404) says so and keeps the form usable', async () => {
  const { ui } = await open((url) => (url.startsWith('/regions/') ? new Error('network down') : serveFiles(url)));
  ui.dispatch('form.setCountry', { value: 'NL' });
  await flushAsync(ui);
  assert.equal(ui.state().regions.status, 'failed');
  assert.ok((await ids(ui)).includes('regions-error'));
});

test('the account type shows the company fields, and the VAT hint follows the country', async () => {
  const { ui } = await open();
  assert.equal((await ids(ui)).includes('business-fields'), false);
  fill(ui, { accountType: 'business' });
  assert.ok((await ids(ui)).includes('business-fields'));
  assert.equal(ui.derived().form.shown.vatRequired, false); // no country yet
  ui.dispatch('form.setCountry', { value: 'NL' });
  await flushAsync(ui);
  assert.equal(ui.derived().form.shown.vatRequired, true);
  ui.dispatch('form.setCountry', { value: 'US' });
  await flushAsync(ui);
  assert.equal(ui.derived().form.shown.vatRequired, false);
  assert.equal(ui.derived().form.postalLabel, 'ZIP code');
});

test('"ship to the address above" hides the shipping address; unticking shows it', async () => {
  const { ui } = await open();
  assert.equal((await ids(ui)).includes('shipping-fields'), false);
  ui.dispatch('form.toggleField', { name: 'shippingSame', checked: false });
  assert.ok((await ids(ui)).includes('shipping-fields'));
  ui.dispatch('form.toggleField', { name: 'shippingSame', checked: true });
  assert.equal((await ids(ui)).includes('shipping-fields'), false);
});

test('the advanced panel collapses and expands from its button, and the phone field needs the checkbox', async () => {
  const { ui, byId } = await open();
  assert.equal((await ids(ui)).includes('advanced-panel'), false);
  assert.equal(byId('advanced-toggle').attributes['aria-expanded'], 'false');
  fireEvent(byId('advanced-toggle'), 'click');
  await flushAsync(ui);
  assert.ok((await ids(ui)).includes('advanced-panel'));
  assert.equal(byId('advanced-toggle').attributes['aria-expanded'], 'true');
  assert.equal(ui.derived().form.advancedLabel, 'Hide advanced options');
  assert.equal((await ids(ui)).includes('phone'), false);
  ui.dispatch('form.toggleField', { name: 'phoneContact', checked: true });
  assert.ok((await ids(ui)).includes('phone'));
  fireEvent(byId('advanced-toggle'), 'click'); // collapse again
  await flushAsync(ui);
  assert.equal((await ids(ui)).includes('advanced-panel'), false);
});

test('the newsletter checkbox reveals the frequency; the password toggle changes the input type; strength follows', async () => {
  const { ui, byId } = await open();
  assert.equal((await ids(ui)).includes('newsletterFrequency'), false);
  ui.dispatch('form.toggleField', { name: 'newsletter', checked: true });
  assert.ok((await ids(ui)).includes('newsletterFrequency'));
  assert.equal(byId('password').attributes.type ?? byId('password').type, 'password');
  ui.dispatch('form.toggleField', { name: 'showPassword', checked: true });
  fill(ui, { password: 'abcdefg1' });
  await ui.settle(); // derived values are recomputed on the next update
  assert.equal(ui.derived().form.passwordType, 'text');
  assert.equal(ui.derived().form.passwordStrengthText, 'Strength: fair');
});

test('errors appear only after the first attempt; a valid form shows what would be sent', async () => {
  const { ui } = await open();
  assert.equal(ui.derived().form.errorCount, 0);
  ui.dispatch('form.submit');
  await ui.settle();
  assert.ok(ui.derived().form.errorCount > 0);
  assert.ok((await ids(ui)).includes('error-summary'));
  assert.ok((await ids(ui)).includes('error-fullName'));
  assert.equal(ui.state().form.submitStatus, 'editing');
  ui.dispatch('form.setCountry', { value: 'JP' });
  await flushAsync(ui);
  fill(ui, validValues);
  await ui.settle();
  assert.equal(ui.derived().form.errorCount, 0); // errors clear as the fields become valid
  ui.dispatch('form.submit');
  await ui.settle();
  assert.equal(ui.state().form.submitStatus, 'done');
  const payload = JSON.parse(ui.derived().form.payloadText);
  assert.equal(payload.country, 'JP');
  assert.equal('region' in payload, false);
  assert.equal(JSON.stringify(payload).includes('analytical1'), false);
  assert.ok((await ids(ui)).includes('confirmation'));
});

test('starting over empties the form and keeps the fetched country list', async () => {
  const { ui } = await open();
  ui.dispatch('form.setCountry', { value: 'JP' });
  await flushAsync(ui);
  fill(ui, validValues);
  ui.dispatch('form.submit');
  ui.dispatch('form.reset');
  assert.equal(ui.state().form.submitStatus, 'editing');
  assert.equal(ui.state().form.fullName, '');
  assert.equal(ui.state().form.country, '');
  assert.equal(ui.state().countries.list.length, 10);
  assert.equal(ui.state().countries.status, 'ready');
});

test('an unknown field name is refused with the list of valid ones', async () => {
  const { ui } = await open();
  assert.match(ui.dispatch('form.setField', { name: 'nope', value: 'x' }) ?? ui.errors.join(' '), /unknown field "nope"\. Text fields:/);
});

test('typing in a field goes through the action log', async () => {
  const { ui, byId } = await open();
  const input = byId('fullName');
  input.value = 'Grace Hopper';
  fireEvent(input, 'input', { target: input });
  await flushAsync(ui);
  assert.equal(ui.state().form.fullName, 'Grace Hopper');
  assert.deepEqual(ui.log.at(-1), ['form.setField', { name: 'fullName', value: 'Grace Hopper' }]);
});
