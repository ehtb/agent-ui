// Tailwind only generates CSS for class names it finds, and a misspelled utility ("bg-slat-100") fails silently in the
// browser. This test lists every class the spec uses and checks that the generated pages/page.css has a rule for it.
// Run `npm run css` first (needs `npm install`); until style.css exists the test is skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { view } from './pages/view.js';

const stylesheet = new URL('./pages/page.css', import.meta.url);

// Every class name in `props.class` (space separated) and in the keys of `classes`, anywhere in the spec.
const usedClasses = (node, found = new Set()) => {
  if (Array.isArray(node)) node.forEach((child) => usedClasses(child, found));
  else if (node && typeof node === 'object') {
    if (typeof node.props?.class === 'string') node.props.class.split(/\s+/).filter(Boolean).forEach((name) => found.add(name));
    Object.keys(node.classes ?? {}).forEach((name) => found.add(name));
    Object.values(node).forEach((child) => usedClasses(child, found));
  }
  return found;
};

// How a class name appears in a CSS selector: every character other than letters, digits, "_" and "-" is escaped.
const selectorFor = (className) => `.${className.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`)}`;

test('every class used in the spec has a rule in the generated pages/page.css', { skip: !existsSync(stylesheet) && 'run `npm run css` first' }, () => {
  const css = readFileSync(stylesheet, 'utf8');
  const missing = [...usedClasses(view)].filter((name) => !css.includes(selectorFor(name)));
  assert.deepEqual(missing, [], `Tailwind has no rule for: ${missing.join(', ')}. Check the spelling in pages/view.js, then run npm run css`);
});

test('the spec uses Tailwind classes at all (the check above is not vacuous)', () => {
  assert.ok(usedClasses(view).size > 10);
});
