// Spec components (macro expansion) and element transitions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountSpec, sleep, waitFor } from './support/helpers.mjs';
import { createRoot, findByTag } from './support/dom-shim.mjs';

const { expandComponents } = await import('../src/components.js');
const { app } = await import('../src/ui.js');

const components = {
  card: { params: ['id', 'title'], spec: { tag: 'li', id: { param: 'id' }, children: [{ tag: 'h3', children: { param: 'title' } }, { slot: 'children' }] } },
  deck: { params: ['name'], spec: { tag: 'ul', id: { param: 'name' }, children: [{ use: 'card', with: { id: 'first', title: { param: 'name' } } }] } },
};

test('components expand to plain spec: params in values and ids, slots take the use node children', () => {
  const spec = expandComponents(
    { tag: 'main', children: [{ use: 'card', with: { id: 'a', title: { state: 'box.heading' } }, children: [{ tag: 'p', children: 'body' }, 'tail'] }, { use: 'card', with: { id: 'b', title: 'Two' } }] },
    components,
  );
  assert.deepEqual(spec, {
    tag: 'main',
    children: [
      { tag: 'li', id: 'a', children: [{ tag: 'h3', children: { state: 'box.heading' } }, { tag: 'p', children: 'body' }, 'tail'] },
      { tag: 'li', id: 'b', children: [{ tag: 'h3', children: 'Two' }] },
    ],
  });
  const { ui } = mountSpec({
    namespaces: {
      box: {
        state: { heading: 'Hello' },
        actions: {},
      },
    },
    spec,
  });
  assert.equal(ui.outline()[0].children[0].children[0].text, 'Hello');
});

test('components can use other components and the input is never modified', () => {
  const input = { tag: 'main', children: { use: 'deck', with: { name: 'ONE' } } };
  const before = JSON.stringify(input);
  const spec = expandComponents(input, components);
  assert.equal(JSON.stringify(input), before);
  assert.equal(spec.children.id, 'ONE');
  assert.equal(spec.children.children[0].id, 'first');
});

test('all mistakes are reported together with paths', () => {
  const run = (spec, extra = components) => {
    try {
      expandComponents(spec, extra);
    } catch (error) {
      return error.problems;
    }
    return [];
  };
  assert.deepEqual(run({ tag: 'main', children: [{ use: 'cardd', with: {} }] }), ['$.children.0: unknown component cardd. Did you mean "card"? Register it in the components option. Known: card, deck']);
  assert.deepEqual(run({ tag: 'main', children: [{ use: 'card', with: { id: 'a', titel: 'x' } }] }), [
    '$.children.0: component card needs param title. Add it to "with": { title: ... }',
    '$.children.0: component card has no param titel. Did you mean "title"? Declared: id, title',
  ]);
  assert.match(run({ use: 'card', with: { id: 'a', title: 'x' }, extra: 1 })[0], /unknown key extra on a component use/);
  assert.match(run({ use: 'x', with: {} }, { x: { params: [], spec: { tag: 'p', children: { param: 'missing' } } } })[0], /unknown param missing/);
  assert.match(run({ use: 'loop', with: {} }, { loop: { params: [], spec: { use: 'loop', with: {} } } })[0], /deeper than 20/);
});

test('an expanded spec still goes through the validator (duplicate ids from reuse are caught)', () => {
  const spec = expandComponents({ tag: 'ul', children: [{ use: 'card', with: { id: 'same', title: 'a' } }, { use: 'card', with: { id: 'same', title: 'b' } }] }, components);
  assert.throws(() => mountSpec({
    namespaces: {
      box: {
        actions: {},
      },
    },
    spec,
  }), /duplicate id same/);
});

// ------------------------------------------------------------------------------------------------- transitions

// The durations are long on purpose: the test looks at the states in between ('enter', 'leave'), and on a busy machine a short transition can be over
// before the assertion runs. The end of a transition is waited for, never slept for.
test('transition: rows and branches animate after the first render only; removal is delayed, never skipped', async () => {
  const root = createRoot();
  const ui = app({ dev: true,
    namespaces: {
      box: {
        state: { items: [{ id: 1, label: 'one' }], shown: true },
        actions: {
          add: { args: {}, run: (store) => store.set('items', [...store.get('items'), { id: 2, label: 'two' }]) },
          remove: { args: { id: 'number' }, run: (store, { id }) => store.set('items', store.get('items').filter((item) => item.id !== id)) },
          hide: { args: {}, run: (store) => store.set('shown', false) },
        },
      },
    },
    spec: {
      tag: 'main',
      id: 'm',
      children: [
        { tag: 'ul', id: 'list', children: { each: 'box.items', key: 'id', template: { tag: 'li', transition: 300, children: [{ item: 'label' }, { tag: 'button', on: { click: ['box.remove', { id: { item: 'id' } }] }, children: 'x' }] } } },
        { when: { state: 'box.shown' }, children: { tag: 'p', id: 'note', transition: 300, children: 'note' } },
      ],
    },
    root,
  });
  const listItems = () => findByTag(root, 'li');
  assert.equal(listItems()[0].getAttribute('data-transition'), null); // first render: no animation

  ui.dispatch('box.add');
  await ui.settle();
  assert.equal(listItems()[1].getAttribute('data-transition'), 'enter');
  await waitFor(() => listItems()[1].getAttribute('data-transition') === null);

  ui.dispatch('box.remove', { id: 1 });
  await ui.settle();
  assert.equal(listItems().length, 2); // still in the DOM while leaving
  assert.equal(listItems()[0].getAttribute('data-transition'), 'leave');
  assert.deepEqual(ui.state().box.items.map((item) => item.id), [2]); // state is already final
  await waitFor(() => listItems().length === 1);

  ui.dispatch('box.hide');
  await ui.settle();
  assert.equal(findByTag(root, 'p')[0].getAttribute('data-transition'), 'leave');
  await waitFor(() => findByTag(root, 'p').length === 0);
  assert.equal(ui.errors.length, 0);
});

test('transition: a row that is leaving ignores clicks, and invalid values are rejected', async () => {
  const root = createRoot();
  let removed = 0;
  const ui = app({ dev: true,
    namespaces: {
      box: {
        state: { items: [{ id: 1 }] },
        actions: { remove: { args: {}, run: (store) => { removed++; store.set('items', []); } } },
      },
    },
    spec: { tag: 'ul', id: 'l', children: { each: 'box.items', key: 'id', template: { tag: 'li', transition: 50, children: { tag: 'button', on: { click: ['box.remove'] }, children: 'x' } } } },
    root,
  });
  const { fireEvent } = await import('./support/dom-shim.mjs');
  const button = findByTag(root, 'button')[0];
  fireEvent(button, 'click');
  await ui.settle();
  fireEvent(button, 'click'); // while the row animates out
  assert.equal(removed, 1);
  assert.throws(() => mountSpec({
    namespaces: {
      box: {
        actions: {},
      },
    },
    spec: { tag: 'p', transition: -5, children: 'x' },
  }), /transition must be a positive number/);
});

// ------------------------------------------------------------------------------ param declarations (component libraries)

const library = {
  button: {
    params: {
      id: {},
      label: {},
      variant: { options: { default: 'btn-default', outline: 'btn-outline' }, default: 'default' },
      size: { options: { sm: 'btn-sm', md: 'btn-md' }, default: 'md' },
      class: { default: '' },
      onClick: { optional: true },
    },
    spec: {
      tag: 'button',
      id: { param: 'id' },
      props: { class: { join: ['btn ', { param: 'variant' }, ' ', { param: 'size' }, ' ', { param: 'class' }] } },
      on: { click: { param: 'onClick' } },
      children: { param: 'label' },
    },
  },
};
const expandButton = (withValues) => expandComponents({ use: 'button', with: { id: 'b', label: 'Go', ...withValues } }, library);
const problemsOf = (spec, definitions = library) => {
  try {
    expandComponents(spec, definitions);
  } catch (error) {
    return error.problems;
  }
  return [];
};

test('defaults, variants and optional params: a use gives only what differs from the default', () => {
  assert.deepEqual(expandButton({}), { tag: 'button', id: 'b', props: { class: 'btn btn-default btn-md' }, children: 'Go' });
  assert.deepEqual(expandButton({ variant: 'outline', size: 'sm', class: 'wide' }).props, { class: 'btn btn-outline btn-sm wide' });
  const handled = expandButton({ onClick: ['save', {}] });
  assert.deepEqual(handled.on, { click: ['save', {}] });
  assert.equal('on' in expandButton({}), false, 'an omitted optional param removes the key');
});

test('a join of literals is folded and the class prop has no stray spaces; other joins are kept for the runtime', () => {
  const spec = expandComponents(
    { use: 'tag', with: { text: { state: 'box.name' } } },
    { tag: { params: ['text'], spec: { tag: 'p', props: { class: { join: ['a ', '', ' b'] } }, children: { join: ['Hi ', { param: 'text' }] } } } },
  );
  assert.equal(spec.props.class, 'a b');
  assert.deepEqual(spec.children, { join: ['Hi ', { state: 'box.name' }] });
});

test('variant mistakes say what the options are', () => {
  assert.match(problemsOf({ use: 'button', with: { id: 'b', label: 'x', variant: 'outlne' } })[0], /param variant is "outlne", which is not one of its options\. Did you mean "outline"\? Options: default, outline/);
  assert.match(problemsOf({ use: 'button', with: { id: 'b', label: 'x', variant: { state: 'box.v' } } })[0], /must be a literal option, because variants are resolved when the page is built.*use a "when"/);
  assert.match(problemsOf({ use: 'button', with: { label: 'x' } })[0], /component button needs param id\. Add it to "with"/);
});

test('mistakes in a component declaration are reported with the path of the declaration', () => {
  const bad = (params) => problemsOf({ tag: 'p', children: 'x' }, { box: { params, spec: { tag: 'p', children: 'x' } } });
  assert.match(bad({ size: { dflt: 1 } })[0], /components\.box\.params\.size: unknown key dflt\. Did you mean "default"\? Allowed: default, options, optional/);
  assert.match(bad({ size: { default: 1, optional: true } })[0], /cannot have both default and optional/);
  assert.match(bad({ size: { options: { a: 1 } } })[0], /options must be an object of strings/);
  assert.match(bad({ size: { options: { a: 'x' }, default: 'b' } })[0], /default "b" is not one of the options\. Did you mean "a"\? Options: a/);
  assert.match(bad({ size: 'sm' })[0], /write \{\} for a required param/);
  assert.match(bad('size')[0], /params must be a list of names or an object/);
});

test('an expanded library component mounts and its handler runs', async () => {
  const spec = { tag: 'main', children: expandButton({ onClick: ['box.clicked', {}] }) };
  const { ui } = mountSpec({
    namespaces: {
      box: {
        state: { clicks: 0 },
        actions: { clicked: { args: {}, run: (store) => store.set('clicks', store.get('clicks') + 1) } },
      },
    },
    spec,
  });
  ui.dispatch('box.clicked');
  assert.equal(ui.state().box.clicks, 1);
});

test('{param, key: true} gives the option key the use wrote (or the default key), and drops an omitted variant', () => {
  const definitions = {
    chip: {
      params: { tone: { options: { quiet: 'is-quiet', loud: 'is-loud' }, default: 'quiet' }, size: { options: { s: 'is-s', l: 'is-l' }, optional: true } },
      spec: { tag: 'span', props: { class: { param: 'tone' }, 'data-tone': { param: 'tone', key: true }, 'data-size': { param: 'size', key: true } }, children: 'x' },
    },
  };
  const expand = (withValues) => expandComponents({ use: 'chip', with: withValues }, definitions).props;
  assert.deepEqual(expand({}), { class: 'is-quiet', 'data-tone': 'quiet' });
  assert.deepEqual(expand({ tone: 'loud', size: 'l' }), { class: 'is-loud', 'data-tone': 'loud', 'data-size': 'l' });
  const wrong = { use: 'chip', with: { id: 'a' } };
  assert.match(
    problemsOf(wrong, { chip: { params: { id: {} }, spec: { tag: 'p', props: { 'data-x': { param: 'id', key: true } } } } }).join('\n'),
    /needs a param with options/,
  );
});

test('a near miss of {param, key: true} is reported, not passed through as a stray object', () => {
  const useWith = (props) => problemsOf({ use: 'chip', with: {} }, { chip: { params: { tone: { options: { a: 'x' }, default: 'a' } }, spec: { tag: 'span', props, children: 'x' } } });
  assert.match(useWith({ 'data-t': { param: 'tone', key: 'true' } })[0], /\{param: 'tone', key: "true"\}: key must be the literal true\. Write \{ param: 'tone', key: true \}/);
  assert.match(useWith({ 'data-t': { param: 'tone', key: false } })[0], /key must be the literal true/);
  assert.match(useWith({ 'data-t': { param: 'tone', keys: true } })[0], /unknown key keys on a \{param\} node\. Did you mean "key"\? Write \{ param: 'name' \}/);
  assert.match(useWith({ 'data-t': { param: 'tone', extra: 1, key: true } })[0], /unknown key extra on a \{param\} node/);
  assert.deepEqual(useWith({ 'data-t': { param: 'tone', key: true } }), []);
  assert.deepEqual(useWith({ 'data-t': { param: 'tone' } }), []);
});

// ---- defineElement, placeholders and typed params (the builders' way of writing components) ----
{
  const { defineElement, param, paramKey, slot, expandComponents: expand } = await import('../src/components.js');
  const { div, button, span, state, act, join } = await import('../src/spec.js');

  const card = defineElement('card', {
    params: { id: { optional: true }, class: { default: '', type: 'string' }, tone: { options: { plain: 'c-plain', loud: 'c-loud' }, default: 'plain' }, onClick: { optional: true, type: 'handler' }, count: { optional: true, type: 'number' } },
    spec: div({ id: param('id'), class: join('card ', param('tone'), ' ', param('class')), 'data-tone': paramKey('tone'), on: { click: param('onClick') } }, slot()),
  });

  test('defineElement makes a function whose result expands to the same spec as the raw use node', () => {
    const fromBuilder = expand(div(null, card({ id: 'a', tone: 'loud' }, span(null, 'x'), 'y')), [card]);
    const fromRaw = expand(
      { tag: 'div', children: { use: 'card', with: { id: 'a', tone: 'loud' }, children: [{ tag: 'span', children: 'x' }, 'y'] } },
      { card: card.definition },
    );
    assert.deepEqual(fromBuilder, fromRaw);
    assert.deepEqual(fromBuilder.children, { tag: 'div', id: 'a', props: { class: 'card c-loud', 'data-tone': 'loud' }, children: [{ tag: 'span', children: 'x' }, 'y'] });
  });

  test('every binding of the grammar fits a typed param, including row and rowState', async () => {
    const { row, rowState, item, state: stateBinding, equals } = await import('../src/spec.js');
    for (const binding of [row('order.title'), rowState('pickers.open'), item('title'), stateBinding('todos.draft'), equals(1, 1)]) {
      assert.doesNotThrow(() => expand(card({ class: binding }), [card]), JSON.stringify(binding));
    }
  });

  test('an omitted optional handler leaves no "on"; a given one stays', () => {
    assert.equal('on' in expand(card(null), [card]), false);
    assert.deepEqual(expand(card({ onClick: act('app.go') }), [card]).on, { click: ['app.go'] });
  });

  test('typed params: a wrong literal is reported with the param, the type and a fix', () => {
    const text = (call) => {
      try {
        expand(call(), [card]);
      } catch (error) {
        return error.message;
      }
      return 'no error';
    };
    assert.match(text(() => card({ class: 3 })), /component card param class must be a string or a binding, got 3\. Write 'text'/);
    assert.match(text(() => card({ count: 'x' })), /param count must be a number, got "x"\. Write 3/);
    assert.match(text(() => card({ onClick: 'go' })), /param onClick must be a handler, for example act\('todo\.add', \{\}\), got "go"/);
    assert.equal(text(() => card({ class: state('app.cls'), count: 2 })), 'no error');
  });

  test('defineElement reports a mistake at the call: name, unknown params with a suggestion, bad definitions', () => {
    assert.throws(() => card({ clas: 'x' }), /defineElement\("card"\): has no param clas\. Did you mean "class"\? Declared: id, class, tone, onClick, count/);
    assert.throws(() => card('x'), /the first argument is the params object or null/);
    assert.throws(() => defineElement('', { spec: div(null) }), /the first argument is the component name/);
    assert.throws(() => defineElement('x', { sped: div(null) }), /unknown key sped\. Did you mean "spec"\?/);
    assert.throws(() => defineElement('x', { params: { a: { type: 'strng' } }, spec: div(null) }), /unknown type "strng"\. Did you mean "string"\?/);
    assert.throws(() => defineElement('x', { params: { a: { type: 'string', options: { b: 'c' } } }, spec: div(null) }), /remove type/);
    assert.throws(() => expand(div(null), [{}]), /components\[0\] is not made by defineElement/);
  });

  test('param, paramKey and slot are the placeholder objects of the raw form', () => {
    assert.deepEqual([param('a'), paramKey('a'), slot()], [{ param: 'a' }, { param: 'a', key: true }, { slot: 'children' }]);
    assert.deepEqual(button({ on: { click: param('go') } }, slot()).on.click, { param: 'go' });
  });
}

test('a param of type handler accepts one handler or a list of handlers', () => {
  const { defineElement, param } = components0;
  const Wrapper = defineElement('wrapper', { params: { onGo: { type: 'handler' } }, spec: { tag: 'button', on: { click: param('onGo') }, children: 'go' } });
  assert.deepEqual(expandComponents({ use: 'wrapper', with: { onGo: [['a.first'], ['b.second']] } }, [Wrapper]).on.click, [['a.first'], ['b.second']]);
  assert.deepEqual(expandComponents({ use: 'wrapper', with: { onGo: ['a.first'] } }, [Wrapper]).on.click, ['a.first']);
  assert.throws(() => expandComponents({ use: 'wrapper', with: { onGo: 'a.first' } }, [Wrapper]), /param onGo must be a handler/);
});
const components0 = await import('../src/components.js');

// Fake layout for the shim: every `li` sits at top = 40 * its index among its parent's children.
const withFakeLayout = async (body) => {
  const { DomElement } = await import('../src/server-dom.js');
  const played = [];
  const original = { rect: DomElement.prototype.getBoundingClientRect, animate: DomElement.prototype.animate };
  DomElement.prototype.getBoundingClientRect = function () {
    const top = 40 * this.parentNode.childNodes.filter((child) => child.localName === 'li').indexOf(this);
    return { left: 0, top };
  };
  DomElement.prototype.animate = function (keyframes, options) {
    played.push({ label: this.textContent, keyframes, options });
  };
  try {
    await body(played);
  } finally {
    DomElement.prototype.getBoundingClientRect = original.rect;
    DomElement.prototype.animate = original.animate;
  }
};

const moveSpec = (transition) => ({
  namespaces: {
    box: {
      state: { items: ['a', 'b', 'c'].map((id) => ({ id })) },
      actions: { reverse: { args: {}, run: (store) => store.set('items', store.get('items').slice().reverse()) } },
    },
  },
  spec: { tag: 'ul', id: 'list', children: { each: 'box.items', key: 'id', template: { tag: 'li', ...(transition ? { transition } : {}), children: { item: 'id' } } } },
});

test('transition: a row that changes position slides from its old place (FLIP), the others stay still', async () => {
  await withFakeLayout(async (played) => {
    const { ui } = mountSpec(moveSpec(120));
    await ui.settle();
    assert.equal(played.length, 0, 'the first render never animates');
    ui.dispatch('box.reverse');
    await ui.settle();
    // a: 0 -> 80, c: 80 -> 0, b stays at 40
    assert.deepEqual(played.map((one) => one.label).sort(), ['a', 'c']);
    const a = played.find((one) => one.label === 'a');
    assert.deepEqual(a.keyframes, [{ transform: 'translate(0px, -80px)' }, { transform: 'none' }]);
    assert.equal(a.options.duration, 120);
    assert.equal(ui.errors.length, 0);
  });
});

test('transition: moves are not animated without `transition`, while replaying, or for reduced motion', async () => {
  await withFakeLayout(async (played) => {
    const plain = mountSpec(moveSpec(0));
    await plain.ui.settle();
    plain.ui.dispatch('box.reverse');
    await plain.ui.settle();
    assert.equal(played.length, 0, 'no transition prop, no animation');

    const replayed = mountSpec(moveSpec(120));
    await replayed.ui.settle();
    replayed.ui.replay([['box.reverse', {}]]);
    await replayed.ui.settle();
    assert.equal(played.length, 0, 'replay is deterministic and silent');

    globalThis.matchMedia = () => ({ matches: true });
    try {
      const reduced = mountSpec(moveSpec(120));
      await reduced.ui.settle();
      reduced.ui.dispatch('box.reverse');
      await reduced.ui.settle();
      assert.equal(played.length, 0, 'prefers-reduced-motion: reduce');
    } finally {
      delete globalThis.matchMedia;
    }
  });
});

// ------------------------------------------------------------------------------------------------- follow

test('follow: while true the element tracks the pointer through --follow-x / --follow-y, and stops when false', async () => {
  const { DomElement } = await import('../src/server-dom.js');
  const original = { rect: DomElement.prototype.getBoundingClientRect, style: Object.getOwnPropertyDescriptor(DomElement.prototype, 'style') };
  const properties = new Map();
  DomElement.prototype.getBoundingClientRect = () => ({ left: 100, top: 50 });
  Object.defineProperty(DomElement.prototype, 'style', { configurable: true, get: () => ({ setProperty: (name, value) => properties.set(name, value), removeProperty: (name) => properties.delete(name) }) });
  const listeners = [];
  const root = createRoot();
  const document = root.ownerDocument ?? globalThis.document;
  const originalAdd = document.addEventListener;
  const originalRemove = document.removeEventListener;
  document.addEventListener = (type, listener) => listeners.push([type, listener]);
  document.removeEventListener = (type, listener) => listeners.splice(0, listeners.length, ...listeners.filter(([t, l]) => !(t === type && l === listener)));
  try {
    const ui = app({ dev: true,
      namespaces: { box: { state: { on: false }, actions: { set: { args: { on: 'boolean' }, run: (store, { on }) => store.set('on', on) } } } },
      spec: { tag: 'div', id: 'card', props: { follow: { state: 'box.on' } }, children: 'card' },
      root,
    });
    await ui.settle();
    assert.equal(listeners.length, 0, 'not following: no listener on the document');
    ui.dispatch('box.set', { on: true });
    await ui.settle();
    assert.deepEqual(listeners.map(([type]) => type), ['pointermove']);
    listeners[0][1]({ clientX: 120, clientY: 60 }); // the first move fixes the start
    listeners[0][1]({ clientX: 150, clientY: 90 });
    await sleep(40);
    assert.equal(properties.get('--follow-x'), '30px');
    assert.equal(properties.get('--follow-y'), '30px');
    // A move whose frame has not run yet when `follow` turns false must not write after the stop.
    listeners[0][1]({ clientX: 160, clientY: 100 });
    ui.dispatch('box.set', { on: false });
    await ui.settle();
    assert.equal(listeners.length, 0, 'the listener is removed');
    await sleep(40);
    assert.equal(properties.size, 0, 'the custom properties are removed, and a frame scheduled before the stop does not bring them back');
    assert.equal(ui.errors.length, 0);
  } finally {
    document.addEventListener = originalAdd;
    document.removeEventListener = originalRemove;
    DomElement.prototype.getBoundingClientRect = original.rect;
    if (original.style) Object.defineProperty(DomElement.prototype, 'style', original.style);
    else delete DomElement.prototype.style;
  }
});

test('follow: a value that is not a boolean or a binding is refused with the fix', () => {
  assert.throws(
    () => mountSpec({ namespaces: {}, spec: { tag: 'div', props: { follow: 'yes' }, children: 'x' } }),
    /follow is .{1,2}yes.{1,2}\. Write true, false or a binding/,
  );
});

test('transition: a second move while the first is still sliding starts from where the row is, and cancels the first animation', async () => {
  const { DomElement } = await import('../src/server-dom.js');
  const original = { rect: DomElement.prototype.getBoundingClientRect, animate: DomElement.prototype.animate };
  const animations = [];
  // The row "a" is on screen at `visualTop` until its animation is cancelled, then at its layout slot.
  DomElement.prototype.getBoundingClientRect = function () {
    const slot = 40 * this.parentNode.childNodes.filter((child) => child.localName === 'li').indexOf(this);
    return { left: 0, top: this.__moveAnimation && !this.__moveAnimation.cancelled ? slot + 10 : slot };
  };
  DomElement.prototype.animate = function (keyframes) {
    const animation = { keyframes, cancelled: false, cancel() { this.cancelled = true; } };
    animations.push({ label: this.textContent, animation });
    return animation;
  };
  try {
    const { ui } = mountSpec(moveSpec(120));
    await ui.settle();
    ui.dispatch('box.reverse');
    await ui.settle();
    const first = animations.filter((one) => one.label === 'a');
    assert.equal(first.length, 1);
    ui.dispatch('box.reverse');
    await ui.settle();
    const second = animations.filter((one) => one.label === 'a');
    assert.equal(second.length, 2, 'the second move plays its own animation');
    assert.equal(second[0].animation.cancelled, true, 'the first animation was cancelled, so two never stack');
    assert.equal(ui.errors.length, 0);
  } finally {
    DomElement.prototype.getBoundingClientRect = original.rect;
    DomElement.prototype.animate = original.animate;
  }
});

test('a default that does not fit the declared type, and a component without a spec element, are reported with the component named', async () => {
  const { defineElement } = await import('../src/components.js');
  assert.throws(() => defineElement('card', { params: { size: { type: 'number', default: 'big' } }, spec: { tag: 'div' } }), /params\.size: default must be a number, got "big"\. Write 3/);
  assert.throws(() => expandComponents({ tag: 'div' }, { card: { params: [] } }), /components\.card: spec must be one element/);
});
