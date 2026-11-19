// The grammar and runtime features added beyond the basics: operators, otherwise, nested lists, key chords, handler
// options, element order rules, URL guard, derived equality, outline, replaying flag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fireEvent, findElements, mutations, ShimElement } from './support/dom-shim.mjs';
import { DomElement } from '../src/server-dom.js';
import { mountSpec, outlineById } from './support/helpers.mjs';

const { grammar, validate } = await import('../src/ui.js');
const { button, circle, div, each, g, path, state, svg, use, when } = await import('../src/spec.js');
const elements = await import('../src/spec.js'); // every builder, for the SVG tests: elements.text(...), elements.linearGradient(...)

const textOf = (ui, id) => outlineById(ui.outline(), id)?.text;
const spanWith = (id, binding) => ({ tag: 'span', id, children: binding });

test('operators: and, or, greaterThan, lessThan, equals, not, length, join', async () => {
  const { ui } = mountSpec({
    namespaces: {
      box: {
        state: { three: 3, five: 5, yes: true, no: false, word: 'abc', list: [1, 2], missing: null },
      },
    },
    spec: {
      tag: 'div',
      children: [
        spanWith('and-true', { and: [{ state: 'box.yes' }, { greaterThan: [{ state: 'box.five' }, { state: 'box.three' }] }] }),
        spanWith('and-false', { and: [{ state: 'box.yes' }, { state: 'box.no' }, { state: 'box.yes' }] }),
        spanWith('or-true', { or: [{ state: 'box.no' }, { lessThan: [{ state: 'box.three' }, 4] }] }),
        spanWith('or-false', { or: [{ state: 'box.no' }, { state: 'box.missing' }] }),
        spanWith('equals', { equals: [{ state: 'box.word' }, 'abc'] }),
        spanWith('not', { not: { state: 'box.no' } }),
        spanWith('length-list', { length: { state: 'box.list' } }),
        spanWith('length-text', { length: { state: 'box.word' } }),
        spanWith('length-missing', { length: { state: 'box.missing' } }),
        spanWith('join', { join: [{ state: 'box.word' }, ' has ', { length: { state: 'box.word' } }, ' letters, ', { state: 'box.missing' }, 'end'] }),
      ],
    },
  });
  const expected = {
    'and-true': 'true', 'and-false': 'false', 'or-true': 'true', 'or-false': 'false', equals: 'true', not: 'true',
    'length-list': '2', 'length-text': '3', 'length-missing': '0', join: 'abc has 3 letters, end',
  };
  for (const [id, text] of Object.entries(expected)) assert.equal(textOf(ui, id), text, id);
});

test('when/otherwise: only the active branch exists and it swaps when truthiness flips', async () => {
  const { ui, root } = mountSpec({
    namespaces: {
      box: {
        state: { open: true },
        actions: { openToggle: { args: {}, run: (store) => store.set('open', !store.get('open')) } },
      },
    },
    spec: {
      tag: 'div',
      children: [
        { tag: 'button', id: 'toggle', on: { click: ['box.openToggle'] }, children: 'toggle' },
        { when: { state: 'box.open' }, children: { tag: 'p', id: 'yes', children: 'open' }, otherwise: { tag: 'p', id: 'no', children: 'closed' } },
      ],
    },
  });
  const ids = () => findElements(root, (element) => ['yes', 'no'].includes(element.attributes['data-id'])).map((element) => element.attributes['data-id']);
  assert.deepEqual(ids(), ['yes']);
  ui.dispatch('box.openToggle');
  await ui.settle();
  assert.deepEqual(ids(), ['no']);
  ui.dispatch('box.openToggle');
  await ui.settle();
  assert.deepEqual(ids(), ['yes']);
});

test('nested each over a row field, lists of strings with key ".", and {item: "."}', async () => {
  const { ui } = mountSpec({
    namespaces: {
      box: {
        state: { groups: [{ id: 1, name: 'fruit', items: ['apple', 'pear'] }, { id: 2, name: 'empty', items: [] }] },
        actions: { groupAdd: { args: { id: 'number', item: 'string' }, run: (store, { id, item }) =>
          store.set('groups', store.get('groups').map((group) => (group.id === id ? { ...group, items: [...group.items, item] } : group))) } },
      },
    },
    spec: {
      tag: 'ul',
      id: 'groups',
      children: {
        each: 'box.groups',
        key: 'id',
        template: {
          tag: 'li',
          children: [
            { tag: 'b', children: { item: 'name' } },
            { tag: 'ul', children: { each: { item: 'items' }, key: '.', template: { tag: 'li', props: { class: 'item' }, children: { item: '.' } } } },
          ],
        },
      },
    },
  });
  const itemTexts = () => findOutlineTexts(ui.outline(), 'item');
  assert.deepEqual(itemTexts(), ['apple', 'pear']);
  ui.dispatch('box.groupAdd', { id: 2, item: 'fig' });
  await ui.settle();
  assert.deepEqual(itemTexts(), ['apple', 'pear', 'fig']);
  assert.equal(ui.errors.length, 0);
});

const findOutlineTexts = (nodes, className, found = []) => {
  for (const node of nodes) {
    if (node.classes?.includes(className)) found.push(node.text);
    if (node.children) findOutlineTexts(node.children, className, found);
  }
  return found;
};

test('items without a usable key are reported, not rendered', async () => {
  const { ui } = mountSpec({
    namespaces: {
      box: {
        state: { rows: [{ id: 1 }, { name: 'no id' }, { id: 1 }] },
      },
    },
    spec: { tag: 'ul', children: { each: 'box.rows', key: 'id', template: { tag: 'li', children: 'row' } } },
  });
  assert.ok(ui.errors.some((message) => /item without usable key "id"/.test(message)));
  assert.ok(ui.errors.some((message) => /duplicate key 1/.test(message)));
});

test('key chords: modifiers in fixed order, exact chord wins over the plain event, plain Enter ignores Shift', async () => {
  const { ui, root } = mountSpec({
    namespaces: {
      box: {
        state: { hits: [] },
        actions: { hit: { args: { name: 'string' }, run: (store, { name }) => store.set('hits', [...store.get('hits'), name]) } },
      },
    },
    spec: {
      tag: 'input',
      id: 'field',
      props: { 'aria-label': 'field' },
      on: {
        'keydown.Enter': ['box.hit', { name: 'enter' }],
        'keydown.Shift+Enter': ['box.hit', { name: 'shift-enter' }],
        'keydown.Control+Shift+k': ['box.hit', { name: 'ctrl-shift-k' }],
        keydown: ['box.hit', { name: 'any-keydown' }],
        'keyup.Escape': ['box.hit', { name: 'escape-up' }],
      },
    },
  });
  const field = root.firstChild;
  const press = (type, properties) => fireEvent(field, type, properties);
  press('keydown', { key: 'Enter' });
  press('keydown', { key: 'Enter', shiftKey: true });
  press('keydown', { key: 'k', ctrlKey: true, shiftKey: true });
  press('keydown', { key: 'k', ctrlKey: true }); // chord not registered: falls back to the plain keydown handler
  press('keyup', { key: 'Escape' });
  assert.deepEqual(ui.state().box.hits, ['enter', 'shift-enter', 'ctrl-shift-k', 'any-keydown', 'escape-up']);
});

test('handler options: submit is prevented by default, preventDefault/stopPropagation are opt-in, opt-out works', async () => {
  const { ui, root } = mountSpec({
    namespaces: {
      box: {
        state: { count: 0 },
        actions: { bump: { args: {}, run: (store) => store.set('count', store.get('count') + 1) } },
      },
    },
    spec: {
      tag: 'form',
      id: 'form',
      on: { submit: ['box.bump'] },
      children: [
        { tag: 'button', id: 'prevent', props: { type: 'button' }, on: { click: ['box.bump', {}, { preventDefault: true, stopPropagation: true }] }, children: 'x' },
        { tag: 'button', id: 'plain', props: { type: 'button' }, on: { click: ['box.bump'] }, children: 'y' },
      ],
    },
  });
  const calls = [];
  const spy = (name) => ({ preventDefault: () => calls.push(`${name}:prevent`), stopPropagation: () => calls.push(`${name}:stop`) });
  const form = root.firstChild;
  fireEvent(form, 'submit', spy('submit'));
  fireEvent(findElements(root, (element) => element.attributes['data-id'] === 'prevent')[0], 'click', spy('prevent'));
  fireEvent(findElements(root, (element) => element.attributes['data-id'] === 'plain')[0], 'click', spy('plain'));
  assert.deepEqual(calls, ['submit:prevent', 'prevent:prevent', 'prevent:stop']);
  assert.equal(ui.state().box.count, 3);
});

test('focusin events are delegated too', async () => {
  const { ui, root } = mountSpec({
    namespaces: {
      box: {
        state: { focused: 0 },
        actions: { focus: { args: {}, run: (store) => store.set('focused', store.get('focused') + 1) } },
      },
    },
    spec: { tag: 'input', props: { 'aria-label': 'x' }, on: { focusin: ['box.focus'] } },
  });
  fireEvent(root.firstChild, 'focusin');
  assert.equal(ui.state().box.focused, 1);
});

test('pointer events are delegated, and {event} reads the pointer event', async () => {
  const { ui, root } = mountSpec({
    namespaces: {
      box: {
        state: { downs: 0, over: 0, pointerType: '' },
        actions: {
          down: {
            args: { pointerType: 'string' },
            run: (store, { pointerType }) => {
              store.set('downs', store.get('downs') + 1);
              store.set('pointerType', pointerType);
            },
          },
          over: { args: {}, run: (store) => store.set('over', store.get('over') + 1) },
        },
      },
    },
    spec: {
      tag: 'div',
      props: { 'aria-label': 'box' },
      on: { pointerdown: ['box.down', { pointerType: { event: 'pointerType' } }], pointerover: ['box.over'] },
      children: { tag: 'span', props: { 'data-id': 'inner' }, children: 'inner' },
    },
  });
  fireEvent(root.firstChild.firstChild, 'pointerdown', { pointerType: 'touch' });
  fireEvent(root.firstChild.firstChild, 'pointerover');
  assert.equal(ui.state().box.downs, 1);
  assert.equal(ui.state().box.pointerType, 'touch');
  assert.equal(ui.state().box.over, 1);
});

test('a select receives its value after its options exist (props: type first, select value last)', async () => {
  const valueWrites = [];
  const original = Object.getOwnPropertyDescriptor(DomElement.prototype, 'value');
  Object.defineProperty(DomElement.prototype, 'value', {
    get: original.get,
    set(next) {
      if (this.localName === 'select') valueWrites.push({ value: next, optionsPresent: this.childNodes.length });
      original.set.call(this, next);
    },
  });
  try {
    mountSpec({
      namespaces: {
        box: {
          state: { choice: 'b', options: [{ value: 'a' }, { value: 'b' }] },
        },
      },
      spec: {
        tag: 'select',
        props: { value: { state: 'box.choice' }, 'aria-label': 'choice' },
        children: { each: 'box.options', key: 'value', template: { tag: 'option', props: { value: { item: 'value' } }, children: { item: 'value' } } },
      },
    });
  } finally {
    Object.defineProperty(DomElement.prototype, 'value', original);
  }
  assert.deepEqual(valueWrites, [{ value: 'b', optionsPresent: 3 }]); // two options plus the each end marker
});

test('input type is applied before value even when the spec lists value first', async () => {
  const order = [];
  const originalSetAttribute = ShimElement.prototype.setAttribute;
  ShimElement.prototype.setAttribute = function (name, value) {
    if (this.localName === 'input' && name !== 'data-id') order.push(name);
    return originalSetAttribute.call(this, name, value);
  };
  try {
    mountSpec({
      namespaces: {
        box: {
          state: { v: 'x' },
        },
      },
      spec: { tag: 'input', props: { placeholder: 'p', 'aria-label': 'a', type: 'text', value: { state: 'box.v' } } },
    });
  } finally {
    ShimElement.prototype.setAttribute = originalSetAttribute;
  }
  assert.equal(order[0], 'type');
});

test('unsafe URLs are blocked at runtime (bound values) and at validation (literals); data: only allowed for src', async () => {
  const { ui, root } = mountSpec({
    namespaces: {
      box: {
        state: { url: '/ok' },
        actions: { urlSet: { args: { value: 'string' }, run: (store, { value }) => store.set('url', value) } },
      },
    },
    spec: { tag: 'a', props: { href: { state: 'box.url' } }, children: 'link' },
  });
  const link = root.firstChild;
  assert.equal(link.getAttribute('href'), '/ok');
  ui.dispatch('box.urlSet', { value: ' JaVaScRiPt:alert(1)' });
  await ui.settle();
  assert.equal(link.getAttribute('href'), null);
  assert.ok(ui.errors.some((message) => /blocked unsafe URL in href/.test(message)));
  ui.dispatch('box.urlSet', { value: 'data:text/html,<script>' });
  await ui.settle();
  assert.equal(link.getAttribute('href'), null);

  const context = { namespaces: {} };
  assert.match(validate({ tag: 'a', props: { href: 'javascript:alert(1)' }, children: 'x' }, context)[0], /unsafe URL/);
  assert.deepEqual(validate({ tag: 'img', props: { src: 'data:image/png;base64,AAAA', alt: '' } }, context), []);
});

test('derived values that are structurally equal keep their reference, so watchers do not re-run', async () => {
  const { ui } = mountSpec({
    namespaces: {
      box: {
        state: { count: 1 },
        derive: { flags: (get) => [{ positive: get('count') > 0, big: get('count') > 100 }] },
        actions: { countSet: { args: { value: 'number' }, run: (store, { value }) => store.set('count', value) } },
      },
    },
    spec: { tag: 'p', children: { state: 'box.count' } },
  });
  let runs = 0;
  ui.watch(['box.flags'], () => runs++);
  assert.equal(runs, 1);
  ui.dispatch('box.countSet', { value: 2 }); // flags recomputed, but equal to before
  await ui.settle();
  assert.equal(runs, 1);
  ui.dispatch('box.countSet', { value: 500 }); // really changed
  await ui.settle();
  assert.equal(runs, 2);
});

test('outline(): rendered structure as JSON with ids, row keys, own text, classes and input values', async () => {
  const { ui } = mountSpec({
    namespaces: {
      box: {
        state: { rows: [{ id: 'a', done: true }, { id: 'b', done: false }], draft: 'hello' },
      },
    },
    spec: {
      tag: 'main',
      id: 'app',
      children: [
        { tag: 'input', id: 'draft', props: { 'aria-label': 'draft', value: { state: 'box.draft' } } },
        { tag: 'input', id: 'check', props: { type: 'checkbox', 'aria-label': 'c', checked: true } },
        { tag: 'ul', children: { each: 'box.rows', key: 'id', template: { tag: 'li', classes: { done: { item: 'done' } }, children: ['row ', { item: 'id' }] } } },
      ],
    },
  });
  const [app] = ui.outline();
  assert.equal(app.id, 'app');
  assert.deepEqual(outlineById([app], 'draft'), { id: 'draft', tag: 'input', value: 'hello' });
  assert.deepEqual(outlineById([app], 'check'), { id: 'check', tag: 'input', checked: true });
  const list = app.children.find((node) => node.tag === 'ul');
  assert.deepEqual(list.children.map(({ key, text, classes }) => ({ key, text, classes })), [
    { key: 'a', text: 'row a', classes: ['done'] },
    { key: 'b', text: 'row b', classes: undefined },
  ]);
});

test('replaying is true during replay() so plugins stay quiet, and json arguments accept any JSON value', async () => {
  const { ui } = mountSpec({
    namespaces: {
      box: {
        state: { payload: null },
        actions: { payloadSet: { args: { data: 'json' }, run: (store, { data }) => store.set('payload', data) } },
      },
    },
    spec: { tag: 'p', children: 'x' },
  });
  const seen = [];
  ui.watch(['box.payload'], () => seen.push(ui.replaying));
  ui.dispatch('box.payloadSet', { data: { nested: [1, 2, { ok: true }] } });
  ui.dispatch('box.payloadSet', { data: null });
  ui.dispatch('box.payloadSet', { data: [] });
  await ui.settle();
  assert.equal(ui.dispatch('box.payloadSet', {}), 'box.payloadSet.data: want json, got undefined');
  ui.errors.length = 0;
  seen.length = 0;
  await ui.replay();
  assert.ok(seen.length > 0 && seen.every((flag) => flag === true));
  assert.equal(ui.replaying, false);
});

test('grammar export is the single source of truth: frozen, includes the new tags and events', () => {
  assert.ok(Object.isFrozen(grammar));
  for (const tag of ['img', 'table', 'tr', 'td', 'pre', 'dialog', 'details']) assert.ok(grammar.tags.includes(tag), tag);
  assert.deepEqual(grammar.events, ['click', 'dblclick', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerover', 'pointerout', 'input', 'change', 'keydown', 'keyup', 'focusin', 'focusout', 'submit']);
  assert.deepEqual(grammar.keyModifiers, ['Control', 'Alt', 'Shift', 'Meta']);
  assert.ok(grammar.bindingKeys.includes('join') && grammar.argumentTypes.includes('json'));
  assert.deepEqual(grammar.nodeKeys.when, ['when', 'children', 'otherwise']);
});

test('effect cleanup: bindings inside a closed `when` branch and inside removed rows stop updating', async () => {
  const { ui } = mountSpec({
    namespaces: {
      box: {
        state: { open: true, label: 'one', rows: [{ id: 1 }] },
        actions: {
          openSet: { args: { value: 'boolean' }, run: (store, { value }) => store.set('open', value) },
          labelSet: { args: { value: 'string' }, run: (store, { value }) => store.set('label', value) },
          rowsClear: { args: {}, run: (store) => store.set('rows', []) },
        },
      },
    },
    spec: {
      tag: 'div',
      children: [
        { when: { state: 'box.open' }, children: { tag: 'p', children: { state: 'box.label' } } },
        { tag: 'ul', children: { each: 'box.rows', key: 'id', template: { tag: 'li', children: { state: 'box.label' } } } },
      ],
    },
  });
  ui.dispatch('box.openSet', { value: false });
  ui.dispatch('box.rowsClear');
  await ui.settle();
  mutations.count = 0;
  ui.dispatch('box.labelSet', { value: 'two' }); // would write into the detached text nodes if their effects were alive
  await ui.settle();
  assert.equal(mutations.count, 0);
});

test('a when or each that is a direct child of a when branch is removed completely and stops updating', async () => {
  const { ui, root } = mountSpec({
    namespaces: {
      box: {
        state: { view: 'a', items: [{ id: 1, label: 'one' }], note: 'x' },
        actions: {
          viewSet: { args: { value: 'string' }, run: (store, { value }) => store.set('view', value) },
          itemsAdd: { args: {}, run: (store) => store.set('items', [...store.get('items'), { id: store.get('items').length + 1, label: 'more' }]) },
          noteSet: { args: { value: 'string' }, run: (store, { value }) => store.set('note', value) },
        },
      },
    },
    spec: {
      tag: 'main',
      id: 'm',
      children: {
        when: { equals: [{ state: 'box.view' }, 'a'] },
        children: { tag: 'p', id: 'a', children: 'view a' },
        // otherwise holds another when, which holds an each: control nodes nested directly in branches
        otherwise: {
          when: { equals: [{ state: 'box.view' }, 'b'] },
          children: [{ tag: 'p', id: 'b', children: { state: 'box.note' } }, { each: 'box.items', key: 'id', template: { tag: 'li', children: { item: 'label' } } }],
          otherwise: { tag: 'p', id: 'c', children: 'view c' },
        },
      },
    },
  });
  const ids = () => findElements(root, (element) => element.attributes['data-id']).map((element) => element.attributes['data-id']);
  assert.deepEqual(ids(), ['m', 'a']);
  ui.dispatch('box.viewSet', { value: 'b' });
  await ui.settle();
  assert.ok(ids().includes('b') && !ids().includes('a'));
  assert.equal(findElements(root, (element) => element.localName === 'li').length, 1);
  ui.dispatch('box.itemsAdd');
  await ui.settle();
  assert.equal(findElements(root, (element) => element.localName === 'li').length, 2); // rows added after mount
  ui.dispatch('box.viewSet', { value: 'c' });
  await ui.settle();
  assert.deepEqual(ids(), ['m', 'c']); // nothing left from b: not the paragraph, not the rows added later
  // The removed branch no longer updates: no DOM writes for state it used to show.
  const before = mutations.count;
  ui.dispatch('box.noteSet', { value: 'changed' });
  ui.dispatch('box.itemsAdd');
  await ui.settle();
  assert.equal(mutations.count, before);
  ui.dispatch('box.viewSet', { value: 'b' });
  await ui.settle();
  assert.equal(findElements(root, (element) => element.localName === 'li').length, 3);
  assert.equal(ui.errors.length, 0);
});

// ---------------------------------------------------------------------------------------------------- SVG

test('svg: drawn in the SVG namespace, rendered on the server, its shapes and attributes in place; a sprite reference gets the base path', async () => {
  const { app } = await import('../src/ui.js');
  const { createRoot, findElements } = await import('./support/dom-shim.mjs');
  const { createServerDocument, serialize } = await import('../src/server-dom.js');
  const spec = button(
    { id: 'save', 'aria-label': 'Save' },
    svg({ id: 'icon', viewBox: '0 0 24 24', 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }, path({ d: 'M5 12l5 5L20 7' }), circle({ cx: 12, cy: 12, r: state('icon.radius') }), use({ href: '/icons.svg#check' })),
  );
  const namespaces = { icon: { state: { radius: 9 }, actions: { grow: { args: {}, run: (store) => store.set('radius', 10) } } } };
  const created = [];
  const document = globalThis.document;
  const createElementNS = document.createElementNS;
  document.createElementNS = (namespace, tag) => (created.push([namespace, tag]), createElementNS(namespace, tag));
  try {
    const root = createRoot();
    const ui = app({ namespaces, spec, root, dev: true, basePath: '/shop' });
    assert.deepEqual(created, [['http://www.w3.org/2000/svg', 'svg'], ['http://www.w3.org/2000/svg', 'path'], ['http://www.w3.org/2000/svg', 'circle'], ['http://www.w3.org/2000/svg', 'use']]);
    const circleElement = findElements(root, (element) => element.localName === 'circle')[0];
    assert.equal(String(circleElement.getAttribute('r')), '9');
    ui.dispatch('icon.grow');
    await ui.settle();
    assert.equal(String(circleElement.getAttribute('r')), '10');
    assert.equal(findElements(root, (element) => element.localName === 'use')[0].getAttribute('href'), '/shop/icons.svg#check');
  } finally {
    document.createElementNS = createElementNS;
  }
  const server = createServerDocument();
  const serverRoot = server.createElement('div');
  const ui = app({ namespaces, spec, root: serverRoot, dev: false });
  assert.match(serialize(serverRoot), /<svg data-id="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path data-id="0\.0\.0" d="M5 12l5 5L20 7"><\/path><circle data-id="0\.0\.1" cx="12" cy="12" r="9"><\/circle>/);
  ui.destroy();
});

test('svg rules: SVG tags only inside an svg, no HTML inside one, a label or aria-hidden, svg attributes on svg tags', () => {
  const problems = (spec) => validate(spec, {});
  assert.deepEqual(problems(svg({ viewBox: '0 0 24 24', role: 'img', 'aria-label': 'Done' }, g(null, path({ d: 'M0 0' })))), []);
  assert.deepEqual(problems({ tag: 'div', children: { tag: 'path', props: { d: 'M0 0' } } }), ["$.0: path is drawn inside an svg. Put it in svg({ viewBox: '0 0 24 24', 'aria-hidden': 'true' }, ...)"]);
  assert.deepEqual(problems({ tag: 'svg', props: { 'aria-hidden': 'true' }, children: [{ tag: 'span', children: 'x' }] }), ['$.0: an svg holds SVG tags (grammar.svgTags), not span. Put the span next to the svg, or inside a foreignObject']);
  assert.deepEqual(problems({ tag: 'svg', children: { tag: 'path', props: { d: 'M0 0' } } }), ["$: svg needs aria-label with role: 'img' (a drawing that says something) or 'aria-hidden': 'true' (a decorative icon next to text that says it)"]);
  assert.deepEqual(problems({ tag: 'svg', props: { 'aria-label': 'Done' } }), ["$: svg has aria-label but not role: 'img'. Write role: 'img' with the label, so assistive technology reads the drawing as one image with that name"]);
  assert.deepEqual(problems({ tag: 'div', props: { fill: 'red' }, children: 'x' }), ['$.props.fill: fill is an attribute of an svg drawing, and this is a div. Put it on the svg or one of its shapes, or style the div with CSS']);
  assert.deepEqual(problems({ tag: 'svg', props: { 'aria-hidden': 'true' }, children: { tag: 'path', props: { d: 'M0 0' }, children: 'x' } }), ['$.0.0: text inside <path>, which holds no text. Put the text in text, tspan, textPath, title or desc, or next to the svg']);
  assert.deepEqual(problems({ tag: 'svg', props: { 'aria-hidden': 'true' }, children: 'x' }), ['$.0: text inside <svg>, which holds no text. Put the text in text, tspan, textPath, title or desc, or next to the svg']);
  assert.match(problems({ tag: 'svg', props: { 'aria-hidden': 'true', viewbox: '0 0 1 1' } })[0], /unknown attribute "viewbox"\. Did you mean "viewBox"\?/);
  assert.throws(() => div({ fill: 'red' }, 'x'), /div\(\.\.\.\): fill is an attribute of an svg drawing, and this is a div\. Put it on the svg or one of its shapes, or style the div with CSS/);
});

// What the grammar lets each SVG element hold: text in the text elements, the standard's own content model for the rest.
const chart = (...children) => svg({ viewBox: '0 0 100 50', role: 'img', 'aria-label': 'Chart' }, ...children);

test('svg text: text, tspan, textPath, title and desc hold text (a string or a binding); nothing else in an svg does', () => {
  const problems = (spec) => validate(spec, { namespaces: { chart: { state: { label: 'Sales' } } } });
  const svgs = elements;
  assert.deepEqual(problems(chart(svgs.title(null, 'Sales'), svgs.desc(null, 'Sales by month'), svgs.text({ x: 5, y: 10, 'text-anchor': 'middle', 'font-size': 4 }, state('chart.label'), svgs.tspan({ dy: 1, 'font-weight': 'bold' }, ' total')), svgs.defs(null, svgs.path({ id: 'curve', d: 'M0 0' })), svgs.text(null, svgs.textPath({ href: '#curve', startOffset: '10%' }, 'along'), svgs.a({ href: '/more' }, svgs.tspan(null, 'link'))))), []);
  assert.deepEqual(problems(chart(g(null, 'x'))), ['$.0.0: text inside <g>, which holds no text. Put the text in text, tspan, textPath, title or desc, or next to the svg']);
  assert.deepEqual(problems(chart(svgs.text(null, svgs.rect({ width: 1, height: 1 })))), ['$.0.0: text holds only tspan, textPath, a, title, desc, animate, animateTransform, set and animateMotion, not rect. Put the rect in a g, a defs or the svg']);
  assert.deepEqual(problems(chart(svgs.title(null, svgs.tspan(null, 'x')))), ['$.0.0: tspan stands inside text, tspan, textPath or a, not inside title. Move it there']);
});

test('svg: an animation along a path may be in text, and an HTML element in an svg is one problem, not one for everything it holds', () => {
  const problems = (spec) => validate(spec, {});
  assert.deepEqual(problems(chart(elements.text(null, elements.tspan(null, 'x'), elements.animateMotion({ dur: '2s' })))), []);
  assert.deepEqual(problems(chart(div(null, path({ d: 'M0 0' }), 'text'))), ['$.0: an svg holds SVG tags (grammar.svgTags), not div. Put the div next to the svg, or inside a foreignObject']);
});

test('svg content model: a stop in a gradient, a filter primitive in a filter, a title in a shape; and where each tag may not stand', () => {
  const problems = (spec) => validate(spec, {});
  const element = elements;
  const fine = chart(
    element.defs(null,
      element.linearGradient({ id: 'fade', x1: 0, y1: 0, x2: 0, y2: 1, gradientUnits: 'objectBoundingBox' }, element.stop({ offset: '0%', 'stop-color': 'red' }), element.stop({ offset: '100%', 'stop-opacity': 0 })),
      element.radialGradient({ id: 'glow', fx: '50%' }, element.stop({ offset: 0 })),
      element.pattern({ id: 'dots', width: 4, height: 4, patternUnits: 'userSpaceOnUse' }, element.circle({ cx: 1, cy: 1, r: 1 })),
      element.clipPath({ id: 'clip', clipPathUnits: 'userSpaceOnUse' }, element.rect({ width: 10, height: 10 })),
      element.mask({ id: 'veil' }, element.rect({ width: 10, height: 10, fill: 'white' })),
      element.marker({ id: 'arrow', markerWidth: 4, markerHeight: 4, refX: 2, refY: 2, orient: 'auto' }, element.path({ d: 'M0 0L4 2L0 4z' })),
      element.symbol({ id: 'star', viewBox: '0 0 10 10' }, element.path({ d: 'M5 0L6 4H10L7 6L8 10L5 8L2 10L3 6L0 4H4z' })),
      element.filter({ id: 'soft', filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse' },
        element.feGaussianBlur({ in: 'SourceGraphic', stdDeviation: 2, result: 'blur' }),
        element.feOffset({ in: 'blur', dx: 1, dy: 1 }),
        element.feColorMatrix({ type: 'saturate', values: '0.5' }),
        element.feComponentTransfer(null, element.feFuncR({ type: 'linear', slope: 0.5, intercept: 0.1 }), element.feFuncA({ type: 'table', tableValues: '0 1' })),
        element.feMerge(null, element.feMergeNode({ in: 'blur' }), element.feMergeNode({ in: 'SourceGraphic' })),
        element.feDiffuseLighting({ surfaceScale: 2, diffuseConstant: 1 }, element.feDistantLight({ azimuth: 45, elevation: 60 })),
        element.feTurbulence({ baseFrequency: 0.05, numOctaves: 2, seed: 3, stitchTiles: 'stitch' })),
    ),
    element.circle({ cx: 5, cy: 5, r: 3, fill: 'url(#fade)', filter: 'url(#soft)', 'clip-path': 'url(#clip)', mask: 'url(#veil)', 'marker-end': 'url(#arrow)' },
      element.title(null, 'A point'), element.animate({ attributeName: 'r', from: 3, to: 6, dur: '1s', repeatCount: 'indefinite', begin: '0s', calcMode: 'spline', keyTimes: '0;1', keySplines: '0 0 1 1' })),
    element.path({ d: 'M0 0L9 9' }, element.animateMotion({ dur: '2s', rotate: 'auto' }, element.mpath({ href: '#curve' })), element.set({ attributeName: 'opacity', to: 0, begin: 'click' }), element.animateTransform({ attributeName: 'transform', type: 'rotate', from: '0', to: '360', dur: '3s' })),
    element.use({ href: '#star', x: 20, y: 20, width: 10, height: 10 }),
    element.image({ href: '/chart.png', x: 0, y: 0, width: 10, height: 10, preserveAspectRatio: 'xMidYMid slice' }),
    element.svg({ viewBox: '0 0 1 1', 'aria-hidden': 'true' }),
    element.a({ href: '/detail' }, element.rect({ width: 2, height: 2 })),
  );
  assert.deepEqual(problems(fine), []);

  assert.deepEqual(problems(chart(g(null, element.stop({ offset: 0 })))), ['$.0.0: stop stands inside linearGradient or radialGradient, not inside g. Move it there']);
  assert.deepEqual(problems(chart(element.circle({ r: 1 }, element.stop({ offset: 0 })))), ['$.0.0: stop stands inside linearGradient or radialGradient, not inside circle. Move it there']);
  assert.deepEqual(problems(chart(element.feGaussianBlur({ stdDeviation: 1 }))), ['$.0: feGaussianBlur stands inside filter, not inside svg. Move it there']);
  assert.deepEqual(problems(chart(element.tspan(null, 'x'))), ['$.0: tspan stands inside text, tspan, textPath or a, not inside svg. Move it there']);
  assert.match(problems(chart(element.circle({ r: 1 }, element.rect({ width: 1 }))))[0], /^\$\.0\.0: circle holds only title, desc, animate, animateTransform, set and animateMotion, not rect\. Put the rect in a g, a defs or the svg$/);
  assert.match(problems(chart(element.linearGradient({ id: 'x' }, element.circle({ r: 1 }))))[0], /linearGradient holds only title, desc, stop, animate, animateTransform and set, not circle/);
  assert.match(problems(chart(element.clipPath({ id: 'x' }, g(null))))[0], /clipPath holds only .*, not g\./);
  assert.match(problems(chart(element.title({}, element.rect({ width: 1 }))))[0], /title holds text only, not rect/);
  assert.match(problems(chart(element.animateMotion({ dur: '1s' }, element.stop({ offset: 0 }))))[0], /stop stands inside linearGradient or radialGradient, not inside animateMotion/);
});

test('svg foreignObject: HTML stands inside it and nowhere else in an svg, and an svg inside that HTML is an svg again', () => {
  const problems = (spec) => validate(spec, {});
  const element = elements;
  assert.deepEqual(problems(chart(element.foreignObject({ x: 0, y: 0, width: 50, height: 20 }, div({ id: 'note' }, 'plain HTML, ', element.span(null, 'with a span'))))), []);
  assert.deepEqual(problems(chart(element.foreignObject({ width: 5, height: 5 }, div(null, svg({ 'aria-hidden': 'true' }, path({ d: 'M0 0' })))))), []);
  assert.deepEqual(problems(chart(element.foreignObject({ width: 5, height: 5 }, path({ d: 'M0 0' })))), ["$.0.0: path is drawn inside an svg. Put it in svg({ viewBox: '0 0 24 24', 'aria-hidden': 'true' }, ...)"]);
  assert.deepEqual(problems({ tag: 'foreignObject', props: { width: 1, height: 1 } }), ["$: foreignObject is drawn inside an svg. Put it in svg({ viewBox: '0 0 24 24', 'aria-hidden': 'true' }, ...)"]);
  assert.deepEqual(problems(chart(each('chart.items', 'id', element.text(null, 'x')), when(state('chart.on'), element.text(null, 'y'), element.stop({ offset: 0 })))).filter((line) => /stop/.test(line)).length, 1, 'a when branch and an each template are read inside the svg too');
});

test('svg attributes: the standard\'s own names are accepted on SVG tags, a misspelling is refused with the right one, and none stands on an HTML tag', () => {
  const element = elements;
  const props = {
    text: { x: 1, y: 2, dx: 1, dy: 1, rotate: 5, textLength: 10, lengthAdjust: 'spacing', 'text-anchor': 'end', 'dominant-baseline': 'middle', 'font-family': 'serif', 'font-size': 4, 'font-weight': 700, 'letter-spacing': 1, 'text-decoration': 'underline', 'writing-mode': 'vertical-rl', fill: 'red', stroke: 'none', opacity: 1, 'paint-order': 'stroke', transform: 'rotate(5)', class: 'axis', 'aria-hidden': 'true', 'data-axis': 'x' },
    rect: { rx: 1, ry: 1, 'fill-opacity': 0.5, 'stroke-dasharray': '2 1', 'stroke-linecap': 'round', 'pointer-events': 'none', cursor: 'pointer', display: 'none', visibility: 'hidden', overflow: 'visible', 'mix-blend-mode': 'multiply', 'shape-rendering': 'crispEdges', 'vector-effect': 'non-scaling-stroke', tabindex: -1, focusable: 'false' },
    feColorMatrix: { in: 'SourceGraphic', result: 'matrix', type: 'matrix', values: '1 0 0 0 0', 'color-interpolation-filters': 'sRGB' },
    feComposite: { in2: 'blur', operator: 'arithmetic', k1: 0, k2: 1, k3: 1, k4: 0 },
    feDisplacementMap: { scale: 5, xChannelSelector: 'R', yChannelSelector: 'G' },
    feConvolveMatrix: { order: 3, kernelMatrix: '0 0 0 0 1 0 0 0 0', divisor: 1, bias: 0, targetX: 1, targetY: 1, edgeMode: 'duplicate', preserveAlpha: 'true' },
    feMorphology: { operator: 'dilate', radius: 2 },
    feSpotLight: { x: 1, y: 1, z: 1, pointsAtX: 0, pointsAtY: 0, pointsAtZ: 0, specularExponent: 1, limitingConeAngle: 30 },
    feFlood: { 'flood-color': 'red', 'flood-opacity': 0.5 },
    stop: { offset: '50%', 'stop-color': 'blue', 'stop-opacity': 0.5 },
    animate: { attributeName: 'cx', values: '0;5;0', by: 1, dur: '1s', end: '5s', repeatDur: '10s', restart: 'never', additive: 'sum', accumulate: 'sum' },
  };
  for (const [tag, values] of Object.entries(props)) assert.doesNotThrow(() => element[tag](values), tag);
  assert.throws(() => element.rect({ strokewidth: 1 }), /rect\(\.\.\.\): unknown attribute "strokewidth"\. Did you mean "stroke-width"\?/);
  assert.throws(() => element.linearGradient({ gradientunits: 'x' }), /unknown attribute "gradientunits"\. Did you mean "gradientUnits"\?/);
  assert.throws(() => div({ stdDeviation: 1 }), /stdDeviation is an attribute of an svg drawing, and this is a div/);
  assert.throws(() => element.span({ 'text-anchor': 'end' }, 'x'), /text-anchor is an attribute of an svg drawing, and this is a span/);
  assert.doesNotThrow(() => element.a({ href: '/x', transform: 'rotate(1)' }), 'the SVG link takes the SVG attributes');
});

test('svg: elements are made in the SVG namespace, the shared a only inside an svg, and the children of a foreignObject in HTML', async () => {
  const { app } = await import('../src/ui.js');
  const { createRoot } = await import('./support/dom-shim.mjs');
  const element = elements;
  const spec = div(
    { id: 'page' },
    element.a({ id: 'html-link', href: '/a' }, 'html link'),
    chart(
      element.text({ id: 'label', x: 1, y: 2 }, 'Sales', element.tspan(null, ' 2026')),
      element.a({ id: 'svg-link', href: '/b' }, element.rect({ width: 1, height: 1 })),
      element.foreignObject({ id: 'note', width: 10, height: 10 }, div({ id: 'inside' }, element.a({ id: 'inner-link', href: '/c' }, 'link'))),
      when(state('chart.on'), element.circle({ id: 'dot', r: 1 })),
      each('chart.items', 'id', element.a({ href: '/d', id: 'row-link' }, element.circle({ r: 1 }))),
    ),
  );
  const namespaces = { chart: { state: { on: true, items: [{ id: 'x' }] } } };
  const created = [];
  const root = createRoot();
  const document = globalThis.document;
  const { createElementNS, createElement } = document;
  document.createElementNS = (namespace, tag) => (created.push(['svg', tag]), createElementNS(namespace, tag));
  document.createElement = (tag) => (created.push(['html', tag]), createElement(tag));
  try {
    const ui = app({ namespaces, spec, root, dev: true });
    ui.destroy();
  } finally {
    document.createElementNS = createElementNS;
    document.createElement = createElement;
  }
  assert.deepEqual(created.map(([kind, tag]) => `${kind}:${tag}`), [
    'html:div', 'html:a', 'svg:svg', 'svg:text', 'svg:tspan', 'svg:a', 'svg:rect', 'svg:foreignObject', 'html:div', 'html:a', 'svg:circle', 'svg:a', 'svg:circle',
  ]);
});

test('svg on the server: the markup keeps the case of the standard and every element holds what the spec says, closed', async () => {
  const { app } = await import('../src/ui.js');
  const { createServerDocument, serialize } = await import('../src/server-dom.js');
  const element = elements;
  const spec = chart(
    element.defs(null, element.linearGradient({ domId: 'fade', gradientUnits: 'userSpaceOnUse' }, element.stop({ offset: 0, 'stop-color': 'red' }))),
    element.text({ x: 1, y: 2, 'text-anchor': 'middle' }, 'Total ', state('chart.total'), element.tspan({ dy: 1 }, ' & more')),
    element.foreignObject({ width: 5, height: 5 }, div({ id: 'inside' }, 'html')),
  );
  const root = createServerDocument().createElement('div');
  const ui = app({ namespaces: { chart: { state: { total: 12 } } }, spec, root, dev: false });
  const markup = serialize(root);
  ui.destroy();
  assert.match(markup, /<svg data-id="0" viewBox="0 0 100 50" role="img" aria-label="Chart"><defs data-id="0\.0"><linearGradient data-id="0\.0\.0" id="fade" gradientUnits="userSpaceOnUse"><stop data-id="0\.0\.0\.0" offset="0" stop-color="red"><\/stop><\/linearGradient><\/defs>/);
  assert.match(markup, /<text data-id="0\.1" x="1" y="2" text-anchor="middle">Total <!--\|-->12<tspan data-id="0\.1\.2" dy="1"> &amp; more<\/tspan><\/text>/);
  assert.match(markup, /<foreignObject data-id="0\.2" width="5" height="5"><div data-id="inside">html<\/div><\/foreignObject><\/svg>$/);
});

