// Parity with shadcn/ui, in two parts.
//
// 1. Against the upstream source. The real shadcn/ui component is quoted at the top of each file in ui/ (that is its
//    only copy here). These tests read it back and compare it with the conversion: the same variants, sizes and
//    defaults, the same exported components, the same element for every data-slot. If the quoted source is replaced by
//    a newer upstream version, a test fails where the conversion no longer matches.
// 2. Behaviour. shadcn/ui ships no component tests (its test suites cover the CLI and the registry), so these are ours:
//    what a React Testing Library test of each component would check (the element, its attributes, a click, typing,
//    the invalid state), run against the converted components on the headless DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from '@ehtb/agent-ui';
import { expandComponents } from '@ehtb/agent-ui/components';
import { createRoot, findElements, fireEvent } from '@ehtb/agent-ui/testing/dom-shim.mjs';
import { components } from './ui/index.js';

// The kit is a list of the functions defineElement made; the tests look components up by name.
const byName = Object.fromEntries(components.map((component) => [component.componentName, component.definition]));
import { textField, checkField } from './features.js';

const here = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------------- reading the quoted upstream source

// { componentFileName: sourceText } for every "Source: .../ui/<name>.tsx" block quoted in ui/<file>.js.
const upstreamSources = (file) => {
  const lines = readFileSync(join(here, 'ui', file), 'utf8').split('\n').filter((line) => line.startsWith('//'));
  const sources = {};
  let name = null;
  let reading = false;
  for (const line of lines) {
    const start = line.match(/^\/\/ Source: .*\/ui\/([\w-]+)\.tsx/);
    if (start) {
      name = start[1];
      sources[name] = [];
      reading = false;
    } else if (name && line === '// (end of the quoted source)') name = null;
    else if (name && !reading && line === '//') reading = true; // the blank line after the three-line banner
    else if (name && reading) sources[name].push(line === '//' ? '' : line.slice(5));
  }
  return Object.fromEntries(Object.entries(sources).map(([key, code]) => [key, code.join('\n')]));
};

// The keys of `variants: { <group>: { key: ..., "quoted-key": ... } }` in a cva call.
const variantKeys = (code, group) => {
  const start = code.indexOf(`${group}: {`, code.indexOf('variants:'));
  assert.ok(start > -1, `no "${group}" variants in the upstream source`);
  const lines = code.slice(start).split('\n').slice(1);
  const indent = lines[0].match(/^\s*/)[0];
  const keys = [];
  for (const line of lines) {
    if (line.startsWith('}') || (line.trimStart().startsWith('},') && line.match(/^\s*/)[0].length < indent.length)) break;
    const found = line.match(new RegExp(`^${indent}(?:"([^"]+)"|([A-Za-z_]\\w*)):`));
    if (found) keys.push(found[1] ?? found[2]);
  }
  return keys;
};
const defaultVariant = (code, group) => code.slice(code.indexOf('defaultVariants')).match(new RegExp(`${group}:\\s*"([^"]+)"`))?.[1];

// { 'card-title': 'div', ... }: the element each data-slot sits on in the upstream source.
const PRIMITIVE_TAGS = { 'LabelPrimitive.Root': 'label', 'CheckboxPrimitive.Root': 'button' };
const slotsOf = (code) => {
  const defaultTag = code.match(/const Comp = asChild \? Slot\.Root : "(\w+)"/)?.[1];
  const slots = {};
  for (const found of code.matchAll(/<([\w.]+)\s+data-slot="([\w-]+)"/g)) {
    const [, element, slot] = found;
    if (slot.endsWith('-indicator')) continue; // Radix renders the check mark inside its own button
    slots[slot] = element === 'Comp' ? defaultTag : PRIMITIVE_TAGS[element] ?? element;
  }
  return slots;
};
const exportsOf = (code) => [...code.match(/export \{([^}]*)\}/)[1].matchAll(/\w+/g)].map((match) => match[0]).filter((name) => /^[A-Z]/.test(name));
const camel = (kebab) => kebab.replace(/-(\w)/g, (_, letter) => letter.toUpperCase());

// Where the conversion deliberately differs from upstream, and why. A new difference must be added here.
const DIVERGENCES = {
  checkbox: { upstreamTag: 'button', tag: 'input', reason: 'a native checkbox input replaces the Radix button with role="checkbox"' },
};

const allUpstream = Object.assign({}, ...['button.js', 'badge.js', 'card.js', 'alert.js', 'label.js', 'input.js'].map(upstreamSources));

// ---------------------------------------------------------------------------------- part 1: against upstream source

test('every upstream file is quoted: button, badge, card, alert, label, input, checkbox', () => {
  assert.deepEqual(Object.keys(allUpstream).sort(), ['alert', 'badge', 'button', 'card', 'checkbox', 'input', 'label']);
  for (const [name, code] of Object.entries(allUpstream)) assert.match(code, /export \{/, `${name}: the quoted upstream source is cut off`);
});

test('every component upstream exports has a converted component with the same name', () => {
  for (const code of Object.values(allUpstream)) {
    for (const name of exportsOf(code)) {
      const converted = name[0].toLowerCase() + name.slice(1);
      assert.ok(converted in byName, `upstream exports ${name}; the kit has no "${converted}"`);
    }
  }
});

test('variants, sizes and their defaults are the upstream ones, in the upstream order', () => {
  for (const [file, groups] of Object.entries({ button: ['variant', 'size'], badge: ['variant'], alert: ['variant'] })) {
    for (const group of groups) {
      const upstream = variantKeys(allUpstream[file], group);
      const options = byName[file].params[group].options;
      assert.deepEqual(Object.keys(options), upstream, `${file} ${group}`);
      assert.equal(byName[file].params[group].default, defaultVariant(allUpstream[file], group), `${file} ${group} default`);
    }
  }
  assert.equal(variantKeys(allUpstream.button, 'size').length, 8, 'the upstream button has eight sizes');
});

test('every data-slot upstream puts on an element is on the converted component, on the same element', () => {
  const required = {
    input: { id: 'i', field: 'f', label: 'L' },
    checkbox: { id: 'c', field: 'f', label: 'L' },
    label: { for: 'x' },
  };
  let checked = 0;
  for (const code of Object.values(allUpstream)) {
    for (const [slot, upstreamTag] of Object.entries(slotsOf(code))) {
      const name = camel(slot);
      const divergence = DIVERGENCES[name];
      const element = expandComponents({ use: name, with: required[name] ?? {} }, components);
      assert.equal(element.props['data-slot'], slot, `${name}: data-slot`);
      if (divergence) {
        assert.equal(upstreamTag, divergence.upstreamTag, `${name}: upstream changed its element, review the divergence "${divergence.reason}"`);
        assert.equal(element.tag, divergence.tag, `${name}: ${divergence.reason}`);
      } else {
        assert.equal(element.tag, upstreamTag, `${name}: upstream renders a ${upstreamTag}`);
      }
      checked++;
    }
  }
  assert.equal(checked, 14, 'button, badge, 7 card parts, alert with 2 parts, label, input, checkbox');
});

test('upstream facts the conversion repeats: the alert role, the button type default, data-variant and data-size', () => {
  assert.match(allUpstream.alert, /role="alert"/);
  assert.equal(expandComponents({ use: 'alert' }, components).props.role, 'alert');
  assert.doesNotMatch(allUpstream.button, /type=/, 'upstream sets no default type, so the browser default applies');
  assert.equal('type' in expandComponents({ use: 'button' }, components).props, false);
  assert.match(allUpstream.button, /data-variant=\{variant\}/);
  assert.match(allUpstream.button, /data-size=\{size\}/);
  assert.deepEqual(
    [expandComponents({ use: 'button' }, components).props['data-variant'], expandComponents({ use: 'button' }, components).props['data-size']],
    ['default', 'default'],
  );
  assert.match(allUpstream.badge, /data-variant=\{variant\}/);
});

test('what the conversion leaves out is exactly what upstream has beyond a plain element: asChild and ...props', () => {
  const withAsChild = Object.entries(allUpstream).filter(([, code]) => code.includes('asChild')).map(([name]) => name);
  assert.deepEqual(withAsChild.sort(), ['badge', 'button']);
  for (const name of withAsChild) {
    assert.throws(() => expandComponents({ use: name, with: { asChild: true } }, components), /has no param asChild/);
  }
  assert.throws(() => expandComponents({ use: 'button', with: { 'data-x': 'y' } }, components), /has no param data-x/);
});

// ---------------------------------------------------------------------------------- part 2: behaviour

// `fields` are namespaces by name: mount({ email: textField(...) }, { spec }); `button` holds the click counter.
const mount = (fields, extra = {}) => {
  const root = createRoot();
  const namespaces = { button: { state: { clicks: 0 }, actions: { click: { args: {}, run: (store) => store.set('clicks', store.get('clicks') + 1) } } }, ...fields };
  const ui = app({ namespaces, spec: expandComponents(extra.spec, components), root, dev: true });
  const byId = (id) => findElements(root, (element) => element.attributes['data-id'] === id)[0];
  const bySlot = (slot) => findElements(root, (element) => element.attributes['data-slot'] === slot);
  return { ui, root, byId, bySlot };
};
const outlineText = (ui, id) => {
  const find = (nodes) => nodes.map((node) => (node.id === id ? node : find(node.children ?? []))).find(Boolean);
  return find(ui.outline())?.text;
};

test('Button: a button element with its text, variant and size; a click reaches the action; no type unless given', async () => {
  const { ui, byId } = mount({}, { spec: { tag: 'main', children: [
    { use: 'button', with: { id: 'plain', onClick: ['button.click', {}] }, children: 'Save' },
    { use: 'button', with: { id: 'submit', variant: 'destructive', size: 'lg', type: 'submit', class: 'wide' }, children: 'Delete' },
    { use: 'button', with: { id: 'icon', size: 'icon', variant: 'ghost', label: 'Add item' }, children: '+' },
    { use: 'button', with: { id: 'off', disabled: true }, children: 'Off' },
  ] } });
  await ui.settle();
  assert.equal(byId('plain').localName, 'button');
  assert.equal(outlineText(ui, 'plain'), 'Save');
  assert.equal(byId('plain').attributes.type, undefined);
  assert.equal(byId('submit').attributes.type, 'submit');
  assert.equal(byId('submit').attributes['data-variant'], 'destructive');
  assert.equal(byId('submit').attributes['data-size'], 'lg');
  assert.match(byId('submit').attributes.class, /ui-button--destructive.*ui-button--lg.*wide/);
  assert.equal(byId('icon').attributes['aria-label'], 'Add item');
  assert.equal(byId('off').disabled, true);
  fireEvent(byId('plain'), 'click');
  fireEvent(byId('plain'), 'click');
  assert.equal(ui.state().button.clicks, 2);
});

test('Badge: a span carrying its variant', async () => {
  const { ui, byId } = mount({}, { spec: { tag: 'main', children: [{ use: 'badge', with: { id: 'b', variant: 'secondary' }, children: 'New' }, { use: 'badge', with: { id: 'd' }, children: 'Default' }] } });
  await ui.settle();
  assert.equal(byId('b').localName, 'span');
  assert.equal(byId('b').attributes['data-variant'], 'secondary');
  assert.equal(byId('d').attributes['data-variant'], 'default');
  assert.equal(outlineText(ui, 'b'), 'New');
});

test('Card: the parts nest in the order they are written, each with its data-slot', async () => {
  const { ui, bySlot } = mount({}, { spec: { tag: 'main', children: { use: 'card', with: { id: 'c' }, children: [
    { use: 'cardHeader', children: [{ use: 'cardTitle', with: { id: 't' }, children: 'Title' }, { use: 'cardDescription', children: 'About' }, { use: 'cardAction', children: 'Edit' }] },
    { use: 'cardContent', children: 'Body' },
    { use: 'cardFooter', children: 'Foot' },
  ] } } });
  await ui.settle();
  const order = [];
  const walk = (nodes) => nodes.forEach((node) => { order.push(node.id); walk(node.children ?? []); });
  walk(ui.outline());
  assert.equal(outlineText(ui, 't'), 'Title');
  for (const slot of ['card', 'card-header', 'card-title', 'card-description', 'card-action', 'card-content', 'card-footer']) assert.equal(bySlot(slot).length, 1, slot);
  assert.equal(bySlot('card')[0].childNodes.length, 3);
  assert.equal(bySlot('card-header')[0].childNodes.length, 3);
});

test('Alert: role alert, the variant class, title and description parts', async () => {
  const { ui, byId, bySlot } = mount({}, { spec: { tag: 'main', children: [
    { use: 'alert', with: { id: 'a', variant: 'destructive' }, children: [{ use: 'alertTitle', with: { id: 'at' }, children: 'Oops' }, { use: 'alertDescription', children: 'Try again' }] },
    { use: 'alert', with: { id: 'n' }, children: 'Plain' },
  ] } });
  await ui.settle();
  assert.equal(byId('a').attributes.role, 'alert');
  assert.match(byId('a').attributes.class, /ui-alert--destructive/);
  assert.match(byId('n').attributes.class, /ui-alert--default/);
  assert.equal(outlineText(ui, 'at'), 'Oops');
  assert.equal(bySlot('alert-description').length, 1);
});

test('Label: a label element whose `for` names the input it labels', async () => {
  const { ui, byId } = mount({ name: textField() }, { spec: { tag: 'main', children: [
    { use: 'label', with: { id: 'l', for: 'name' }, children: 'Name' },
    { use: 'input', with: { id: 'name', field: 'name', label: 'Name' } },
  ] } });
  await ui.settle();
  assert.equal(byId('l').localName, 'label');
  assert.equal(byId('l').attributes.for, byId('name').attributes['data-id']);
  assert.equal(outlineText(ui, 'l'), 'Name');
});

test('Input: the type and placeholder are passed through, typing writes the state, the invalid flag follows touch and error', async () => {
  const { ui, byId } = mount({ email: textField({ validate: (value) => (value.includes('@') ? '' : 'Needs an @') }) }, { spec: { tag: 'main', children: [
    { use: 'input', with: { id: 'email', field: 'email', label: 'Email', type: 'email', placeholder: 'you@example.com' } },
    { use: 'input', with: { id: 'off', field: 'email', label: 'Other', disabled: true } },
  ] } });
  await ui.settle();
  const email = byId('email');
  assert.equal(email.localName, 'input');
  assert.equal(email.attributes.type, 'email');
  assert.equal(email.attributes.placeholder, 'you@example.com');
  assert.equal(byId('off').attributes.type, 'text');
  assert.equal(byId('off').disabled, true);
  assert.equal(email.attributes['aria-invalid'], 'false');
  email.value = 'nope';
  fireEvent(email, 'input', { target: email });
  await ui.settle();
  assert.equal(ui.state().email.value, 'nope');
  assert.equal(email.attributes['aria-invalid'], 'false', 'not invalid until the field was left');
  fireEvent(email, 'focusout', { target: email });
  await ui.settle();
  assert.equal(email.attributes['aria-invalid'], 'true');
  email.value = 'a@b.c';
  fireEvent(email, 'input', { target: email });
  await ui.settle();
  assert.equal(email.attributes['aria-invalid'], 'false');
});

test('Checkbox: a checkbox input with data-state, toggled by a change event, invalid once left while required and unchecked', async () => {
  const { ui, byId } = mount({ terms: checkField({ required: 'Accept' }) }, { spec: { tag: 'main', children: [{ use: 'checkbox', with: { id: 'terms', field: 'terms', label: 'Terms' } }] } });
  await ui.settle();
  const box = byId('terms');
  assert.equal(box.attributes.type, 'checkbox');
  assert.equal(box.attributes['data-state'], 'unchecked');
  assert.equal(box.checked, false);
  fireEvent(box, 'focusout', { target: box });
  await ui.settle();
  assert.equal(box.attributes['aria-invalid'], 'true');
  box.checked = true;
  fireEvent(box, 'change', { target: box });
  await ui.settle();
  assert.equal(ui.state().terms.value, true);
  assert.equal(box.attributes['data-state'], 'checked');
  assert.equal(box.attributes['aria-invalid'], 'false');
});
