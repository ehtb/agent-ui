// The kit and the page built from it, on the headless DOM shim: what each component expands to, the mistakes the
// kit refuses, and the sign-up card (fields that show their message only after they were left or submitted).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandComponents } from '@ehtb/agent-ui/components';
import { app } from '@ehtb/agent-ui';
import { createRoot, findElements, fireEvent } from '@ehtb/agent-ui/testing/dom-shim.mjs';
import { definePage } from '@ehtb/agent-ui/pages';
import { page } from './pages/page.js';
import { view } from './pages/view.js';
import { components } from './ui/index.js';
import { textField } from './features.js';

const { create } = definePage(page, { path: '/', view });

const open = async () => {
  const root = createRoot();
  const ui = create({ root, dev: true });
  await ui.settle();
  const byId = (id) => findElements(root, (element) => element.attributes['data-id'] === id)[0];
  return { ui, root, byId };
};
// The text of the element with this id, from the rendered outline (undefined when it is not on the page).
const textOf = (ui, id) => {
  const find = (nodes) => nodes.map((node) => (node.id === id ? node : find(node.children ?? []))).find(Boolean);
  return find(ui.outline())?.text;
};
const problemsOf = (spec) => {
  try {
    expandComponents(spec, components);
  } catch (error) {
    return error.problems;
  }
  return [];
};

test('a button becomes one element: the variant and size classes and data attributes, a type and handler only when given', () => {
  assert.deepEqual(expandComponents({ use: 'button', with: { variant: 'outline', size: 'sm' }, children: 'Save' }, components), {
    tag: 'button',
    props: { 'data-slot': 'button', 'data-variant': 'outline', 'data-size': 'sm', disabled: false, class: 'ui-button ui-button--outline ui-button--sm' },
    children: ['Save'],
  });
  const handled = expandComponents({ use: 'button', with: { id: 'go', onClick: ['save', {}], class: 'wide', label: 'Go', type: 'submit' } }, components);
  assert.equal(handled.props.type, 'submit');
  assert.deepEqual(handled.on, { click: ['save', {}] });
  assert.equal(handled.props.class, 'ui-button ui-button--default ui-button--md wide');
  assert.equal(handled.props['aria-label'], 'Go');
});

test('an input turns its field name into bindings and handlers', () => {
  const element = expandComponents({ use: 'input', with: { id: 'email', field: 'email', label: 'Email', type: 'email' } }, components);
  assert.equal(element.props.value.state, 'email.value');
  assert.equal(element.props['aria-invalid'].state, 'email.invalid');
  assert.deepEqual(element.on.input, ['email.set', { value: { event: 'target.value' } }]);
  assert.deepEqual(element.on.focusout, ['email.touch', {}]);
  assert.equal('placeholder' in element.props, false, 'an omitted optional param leaves no attribute');
});

test('the kit refuses what React would silently accept: a mistyped variant, a bound variant, a missing id, a stray prop', () => {
  assert.match(problemsOf({ use: 'button', with: { variant: 'destructve' }, children: 'x' })[0], /param variant is "destructve", which is not one of its options\. Did you mean "destructive"\?/);
  assert.match(problemsOf({ use: 'button', with: { variant: { state: 'v' } }, children: 'x' })[0], /must be a literal option/);
  assert.match(problemsOf({ use: 'input', with: { field: 'email', label: 'Email' } })[0], /component input needs param id/);
  assert.match(problemsOf({ use: 'badge', with: { colour: 'red' }, children: 'x' })[0], /component badge has no param colour\. .*Declared: id, variant, class/);
  assert.match(problemsOf({ use: 'buton', children: 'x' })[0], /unknown component buton\. Did you mean "button"\?/);
});

test('every component in the kit is declared correctly (a declaration mistake would fail here, not on first use)', () => {
  assert.deepEqual(expandComponents({ tag: 'p', children: 'no component used' }, components), { tag: 'p', children: 'no component used' });
});

test('a feature mounted twice gives each mount its own names, and cannot collide', () => {
  const ui = app({ dev: true, namespaces: { first: textField(), second: textField() }, spec: { tag: 'p', children: 'x' }, root: createRoot() });
  assert.deepEqual(ui.keys().filter((key) => !key.includes('Error')).slice(0, 4), ['first.value', 'first.touched', 'second.value', 'second.touched']);
  ui.dispatch('first.set', { value: 'a' });
  assert.deepEqual([ui.state().first.value, ui.state().second.value], ['a', '']);
});

test('the sign-up card shows a message only after the field was left; submit shows them all', async () => {
  const { ui, byId } = await open();
  assert.equal(byId('email-error'), undefined);
  ui.dispatch('email.set', { value: 'not an email' });
  await ui.settle();
  assert.equal(byId('email-error'), undefined, 'typing alone shows nothing yet');
  ui.dispatch('email.touch');
  await ui.settle();
  assert.equal(textOf(ui, 'email-error'), 'That does not look like an email address.');
  assert.equal(byId('email').attributes['aria-invalid'], 'true');
  ui.dispatch('signup.submit');
  await ui.settle();
  assert.ok(byId('password-error'));
  assert.ok(byId('terms-error'));
  assert.equal(ui.state().signup.submitted, false);
  assert.equal(byId('signup-done'), undefined);
  assert.deepEqual([ui.state().email.touched, ui.state().password.touched, ui.state().terms.touched], [true, true, true], 'signup.submit touched every field through calls');
});

test('a valid form submits and says so', async () => {
  const { ui, byId } = await open();
  ui.dispatch('email.set', { value: 'ada@example.com' });
  ui.dispatch('password.set', { value: 'analytical1' });
  ui.dispatch('terms.set', { value: true });
  ui.dispatch('signup.submit');
  await ui.settle();
  assert.equal(ui.state().signup.submitted, true);
  assert.ok(byId('signup-done'));
  assert.equal(byId('email-error'), undefined);
  assert.equal(byId('email').attributes['aria-invalid'], 'false');
});

test('the welcome alert can be dismissed for good and the other alert stays', async () => {
  const { ui, root, byId } = await open();
  assert.ok(byId('welcome'));
  assert.equal(ui.dispatch('welcome.dismiss'), undefined);
  await ui.settle();
  assert.equal(byId('welcome'), undefined);
  assert.equal(findElements(root, (element) => element.attributes.role === 'alert').length, 1);
});

test('real events reach the field actions: typing, leaving the field and ticking the box', async () => {
  const { ui, byId } = await open();
  const email = byId('email');
  email.value = 'ada@example.com';
  fireEvent(email, 'input', { target: email });
  fireEvent(email, 'focusout', { target: email });
  const terms = byId('terms');
  terms.checked = true;
  fireEvent(terms, 'change', { target: terms });
  await ui.settle();
  assert.equal(ui.state().email.value, 'ada@example.com');
  assert.equal(ui.state().email.touched, true);
  assert.equal(ui.state().terms.value, true);
});
