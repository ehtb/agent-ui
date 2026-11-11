// The nestings an HTML parser does not keep. A browser does not read markup as it is written: a `p` is closed by the `div` that starts
// inside it, a `tr` written straight into a `table` gets a `tbody` around it, a `div` between table rows is moved out in front of the table.
// The server writes markup, so the page the browser gets is not the page the spec describes, and the app cannot take over what it did not
// write (src/adopt.js: it makes the nodes that differ again, and says so). The validator refuses these nestings where the spec is written,
// and says which one the browser rewrites and what to write instead. Only nestings that change the tree are here, not every nesting the HTML
// standard calls wrong (a `div` in a `span` is kept as it is written). Development only: reached from src/validate.js.
//
// The rules follow the HTML standard's parsing of a document in standards mode ("in body", "in table", "in select" and "in cell"), the
// states a page of this framework is parsed in: the document the server writes has a doctype.

// The elements whose start tag closes an open `p` ("close a p element" in the standard), among the tags of the grammar.
const CLOSES_PARAGRAPH = new Set(['address', 'article', 'aside', 'blockquote', 'details', 'dialog', 'div', 'dl', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'header', 'hr', 'li', 'dd', 'dt', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'summary', 'table', 'ul']);
// What ends the search for an open element: the elements a parser keeps a scope boundary at (a table, a cell, a caption), and for a `p` or
// a `button` also a button (the "button scope").
const SCOPE_BOUNDARIES = ['table', 'td', 'th', 'caption'];
// The "special" elements of the standard that stop the search for an open `li`, `dd` or `dt` (the `div`, `p` and `address` do not).
const SPECIAL = new Set(['article', 'aside', 'blockquote', 'button', 'details', 'dialog', 'dl', 'dd', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'header', 'hr', 'li', 'main', 'nav', 'ol', 'pre', 'section', 'select', 'summary', 'table', 'tbody', 'td', 'textarea', 'tfoot', 'th', 'thead', 'tr', 'ul', 'img', 'input', 'br']);
const TRANSPARENT_FOR_ITEMS = new Set(['div', 'p', 'address']);
// The parent a table part needs, and what a table part holds.
const TABLE_PARENTS = { tr: ['thead', 'tbody', 'tfoot'], td: ['tr'], th: ['tr'], thead: ['table'], tbody: ['table'], tfoot: ['table'], caption: ['table'] };
const TABLE_CHILDREN = { table: ['caption', 'thead', 'tbody', 'tfoot'], thead: ['tr'], tbody: ['tr'], tfoot: ['tr'], tr: ['td', 'th'] };
const SECTION_PARENTS = ['thead', 'tbody', 'tfoot'];

const list = (tags) => tags.map((tag) => `<${tag}>`).join(', ');

// The nearest open ancestor (ancestors are the tags from the outermost to the parent) with the tag `wanted`, looking up until a boundary.
const reaches = (ancestors, wanted, boundaries) => {
  for (let index = ancestors.length - 1; index >= 0; index--) {
    if (ancestors[index] === wanted) return true;
    if (boundaries.includes(ancestors[index])) return false;
  }
  return false;
};

// Why the parser would not keep `child` ({ tag, props } for an element, { text: true } for a text or a binding that makes one, with
// `whitespace` for a text of only whitespace) inside its ancestors, as { problem, fix }, or null when it keeps it.
export const findNestingProblem = (child, ancestors) => {
  const parent = ancestors[ancestors.length - 1];
  if (child.text) {
    if (parent === 'textarea') return { problem: 'text inside <textarea>, which holds its value as text: the server writes the value and the text of the spec would be a second one', fix: 'A textarea has no children: give it its text with the prop value: state(...)' };
    if (child.whitespace || !(parent in TABLE_CHILDREN)) return null;
    return { problem: `text inside <${parent}>, which holds ${list(TABLE_CHILDREN[parent])} only: the browser moves the text out, in front of the table`, fix: parent === 'tr' ? 'Put the text in a <td> or a <th>' : `Put the text in a cell (<td>) of a row, or in a <caption>` };
  }
  const { tag } = child;
  // Table parts: where each one may stand, and what a table or a part of it may hold.
  if (tag in TABLE_PARENTS && !TABLE_PARENTS[tag].includes(parent)) {
    if (tag === 'tr' && parent === 'table') return { problem: '<tr> directly inside <table>: the browser puts a <tbody> around it, so the markup the server wrote is not the tree of the spec', fix: 'Write the rows inside <thead>, <tbody> or <tfoot>' };
    if ((tag === 'td' || tag === 'th') && SECTION_PARENTS.includes(parent)) return { problem: `<${tag}> directly inside <${parent}>: the browser puts a <tr> around it`, fix: `Write the cell inside a <tr>` };
    return { problem: `<${tag}> inside <${parent}>, where it cannot stand: the browser drops the element and keeps what it held`, fix: `Write <${tag}> inside ${list(TABLE_PARENTS[tag])}` };
  }
  if (parent in TABLE_CHILDREN && !TABLE_CHILDREN[parent].includes(tag) && !(tag in TABLE_PARENTS) && !(tag === 'input' && child.props?.type === 'hidden')) {
    return { problem: `<${tag}> inside <${parent}>, which holds ${list(TABLE_CHILDREN[parent])} only: the browser moves the element out, in front of the table`, fix: parent === 'tr' ? `Put the <${tag}> inside a <td> or a <th>` : `Put the <${tag}> inside a cell (<td>) or a <caption>, or outside the table` };
  }
  if (parent === 'select' && tag !== 'option' && tag !== 'hr') return { problem: `<${tag}> inside <select>, which holds <option> only: the browser drops it`, fix: 'Write <option> elements; a group of them is not part of the grammar' };
  if (parent === 'option') return { problem: `<${tag}> inside <option>, which holds text only: the browser drops it`, fix: 'Give the option text, or a label with a binding' };
  if (parent === 'textarea') return { problem: `<${tag}> inside <textarea>, which holds its value as text: the browser reads the markup as text`, fix: 'A textarea has no children: give it its text with the prop value: state(...)' };
  // Elements the parser closes or refuses when another one is open.
  if (CLOSES_PARAGRAPH.has(tag) && reaches(ancestors, 'p', [...SCOPE_BOUNDARIES, 'button'])) {
    return { problem: `<${tag}> inside <p>: the browser closes the <p> before it, so the markup the server wrote is not the tree of the spec`, fix: `Make the outer element a <div> (or a <section>), or put the <${tag}> next to the <p>; a <p> holds text and inline elements (span, a, strong, em, button, input, label, img)` };
  }
  if (tag === 'a' && reaches(ancestors, 'a', ['td', 'th', 'caption'])) return { problem: '<a> inside <a>: the browser closes the first link before the second starts', fix: 'A link inside a link is not valid HTML: end the outer link first, or make the inner one a button with a handler' };
  if (tag === 'button' && reaches(ancestors, 'button', SCOPE_BOUNDARIES)) return { problem: '<button> inside <button>: the browser closes the first button before the second starts', fix: 'Write the buttons next to each other' };
  if (tag === 'form' && ancestors.includes('form')) return { problem: '<form> inside <form>: the browser ignores the inner <form> tag, so its fields belong to the outer form', fix: 'Write the forms next to each other' };
  if ((tag === 'h1' || tag === 'h2' || tag === 'h3') && (parent === 'h1' || parent === 'h2' || parent === 'h3')) return { problem: `<${tag}> inside <${parent}>: the browser closes the heading before the next one starts`, fix: 'Write the headings next to each other' };
  for (const [item, counterparts] of [['li', ['li']], ['dd', ['dd', 'dt']], ['dt', ['dd', 'dt']]]) {
    if (tag !== item) continue;
    for (let index = ancestors.length - 1; index >= 0; index--) {
      const ancestor = ancestors[index];
      if (counterparts.includes(ancestor)) return { problem: `<${tag}> inside <${ancestor}> without a list between them: the browser closes the first item before the second starts`, fix: item === 'li' ? 'Put the nested items in their own <ul> or <ol>, inside the <li>' : 'Write the terms and their descriptions next to each other, inside <dl>' };
      if (SPECIAL.has(ancestor) && !TRANSPARENT_FOR_ITEMS.has(ancestor)) break;
    }
  }
  return null;
};
