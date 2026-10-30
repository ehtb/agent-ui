// The same user session, run twice: against the headless test shim and in a real Chrome (@ehtb/agent-ui/testing/browser.mjs). After every
// step the app's own account of itself, state(), derived() and outline(), must be identical. The shim is hand written; this is what keeps
// it honest about the things it does not do the way a browser does: focus, the order of events, a native checkbox, a field that is
// removed while it has the focus. Skips itself when there is no Chrome (set CHROME_PATH).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { definePage } from '@ehtb/agent-ui/pages';
import { createRoot, fireEvent, findElements } from '@ehtb/agent-ui/testing/dom-shim.mjs';
import { launchBrowser, serveSite } from '@ehtb/agent-ui/testing/browser.mjs';

const { page } = await import('./pages/page.js');
const { view, layout } = await import('./pages/view.js');

const browser = await launchBrowser();
const cleanups = [];
after(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  await browser?.close();
});

// A target is a small CSS selector the shim understands as well: "tag.class" parts separated by a space (a descendant), and the
// `text` and `nth` that choose among the matches.
const parts = (css) => css.split(' ').map((part) => ({ tag: part.match(/^[a-z0-9]+/)?.[0], classes: [...part.matchAll(/\.([\w-]+)/g)].map((found) => found[1]) }));
const matchesPart = (element, part) => (!part.tag || element.localName === part.tag) && part.classes.every((name) => element.classNames.includes(name));
const matchesSelector = (element, selector) => {
  const wanted = parts(selector);
  if (!matchesPart(element, wanted.at(-1))) return false;
  let index = wanted.length - 2;
  for (let ancestor = element.parentElement; ancestor && index >= 0; ancestor = ancestor.parentElement) if (matchesPart(ancestor, wanted[index])) index--;
  return index < 0;
};

// The session. `css` + `nth` (+ `text`) say which element; the verbs are what a visitor does.
const session = [
  { name: 'type a todo and press Enter', target: { css: 'input.new-todo' }, type: 'Buy milk', then: 'Enter' },
  { name: 'type a second one', target: { css: 'input.new-todo' }, type: 'Walk the dog', then: 'Enter' },
  { name: 'a blank todo is not added', target: { css: 'input.new-todo' }, type: '   ', then: 'Enter' },
  { name: 'tick the first todo', target: { css: 'input.toggle', nth: 0 }, click: true },
  { name: 'filter: active', target: { css: 'button', text: 'Active' }, click: true },
  { name: 'filter: all', target: { css: 'button', text: 'All' }, click: true },
  { name: 'double-click the second title to edit', target: { css: 'li label', nth: 1 }, doubleClick: true },
  { name: 'replace its text and press Enter', target: { css: 'input.edit' }, type: 'Walk the cat', replace: true, then: 'Enter' },
  { name: 'edit the first title and press Escape', target: { css: 'li label', nth: 0 }, doubleClick: true },
  { name: 'type, then Escape cancels', target: { css: 'input.edit' }, type: 'dropped', replace: true, then: 'Escape' },
  { name: 'mark all as complete', target: { css: 'input.toggle-all' }, click: true },
  { name: 'clear completed', target: { css: 'button.clear-completed' }, click: true },
];

const snapshotOf = (ui) => JSON.parse(JSON.stringify({ state: ui.state(), derived: ui.derived(), outline: ui.outline() }));

test('the session gives the same state, derived values and outline in the shim and in Chrome, step by step', { skip: browser ? false : 'no Chrome found (set CHROME_PATH)' }, async () => {
  // ---- the shim
  const root = createRoot();
  const ui = definePage(page, { path: '/', view, layout }).create({ root, dev: true });
  ui.dispatch('route.hydrate'); // what the browser entry does once the page has started
  await ui.settle();
  const find = ({ css, nth = 0, text }) => findElements(root, (element) => matchesSelector(element, css) && (text === undefined || element.textContent === text))[nth];
  const shimSnapshots = [snapshotOf(ui)];
  for (const step of session) {
    const element = find(step.target);
    assert.ok(element, `shim: no element for step "${step.name}"`);
    if (step.click) {
      if (element.getAttribute('type') === 'checkbox') {
        element.checked = !element.checked; // a browser toggles the box before it tells the page
        fireEvent(element, 'change');
      } else fireEvent(element, 'click');
    }
    if (step.doubleClick) fireEvent(element, 'dblclick');
    if (step.type !== undefined) {
      element.value = step.type;
      fireEvent(element, 'input');
    }
    if (step.then) fireEvent(element, 'keydown', { key: step.then });
    await ui.settle();
    shimSnapshots.push(snapshotOf(ui));
  }

  // ---- Chrome
  const site = await serveSite({ projectRoot: dirname(fileURLToPath(import.meta.url)) });
  cleanups.push(site.close);
  const chrome = await browser.open(`${site.url}/`);
  const pick = async ({ css, nth = 0, text }) => {
    await chrome.evaluate(`(() => { document.querySelectorAll('[data-pick]').forEach((element) => element.removeAttribute('data-pick')); const found = [...document.querySelectorAll(${JSON.stringify(css)})].filter((element) => ${text === undefined ? 'true' : `element.textContent === ${JSON.stringify(text)}`}); found[${nth}].setAttribute('data-pick', ''); })()`);
    return '[data-pick]';
  };
  const browserSnapshot = async () => JSON.parse(await chrome.evaluate('window.__ui.settle().then(() => JSON.stringify({ state: window.__ui.state(), derived: window.__ui.derived(), outline: window.__ui.outline() }))'));
  const browserSnapshots = [await browserSnapshot()];
  for (const step of session) {
    const selector = await pick(step.target);
    if (step.click) await chrome.click(selector);
    if (step.doubleClick) await chrome.doubleClick(selector);
    if (step.type !== undefined) await chrome.type(selector, step.type, { replace: step.replace });
    if (step.then) await chrome.press(step.then);
    browserSnapshots.push(await browserSnapshot());
  }

  session.forEach((step, index) => {
    assert.deepEqual(browserSnapshots[index + 1], shimSnapshots[index + 1], `after "${step.name}" Chrome and the shim differ`);
  });
  assert.deepEqual(browserSnapshots[0], shimSnapshots[0], 'the first render differs');
  assert.deepEqual(shimSnapshots.at(-1).state.todos.items.map((todo) => todo.title), [], 'the session ended with the list empty');
  assert.ok(shimSnapshots.some((snapshot) => snapshot.state.todos.items.some((todo) => todo.title === 'Walk the cat')), 'the edit went through');
  assert.deepEqual(chrome.report.console, [], 'nothing was reported in the console');
});
