// The build-time stripper must only remove comments and layout, never change meaning.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { stripJavaScript, stripCss } = await import('../build/strip.mjs');
const run = (code) => new Function(`${stripJavaScript(code)}\nreturn result;`)();

test('comments and indentation go; strings, templates and regexes that look like comments stay', () => {
  assert.equal(stripJavaScript('// header\nconst a = 1; // trailing\n  /* block */ const b = 2;\n\n\n    const c = 3;\n'), 'const a = 1;\nconst b = 2;\nconst c = 3;\n');
  assert.equal(run('const result = ["// not a comment", \'/* nor this */\', `${"//"} x // y`, "a\\"//b"];').join('|'), '// not a comment|/* nor this */|// x // y|a"//b');
  assert.equal(run('const re = /\\/\\/[/]*/g; const result = "a//b".match(re).length;'), 1);
  assert.equal(run('const result = 10 / 2 / 5;'), 1); // division, not a regex
  assert.equal(run('const x = 6; const result = x /* c */ / 3 // d\n;'), 2);
  assert.equal(run('function f() { return /ab+/.test("abb") // r\n}\nconst result = f();'), true);
});

test('template literal contents are byte-for-byte, nested templates and ${} work', () => {
  const code = 'const name = "x";\nconst result = `line1\n    indented ${`inner ${name} // keep`}\n  // not removed\n`;';
  assert.equal(run(code), 'line1\n    indented inner x // keep\n  // not removed\n');
  assert.equal(run('const o = { a: 1 };\nconst result = `${ o.a } and ${ { b: 2 }.b }`;'), '1 and 2');
});

test('newlines are kept, so automatic semicolon insertion is unchanged', () => {
  assert.equal(run('let result = 1\n/* gap */\n;[1].forEach(() => { result = 2 })'), 2);
  assert.equal(run('const result = (() => {\n  return\n    5\n})();'), undefined);
});

test('CSS: comments and whitespace go, strings are untouched', () => {
  assert.equal(stripCss('/* a */\n.a  {\n  color : red;\n  content: "x  {  y}";\n}\n\n.b ,\n.c { margin: 0 }\n'), '.a{color : red;content: "x  {  y}"}.b,.c{margin: 0}\n');
});

test('a property named like a keyword is a value: dividing it is not a regex, and the comments after it still go', () => {
  assert.equal(run('const bounds = { in: 8, delete: 6 };\nconst result = bounds.in / 2 + bounds.delete / 3; // a / b\n'), 6);
  assert.equal(run('const bounds = { in: 8 };\nconst result = bounds?.in / 2; // ok\n/* c */ const unused = 1;\n'), 4);
  assert.equal(stripJavaScript('const half = bounds.in / 2; // gone\n'), 'const half = bounds.in / 2;\n');
});

test('maskNonCode keeps a comment after `obj.in / 2` a comment', async () => {
  const { maskNonCode } = await import('../build/strip.mjs');
  const code = 'const a = bounds.in / 2;\n// import x from "./y.js";\n';
  const masked = maskNonCode(code);
  assert.equal(masked.length, code.length);
  assert.doesNotMatch(masked, /import/);
  assert.match(masked, /bounds\.in \/ 2;/);
});
