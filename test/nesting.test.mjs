// The nestings an HTML parser rewrites (src/nesting.js), reported by the validator where the spec is written: each one names what the
// browser would do to the markup the server writes, and what to write instead. What a parser keeps as written is not reported.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { validate } = await import('../src/validate.js');
const { findNestingProblem } = await import('../src/nesting.js');
const spec = await import('../src/spec.js');
const { div, p, span, a, button, form, h1, h2, ul, ol, li, dl, dt, dd, table, thead, tbody, tfoot, tr, th, td, caption, select, option, textarea, input, strong, each, when, state } = spec;

const namespaces = { page: { state: { items: [{ id: 1 }], open: true, text: '' } } };
const problemsOf = (node) => validate(node, { namespaces });
const only = (node) => {
  const problems = problemsOf(node);
  assert.equal(problems.length, 1, problems.join('\n'));
  return problems[0];
};
const fine = (node) => assert.deepEqual(problemsOf(node), []);

test('a block inside a paragraph is reported: the browser closes the paragraph before it', () => {
  assert.equal(only(p(null, div(null, 'x'))), '$.0: <div> inside <p>: the browser closes the <p> before it, so the markup the server wrote is not the tree of the spec. Make the outer element a <div> (or a <section>), or put the <div> next to the <p>; a <p> holds text and inline elements (span, a, strong, em, button, input, label, img)');
  assert.match(only(p(null, span(null, ul(null, li(null, 'x'))))), /^\$\.0\.0: <ul> inside <p>/, 'through an inline element in between');
  assert.match(only(p(null, p(null, 'x'))), /<p> inside <p>/);
  assert.match(only(p(null, h1(null, 'x'))), /<h1> inside <p>/);
  assert.match(only(p(null, table(null, tbody(null, tr(null, td(null, 'x')))))), /<table> inside <p>/);
  assert.match(only(p(null, form(null, input({ 'aria-label': 'a' })))), /<form> inside <p>/);
  fine(p(null, span(null, 'a'), strong(null, 'b'), a({ href: '/x' }, 'c'), button(null, 'd'), input({ 'aria-label': 'e' })));
  fine(p(null, button(null, div(null, 'a block in a button is kept: the button is a boundary'))));
  fine(div(null, p(null, 'a'), div(null, 'b')));
});

test('a link in a link, a button in a button, a form in a form and a heading in a heading are reported', () => {
  assert.match(only(a({ href: '/a' }, span(null, a({ href: '/b' }, 'x')))), /^\$\.0\.0: <a> inside <a>: the browser closes the first link before the second starts\. A link inside a link is not valid HTML/);
  assert.match(only(button(null, button(null, 'x'))), /<button> inside <button>/);
  assert.match(only(form(null, div(null, form(null, input({ 'aria-label': 'a' }))))), /<form> inside <form>: the browser ignores the inner <form> tag/);
  assert.match(only(h1(null, h2(null, 'x'))), /<h2> inside <h1>/);
  fine(div(null, a({ href: '/a' }, 'x'), a({ href: '/b' }, 'y'), button(null, 'x'), form(null, input({ 'aria-label': 'a' })), form(null, input({ 'aria-label': 'b' }))));
  fine(a({ href: '/a' }, table(null, tbody(null, tr(null, td(null, a({ href: '/b' }, 'a cell is a boundary')))))));
});

test('an item inside an item is reported unless a list stands between them', () => {
  assert.match(only(ul(null, li(null, li(null, 'x')))), /^\$\.0\.0: <li> inside <li> without a list between them: the browser closes the first item before the second starts\. Put the nested items in their own <ul> or <ol>, inside the <li>/);
  assert.match(only(ul(null, each('page.items', 'id', li(null, each('page.items', 'id', li(null, 'x')))))), /<li> inside <li> without a list/, 'also through each templates');
  assert.match(only(ul(null, li(null, div(null, li(null, 'x'))))), /<li> inside <li>/, 'a div does not end the search');
  fine(ul(null, li(null, ul(null, li(null, 'nested in a list of its own')))));
  fine(ol(null, li(null, div(null, ol(null, li(null, 'x'))))));
  assert.match(only(dl(null, dd(null, dt(null, 'x')))), /<dt> inside <dd> without a list between them/);
  fine(dl(null, dt(null, 'term'), dd(null, 'description')));
});

test('table parts: a row straight in a table, a cell straight in a section, text and elements between rows, and parts out of place', () => {
  assert.match(only(table(null, tr(null, td(null, 'x')))), /^\$\.0: <tr> directly inside <table>: the browser puts a <tbody> around it, so the markup the server wrote is not the tree of the spec\. Write the rows inside <thead>, <tbody> or <tfoot>/);
  assert.match(only(table(null, tbody(null, td(null, 'x')))), /<td> directly inside <tbody>: the browser puts a <tr> around it\. Write the cell inside a <tr>/);
  assert.match(only(table(null, tbody(null, tr(null, div(null, 'x'))))), /<div> inside <tr>, which holds <td>, <th> only: the browser moves the element out, in front of the table\. Put the <div> inside a <td> or a <th>/);
  assert.match(only(table(null, tbody(null, tr(null, 'text')))), /text inside <tr>, which holds <td>, <th> only: the browser moves the text out, in front of the table\. Put the text in a <td> or a <th>/);
  assert.match(only(table(null, tbody(null, tr(null, state('page.text'))))), /text inside <tr>/, 'a binding makes text');
  assert.match(only(table(null, span(null, 'x'))), /<span> inside <table>, which holds <caption>, <thead>, <tbody>, <tfoot> only/);
  assert.match(only(div(null, tr(null, td(null, 'x')))), /<tr> inside <div>, where it cannot stand: the browser drops the element and keeps what it held\. Write <tr> inside <thead>, <tbody>, <tfoot>/);
  assert.match(only(div(null, td(null, 'x'))), /<td> inside <div>, where it cannot stand/);
  assert.match(only(table(null, tbody(null, thead(null, tr(null, th(null, 'x')))))), /<thead> inside <tbody>, where it cannot stand/);
  fine(table(null, caption(null, 'c'), thead(null, tr(null, th(null, 'a'))), tbody(null, each('page.items', 'id', tr(null, td(null, state('page.text'))))), tfoot(null, tr(null, td(null, 'f')))));
  fine(table(null, tbody(null, tr(null, td(null, div(null, p(null, 'cells hold anything')), ' ', ul(null, li(null, 'x')))), when(state('page.open'), tr(null, td(null, 'a branch is transparent'))))));
  fine(table(null, tbody(null, tr(null, ' ', td(null, 'whitespace between cells is kept')))));
  fine(table(null, tbody(null, tr(null, td(null, table(null, tbody(null, tr(null, td(null, 'a table in a cell is a table of its own')))))))));
  fine(table(null, tbody(null, input({ type: 'hidden', 'aria-label': 'a hidden field is kept in a table' }))));
});

test('a select holds options, an option holds text, a textarea holds nothing: the browser drops or rereads the rest', () => {
  assert.match(only(select({ 'aria-label': 'x' }, div(null, 'x'))), /^\$\.0: <div> inside <select>, which holds <option> only: the browser drops it/);
  assert.match(only(select({ 'aria-label': 'x' }, option({ value: 'a' }, span(null, 'x')))), /<span> inside <option>, which holds text only: the browser drops it/);
  assert.match(only(textarea({ 'aria-label': 'x' }, span(null, 'x'))), /<span> inside <textarea>, which holds its value as text/);
  assert.match(only(textarea({ 'aria-label': 'x' }, 'text')), /text inside <textarea>, which holds its value as text.*prop value: state\(\.\.\.\)/);
  fine(select({ 'aria-label': 'x' }, each('page.items', 'id', option({ value: 'a' }, 'one')), option({ value: 'b' }, state('page.text'))));
  fine(textarea({ 'aria-label': 'x', value: state('page.text') }));
});

test('every problem is found, each at its own path, and a valid page has none', () => {
  const problems = problemsOf(div(null, p(null, div(null, 'a')), table(null, tr(null, td(null, 'b'))), ul(null, li(null, li(null, 'c')))));
  assert.deepEqual(problems.map((problem) => problem.split(':')[0]), ['$.0.0', '$.1.0', '$.2.0.0']);
});

test('findNestingProblem answers null for what the parser keeps, and { problem, fix } for what it does not', () => {
  assert.equal(findNestingProblem({ tag: 'span' }, ['div', 'p']), null);
  assert.equal(findNestingProblem({ text: true, whitespace: false }, ['div']), null);
  assert.deepEqual(Object.keys(findNestingProblem({ tag: 'div' }, ['div', 'p'])), ['problem', 'fix']);
  assert.equal(findNestingProblem({ tag: 'tr' }, []).problem.startsWith('<tr> inside <undefined>'), true, 'a root with no parent is reported, not thrown on');
});
