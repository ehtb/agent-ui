// An app that takes over the markup a server wrote (src/adopt.js): what it keeps, what it makes again when the markup is not what its
// own render would have made, and that the page is the same either way. The markup comes from a real server render (src/server-dom.js)
// and is read into nodes the way a browser reads it (parseHtml of the shim), so neighbouring texts are one node, as in a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ShimElement, createRoot, createWindow, fireEvent, findByTag, findElements, mutations, parseHtml, shimDocument } from './support/dom-shim.mjs';
import { flushAsync } from './support/helpers.mjs';
import { createServerDocument, serialize } from '../src/server-dom.js';
import * as checks from '../src/runtime-checks.js';
import * as stub from '../build/stubs/runtime-checks-omitted.js';

const { app } = await import('../src/ui.js');
const { defineShell } = await import('../src/shell.js');
const { definePage } = await import('../src/pages.js');
const { renderPage } = await import('../server/render-page.js');
const { div, h1, p, span, ul, li, input, select, option, textarea, button, state, item, each, when, act, main, header, footer, a, pageSlot, svg, path, circle } = await import('../src/spec.js');

const quietly = async (run) => {
  const original = console.error;
  console.error = () => {};
  try {
    return await run();
  } finally {
    console.error = original;
  }
};

const shop = (overrides = {}) => ({
  shop: {
    state: { title: 'Shop', count: 2, note: '', items: [{ id: 'a', name: 'Apple', price: 3 }, { id: 'b', name: 'Pear', price: 4 }], open: true, draft: 'hello', agree: true, choice: 'two', ...overrides },
    actions: {
      add: { args: {}, run: (store) => store.set('count', store.get('count') + 1) },
      toggle: { args: {}, run: (store) => store.set('open', !store.get('open')) },
      addItem: { args: { id: 'string' }, run: (store, { id }) => store.set('items', [...store.get('items'), { id, name: id.toUpperCase(), price: 1 }]) },
      setDraft: { args: { text: 'string' }, run: (store, { text }) => store.set('draft', text) },
    },
  },
});

// One page that has everything the first render makes: elements, literal and bound texts next to each other, an empty text, a list with a
// key, both branches of a `when`, fields, a select and a textarea.
const spec = div(
  { id: 'root' },
  h1({ id: 'title' }, 'Hello, ', state('shop.title'), '!'),
  p({ id: 'note' }, state('shop.note')),
  p({ id: 'count' }, 'Count: ', state('shop.count'), ' items'),
  button({ id: 'add', on: { click: act('shop.add') } }, 'Add'),
  ul({ id: 'list' }, each('shop.items', 'id', li({ id: 'row' }, span({ id: 'name' }, item('name')), ' costs ', item('price')))),
  when(state('shop.open'), div({ id: 'panel' }, 'open'), p({ id: 'closed' }, 'closed')),
  input({ id: 'draft', 'aria-label': 'Draft', value: state('shop.draft'), on: { input: act('shop.setDraft', { text: { event: 'target.value' } }) } }),
  input({ id: 'agree', type: 'checkbox', 'aria-label': 'Agree', checked: state('shop.agree') }),
  select({ id: 'choice', 'aria-label': 'Choice', value: state('shop.choice') }, option({ value: 'one' }, 'One'), option({ value: 'two' }, 'Two')),
  textarea({ id: 'about', 'aria-label': 'About', value: state('shop.draft') }),
);

// What a server writes for this namespaces and spec (a fresh server document, the same app() code).
const serverMarkup = async ({ namespaces = shop(), page = spec, initialState }) => {
  const root = createServerDocument().createElement('div');
  const ui = app({ namespaces, spec: page, initialState, root, dev: true });
  await ui.settle();
  const html = serialize(root);
  ui.destroy();
  return html;
};
const rootFor = (html) => parseHtml(html, createRoot());
const nodesOf = (root, found = []) => {
  for (const child of root.childNodes) {
    found.push(child);
    nodesOf(child, found);
  }
  return found;
};
const byDataId = (root, id) => findElements(root, (element) => element.getAttribute('data-id') === id)[0];
const textOf = (root, id) => byDataId(root, id).textContent;
// The page a render from nothing makes: what an adopted page has to equal.
const freshOutline = async ({ namespaces = shop(), page = spec, initialState }) => {
  const root = createRoot();
  const ui = app({ namespaces, spec: page, initialState, root, dev: true });
  await ui.settle();
  const outline = ui.outline();
  ui.destroy();
  return outline;
};
const reporting = (reports) => (api) => api.onError((report) => reports.push(report));
const adoptOn = (root, options = {}) => {
  const reports = [];
  const ui = app({ namespaces: shop(), spec, root, dev: true, adopt: true, plugins: [reporting(reports)], ...options });
  return { ui, reports };
};

for (const dev of [true, false]) {
  test(`dev: ${dev}: an adopted page keeps every node the server wrote and writes nothing to the page`, async () => {
    const html = await serverMarkup({});
    const root = rootFor(html);
    const before = nodesOf(root);
    const writes = mutations.count;
    const { ui, reports } = adoptOn(root, { dev });
    await ui.settle();
    const after = nodesOf(root);
    assert.deepEqual(ui.errors, []);
    assert.deepEqual(reports, []);
    assert.ok(before.every((node) => after.includes(node)), 'every node of the server markup is still in the page');
    const added = after.filter((node) => !before.includes(node));
    assert.ok(added.length === 1 && added[0].nodeType === 3 && added[0].data === '', 'the one new node is the empty text of the empty paragraph: markup has no node for an empty text');
    assert.equal(mutations.count - writes, 1, 'and that insertion is the only write to the page');
    assert.deepEqual(ui.outline(), await freshOutline({}), 'it is the page a render from nothing makes');
    assert.equal(serialize(root), html, 'and the markup is the one the server wrote');
  });
}

test('an adopted page works: its handlers, its bindings, a list that grows in the right place, and a branch that flips', async () => {
  const root = rootFor(await serverMarkup({}));
  const { ui } = adoptOn(root);
  const button = findByTag(root, 'button')[0];
  fireEvent(button, 'click');
  await ui.settle();
  assert.equal(ui.state().shop.count, 3);
  assert.equal(textOf(root, 'count'), 'Count: 3 items');

  ui.dispatch('shop.addItem', { id: 'c' });
  await ui.settle();
  const rows = findByTag(root, 'li').map((row) => row.getAttribute('data-key'));
  assert.deepEqual(rows, ['a', 'b', 'c'], 'the new row stands after the rows that were taken over, before the end of the list');
  assert.equal(findByTag(root, 'ul')[0].lastChild.nodeType, 8, 'the end marker of the list is the last node of it');

  ui.dispatch('shop.toggle');
  await ui.settle();
  assert.equal(textOf(root, 'closed'), 'closed');
  assert.equal(byDataId(root, 'panel'), undefined);
  ui.dispatch('shop.toggle');
  await ui.settle();
  assert.equal(textOf(root, 'panel'), 'open');

  ui.destroy();
  assert.equal(root.childNodes.length, 0, 'destroy empties the root as for any app');
  assert.equal(ui.dispatch('shop.add'), undefined, 'and nothing runs after it');
});

test('a value that differs between the server and the browser is made again, alone: only its text node, and nothing is reported', async () => {
  const html = await serverMarkup({ initialState: { shop: { title: 'Shop' } } });
  const root = rootFor(html);
  const before = nodesOf(root);
  const { ui, reports } = adoptOn(root, { initialState: { shop: { title: 'Store', count: 7 } } });
  await ui.settle();
  const after = nodesOf(root);
  assert.deepEqual(ui.errors, [], 'the value of a binding is state, and state may differ: no report');
  assert.deepEqual(reports, []);
  assert.ok(before.every((node) => after.includes(node)), 'every node of the server is still there, the two texts that differ written again where they stand');
  assert.equal(findByTag(root, 'h1')[0].textContent, 'Hello, Store!');
  assert.deepEqual(ui.outline(), await freshOutline({ initialState: { shop: { title: 'Store', count: 7 } } }));
});

test('a value that is empty in the browser is written in the node the server wrote, and the texts beside it stay the server\'s', async () => {
  const html = await serverMarkup({ initialState: { shop: { title: 'Shop' } } });
  const root = rootFor(html);
  const before = nodesOf(root);
  const { ui, reports } = adoptOn(root, { initialState: { shop: { title: '' } } });
  await ui.settle();
  const after = nodesOf(root);
  assert.deepEqual(ui.errors, [], 'the value of a binding is state, and an empty one is a value like another: no report');
  assert.deepEqual(reports, []);
  assert.ok(before.every((node) => after.includes(node)), 'every node of the server is still there: the text that became empty keeps its node, and the texts beside it are not written again');
  assert.equal(findByTag(root, 'h1')[0].textContent, 'Hello, !');
  assert.deepEqual(ui.outline(), await freshOutline({ initialState: { shop: { title: '' } } }));
});

test('a branch the server wrote differently is made again, the rest of the page is kept, and the difference is reported once with what it cost', async () => {
  const html = await serverMarkup({});
  const root = rootFor(html);
  const kept = findByTag(root, 'li').concat(findByTag(root, 'h1'), findByTag(root, 'input'), findByTag(root, 'select'));
  const { ui, reports } = await quietly(async () => adoptOn(root, { initialState: { shop: { open: false } } }));
  await ui.settle();
  assert.ok(kept.every((node) => root.querySelectorAll('[data-id]').includes(node)), 'what did not differ is the server\'s node');
  assert.deepEqual(ui.outline(), await freshOutline({ initialState: { shop: { open: false } } }));
  assert.equal(reports.length, 1);
  assert.equal(reports[0].code, 'AUI0305');
  assert.ok(reports[0].details.removed >= 1, 'the panel the server wrote');
  assert.ok(reports[0].details.created >= 2, 'the paragraph that took its place, and its text');
  assert.match(reports[0].message, /the first render differs from the markup the server wrote: \d+ nodes? made again, \d+ removed\. First difference: expected <p data-id="closed"> in <div data-id="root">, found <div data-id="panel">\. .*Run `agent-ui check`/);
  assert.match(ui.errors[0], /^the first render differs/);
});

test('rows are found by their key: the ones in both lists are the server\'s nodes, one that left goes, one that arrived is new', async () => {
  const html = await serverMarkup({});
  const root = rootFor(html);
  const serverRows = new Map(findByTag(root, 'li').map((row) => [row.getAttribute('data-key'), row]));
  const items = [{ id: 'b', name: 'Pear', price: 4 }, { id: 'c', name: 'Cherry', price: 6 }];
  const { ui, reports } = await quietly(async () => adoptOn(root, { initialState: { shop: { items } } }));
  await ui.settle();
  const rows = new Map(findByTag(root, 'li').map((row) => [row.getAttribute('data-key'), row]));
  assert.deepEqual([...rows.keys()], ['b', 'c']);
  assert.equal(rows.get('b'), serverRows.get('b'), 'the row in both lists is the node the server wrote');
  assert.notEqual(rows.get('c'), serverRows.get('a'), 'the new row is not the row that left');
  assert.equal(serverRows.get('a').parentNode, null, 'the row that left is gone');
  assert.equal(reports.length, 1);
  assert.deepEqual(ui.outline(), await freshOutline({ initialState: { shop: { items } } }));
  ui.dispatch('shop.addItem', { id: 'd' });
  await ui.settle();
  assert.deepEqual(findByTag(root, 'li').map((row) => row.getAttribute('data-key')), ['b', 'c', 'd']);
});

test('markup that is not the page at all is replaced by the page, reported, and the page works', async () => {
  const root = parseHtml('<div data-id="zzz">nothing like it</div><!----><span data-id="yyy"></span>', createRoot());
  const { ui, reports } = await quietly(async () => adoptOn(root));
  await ui.settle();
  assert.deepEqual(ui.outline(), await freshOutline({}));
  assert.equal(reports.length, 1);
  assert.equal(reports[0].code, 'AUI0305');
  assert.ok(reports[0].details.created > 10 && reports[0].details.removed === 3);
  assert.equal(reports[0].details.restarted, undefined);
  fireEvent(findByTag(root, 'button')[0], 'click');
  await ui.settle();
  assert.equal(ui.state().shop.count, 3);
});

test('markup the server wrote with extra elements, or with elements missing, ends as the page a render makes', async () => {
  const html = await serverMarkup({});
  const withExtra = html.replace('<p data-id="note">', '<aside data-id="extra">ad</aside><p data-id="note">').replace('<button data-id="add">Add</button>', '');
  const root = rootFor(withExtra);
  const { ui, reports } = await quietly(async () => adoptOn(root));
  await ui.settle();
  assert.deepEqual(ui.outline(), await freshOutline({}));
  assert.equal(serialize(root), html);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].details.removed, 1, 'the aside');
  assert.equal(reports[0].details.created, 2, 'the button and its text');
});

test('a shell that is told its page\'s values after it started takes the markup over without the report that causes (adopt: "quiet"), and recovers the same', async () => {
  const html = await serverMarkup({});
  const root = rootFor(html.replace('<div data-id="panel">open</div>', '<p data-id="closed">closed</p>'));
  const { ui, reports } = adoptOn(root, { adopt: 'quiet' });
  await ui.settle();
  assert.deepEqual(ui.errors, []);
  assert.deepEqual(reports, []);
  assert.deepEqual(ui.outline(), await freshOutline({}));
});

test('an empty root is rendered as it always is, with nothing to report', async () => {
  const root = createRoot();
  const { ui, reports } = adoptOn(root);
  await ui.settle();
  assert.deepEqual(reports, []);
  assert.deepEqual(ui.outline(), await freshOutline({}));
});

test('adopt is true, false or "quiet"; anything else is refused with what each means', () => {
  assert.throws(() => app({ namespaces: shop(), spec, root: createRoot(), dev: true, adopt: 'yes' }), /app: adopt is "yes"\. Write adopt: true when the root holds the markup a server rendered .*adopt: "quiet"/);
  assert.throws(() => app({ namespaces: shop(), spec, root: createRoot(), dev: true, adoptt: true }), /unknown option "adoptt"\. Did you mean "adopt"\?/);
});

test('if taking the markup over throws, what it made is stopped, the root is emptied and the page is rendered from nothing', async () => {
  class Unreadable extends ShimElement {
    getAttribute(name) {
      if (name === 'data-id') throw new Error('this node cannot be read');
      return super.getAttribute(name);
    }
  }
  const root = createRoot();
  root.append(new Unreadable('div'));
  const { ui, reports } = await quietly(async () => adoptOn(root));
  await ui.settle();
  assert.deepEqual(ui.outline(), await freshOutline({}));
  assert.equal(reports.length, 1);
  assert.deepEqual([reports[0].code, reports[0].details.restarted], ['AUI0305', true]);
  assert.match(reports[0].message, /could not be taken over \(this node cannot be read\), so the page was rendered again from nothing/);
  fireEvent(findByTag(root, 'button')[0], 'click');
  await ui.settle();
  assert.equal(textOf(root, 'count'), 'Count: 3 items');
  ui.destroy();
  assert.equal(root.childNodes.length, 0);
});

test('what the visitor typed before the script ran is kept in the field the server wrote, and the field keeps the focus', async () => {
  const root = rootFor(await serverMarkup({}));
  const field = findByTag(root, 'input')[0];
  field.currentValue = 'typed early';
  field.focus();
  const { ui } = adoptOn(root);
  await ui.settle();
  assert.equal(findByTag(root, 'input')[0], field, 'the same field');
  assert.equal(field.currentValue, 'typed early');
  assert.equal(ShimElement.focusedElement, field);
  assert.equal(ui.state().shop.draft, 'hello', 'the typed value is not state until an action writes it, as for any unsubmitted input');
});

test('the content of a textarea is its value and stays: the server\'s text node is not taken out', async () => {
  const root = rootFor(await serverMarkup({}));
  const area = findByTag(root, 'textarea')[0];
  const text = area.firstChild;
  const { ui, reports } = adoptOn(root);
  await ui.settle();
  assert.deepEqual(reports, []);
  assert.equal(findByTag(root, 'textarea')[0], area);
  assert.equal(area.firstChild, text);
  assert.equal(area.currentValue, 'hello');
});

test('markup is written so a parser reads it back as written: one newline after <pre> and <textarea> is dropped, so a content that starts with one gets a second', () => {
  const document = createServerDocument();
  const root = document.createElement('div');
  const pre = document.createElement('pre');
  pre.append(document.createTextNode('\nfirst line'));
  const area = document.createElement('textarea');
  area.value = '\nline';
  root.append(pre, area);
  assert.equal(serialize(root), '<pre>\n\nfirst line</pre><textarea>\n\nline</textarea>');
  const plain = document.createElement('div');
  const quiet = document.createElement('pre');
  quiet.append(document.createTextNode('no newline'));
  plain.append(quiet);
  assert.equal(serialize(plain), '<pre>no newline</pre>');
});

test('an svg is taken over like any element: the shapes the server writes with a closing tag are read as written, and nothing is written', async () => {
  const icon = div({ id: 'icon-box' }, svg({ id: 'icon', viewBox: '0 0 24 24', 'aria-hidden': 'true' }, path({ id: 'line', d: 'M0 0L24 24' }), circle({ id: 'dot', cx: 12, cy: 12, r: 3 })), span({ id: 'label' }, 'Icon: ', state('shop.title')));
  const html = await serverMarkup({ page: icon });
  const root = rootFor(html);
  const before = nodesOf(root);
  const writes = mutations.count;
  const { ui, reports } = adoptOn(root, { spec: icon });
  await ui.settle();
  assert.deepEqual(reports, []);
  assert.ok(before.every((node) => nodesOf(root).includes(node)), 'every node of the svg is still there');
  assert.equal(mutations.count, writes, 'and nothing was written');
});

// ---------------------------------------------------------------------------------------------------- the shell and its page

const frame = { state: { cartCount: 0 }, actions: { setCartCount: { args: { count: 'number' }, run: (store, { count }) => store.set('cartCount', count) } } };
const shellDefinition = (reads = true) => defineShell({ name: 'main', namespaces: { frame }, reads: reads ? [{ watch: ['cart.count'], action: 'frame.setCartCount', args: { count: 'cart.count' } }] : [] });
const shellView = () => ({ name: 'main', view: main({ id: 'frame-root' }, header({ id: 'frame-header' }, a({ id: 'home', href: '/' }, 'Home'), span({ id: 'badge' }, 'Cart ', state('frame.cartCount'), ' on ', state('route.path'))), pageSlot(), footer({ id: 'frame-footer' }, 'Footer')) });
const cart = { state: { lines: [{ id: 1, quantity: 2 }, { id: 2, quantity: 3 }] }, derive: { count: (get) => get('lines').reduce((sum, line) => sum + line.quantity, 0) }, actions: { empty: { args: {}, run: (store) => store.set('lines', []) } } };
const pageDefinition = (shell) => definePage({ head: { title: 'A page' }, namespaces: { cart }, shell }, { path: '/', view: { tag: 'section', id: 'page-view', children: { state: 'cart.count' } }, shell: shellView() });

test('a document with a shell: the shell, its slot and the page inside it are all the server\'s nodes, and the page and the shell are in step', async () => {
  const shell = shellDefinition();
  const definition = pageDefinition(shell);
  const { html } = await renderPage(definition.create, { url: '/', createShell: definition.createShell, dev: true });
  const body = new ShimElement('body');
  shimDocument.getElementById = (id) => (body.attributes.id === id ? body : body.findById(id));
  const shellRoot = new ShimElement('div');
  shellRoot.attributes.id = 'shell';
  body.append(shellRoot);
  parseHtml(html, shellRoot);
  const slot = shellRoot.findById('app');
  const before = nodesOf(shellRoot);
  const win = { ...createWindow('/'), document: shimDocument };
  const running = shell.start(definition, { root: slot, win, fetchFunction: async () => null, dev: true, adopt: true });
  await flushAsync(running.ui);
  await flushAsync(running.shellApp);
  const after = nodesOf(shellRoot);
  assert.equal(running.slot, slot);
  assert.equal(shimDocument.getElementById('app'), slot, 'the slot is the element the server wrote');
  assert.ok(before.filter((node) => node.nodeType === 1).every((node) => after.includes(node)), 'every element of the server markup, the shell\'s and the page\'s, is still there');
  assert.deepEqual(running.shellApp.errors, [], 'the shell started from its defaults and was told the page\'s count after: that is no report');
  assert.deepEqual(running.ui.errors, []);
  assert.equal(textOf(shellRoot, 'page-view'), '5');
  assert.equal(textOf(shellRoot, 'badge'), 'Cart 5 on /');
  assert.equal(running.shellApp.state().frame.cartCount, 5);
  running.ui.dispatch('cart.empty');
  await flushAsync(running.ui);
  await flushAsync(running.shellApp);
  assert.equal(textOf(shellRoot, 'badge'), 'Cart 0 on /', 'the page and the shell keep in step after the take-over');
});

test('a shell that cannot take the markup over (the server wrote another one) is made again and the page keeps its markup in the new slot', async () => {
  const shell = shellDefinition(false);
  const definition = pageDefinition(shell);
  const { html } = await renderPage(definition.create, { url: '/', createShell: definition.createShell, dev: true });
  const body = new ShimElement('body');
  shimDocument.getElementById = (id) => (body.attributes.id === id ? body : body.findById(id));
  const shellRoot = new ShimElement('div');
  shellRoot.attributes.id = 'shell';
  body.append(shellRoot);
  parseHtml(html.replace('data-id="frame-footer"', 'data-id="other-footer"'), shellRoot);
  const slot = shellRoot.findById('app');
  const pageNode = byDataId(shellRoot, 'page-view');
  const win = { ...createWindow('/'), document: shimDocument };
  const running = await quietly(async () => shell.start(definition, { root: slot, win, fetchFunction: async () => null, dev: true, adopt: true }));
  await flushAsync(running.ui);
  assert.equal(shimDocument.getElementById('app'), slot, 'the page\'s element is in the shell\'s place');
  assert.equal(byDataId(shellRoot, 'page-view'), pageNode, 'and the page took over its own markup');
  assert.equal(running.shellApp.errors.length, 1);
  assert.match(running.shellApp.errors[0], /the first render differs/);
  assert.ok(byDataId(shellRoot, 'frame-footer'), 'the shell has the footer it should');
  assert.equal(byDataId(shellRoot, 'other-footer'), undefined);
});

// ---------------------------------------------------------------------------------------------------- the development checks

test('the stub of the checks that production builds use says nothing of a difference, and the module words every kind of difference', () => {
  assert.equal(stub.describeAdoptionDifference('element', { tag: 'p', dataId: '0' }, null, null), null);
  assert.equal(typeof checks.describeAdoptionDifference, 'function');
  const text = checks.describeAdoptionDifference('text', 'abc', null, null);
  assert.equal(text, 'expected the text "abc", found nothing');
  assert.match(checks.describeAdoptionDifference('marker', null, null, null), /expected the marker of a list or a branch, found nothing/);
  assert.match(checks.describeAdoptionDifference('extra', null, null, new ShimElement('p')), /^<p data-id="null"> was not part of the render$/);
  assert.match(checks.describeAdoptionDifference('element', { tag: 'ul', dataId: '0.2' }, new ShimElement('div'), null), /expected <ul data-id="0\.2"> in <div data-id="null">, found nothing/);
  assert.doesNotThrow(() => stub.checkAdopt('anything'));
  assert.throws(() => checks.checkAdopt('anything'), /adopt is "anything"/);
});
