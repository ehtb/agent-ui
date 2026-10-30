// The grammar and runtime features added beyond the basics: operators, otherwise, nested lists, key chords, handler
// options, element order rules, URL guard, derived equality, outline, replaying flag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fireEvent, findElements, mutations, ShimElement } from './support/dom-shim.mjs';
import { DomElement } from '../src/server-dom.js';
import { mountSpec, outlineById } from './support/helpers.mjs';

const { grammar, validate } = await import('../src/ui.js');

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
