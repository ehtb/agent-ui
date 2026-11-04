// Spec builders: plain functions that return the same JSON the grammar describes (docs/API.md "Builders"). They add nothing at
// runtime: `div({ class: 'x' }, 'hi')` returns `{ tag: 'div', props: { class: 'x' }, children: 'hi' }`, byte for byte what
// you would have written by hand, so the validator, SSR, hydration and the action log see no difference.
//
// What they are for: a wrong call fails where it is made, with the builder's name and the fix (src/spec-checks.js; production
// builds replace that module with a stub, so there the builders are only object constructors).
//
//   (from the package entry "@ehtb/agent-ui/spec") div, button, state, act, each, when
//   div({ class: 'row' }, button({ on: { click: act('counter.add', { by: 1 }) } }, 'Add'), div(null, state('counter.count')))
//
// Elements: tag(attributes | null, ...children). `id`, `classes`, `on`, `transition` keep their meaning, every other attribute
// becomes a prop. (`id` is the element's address in the spec, shown as data-id; the HTML id attribute, which a label's `for` points
// at, is `domId`.) Children may be text, bindings, elements, each(...), when(...) or an array of those (flattened one level).
import { checkAct, checkEach, checkElement, checkOperator, checkPath, checkWhen } from './spec-checks.js';
import { APP_ELEMENT_ID } from './hydrate.js';
import { ELEMENT_FIELDS } from './spec-core.js';

// The builder of one tag.
const createBuilder = (tag) => (attributes, ...children) => {
  const flat = children.flat();
  checkElement(tag, attributes, children);
  const node = { tag };
  const props = {};
  for (const [name, value] of Object.entries(attributes ?? {})) {
    if (ELEMENT_FIELDS.includes(name)) node[name] = value;
    else if (name === 'domId') props.id = value;
    else props[name] = value;
  }
  if (Object.keys(props).length) node.props = props;
  if (flat.length) node.children = flat.length === 1 ? flat[0] : flat;
  return node;
};

// ---- bindings ---------------------------------------------------------------------------------------------------------
export const state = (path) => (checkPath('state', path), { state: path });
export const item = (path) => (checkPath('item', path), { item: path });
// A field of a row of an enclosing each that says `as` (item reads the innermost row only): row('order.total'), or row('tag') for a whole item.
export const row = (path) => (checkPath('row', path), { row: path });
// A field of the namespace's rowState for the row of the innermost each: rowState('pickers.open'), or of an outer row an each names with `as`: rowState('order.pickers.open').
export const rowState = (path) => (checkPath('rowState', path), { rowState: path });
// Only valid as a handler argument: a value read from the DOM event, for example event('target.value').
export const event = (path) => (checkPath('event', path), { event: path });
const unary = (name) => (operand) => (checkOperator(name, [operand]), { [name]: operand });
const binary = (name) => (...operands) => (checkOperator(name, operands), { [name]: operands });
const variadic = (name) => (...operands) => (checkOperator(name, operands), { [name]: operands });
export const not = unary('not');
export const length = unary('length');
export const equals = binary('equals');
export const greaterThan = binary('greaterThan');
export const lessThan = binary('lessThan');
export const and = variadic('and');
export const or = variadic('or');
export const join = variadic('join');

// ---- behaviour and structure --------------------------------------------------------------------------------------------
// A handler: act('todos.add', { text: state('todos.draft') }, { preventDefault: false }). Several run in order from one event:
// on: { click: [act('todos.add', {}), act('search.clear', {})] }.
export const act = (...parts) => {
  const [name, args, options] = parts;
  checkAct('act(...)', name, args, options, parts.length);
  const handler = [name];
  if (args !== undefined || options !== undefined) handler.push(args ?? {});
  if (options !== undefined) handler.push(options);
  return handler;
};
// when(condition, children, otherwise?): children and otherwise are one node or an array of nodes; null leaves a branch empty.
export const when = (condition, children, otherwise) => {
  checkWhen(condition, children, otherwise);
  const node = { when: condition };
  if (children !== undefined && children !== null) node.children = children;
  if (otherwise !== undefined && otherwise !== null) node.otherwise = otherwise;
  return node;
};
// each(source, key, template, options?): one element per item of a state or derived list ('todos.visible'), or of a nested list binding.
// options is { as: 'name' }: inside the template, row('name.field') reads this row from any depth, also from a nested each.
export const each = (source, key, template, options) => {
  checkEach(source, key, template, options);
  return options === undefined ? { each: source, key, template } : { each: source, key, as: options.as, template };
};

// ---- elements ---------------------------------------------------------------------------------------------------------
export const div = createBuilder('div');
// Where a shell (src/shell.js) holds the page: the element the page's app renders into. Once per shell, and not inside a when or an each.
export const pageSlot = () => div({ id: 'page-slot', domId: APP_ELEMENT_ID });
export const span = createBuilder('span');
export const p = createBuilder('p');
export const h1 = createBuilder('h1');
export const h2 = createBuilder('h2');
export const h3 = createBuilder('h3');
export const ul = createBuilder('ul');
export const ol = createBuilder('ol');
export const li = createBuilder('li');
export const button = createBuilder('button');
export const input = createBuilder('input');
export const label = createBuilder('label');
export const a = createBuilder('a');
export const section = createBuilder('section');
export const header = createBuilder('header');
export const footer = createBuilder('footer');
export const main = createBuilder('main');
export const nav = createBuilder('nav');
export const form = createBuilder('form');
export const select = createBuilder('select');
export const option = createBuilder('option');
export const textarea = createBuilder('textarea');
export const strong = createBuilder('strong');
export const em = createBuilder('em');
export const b = createBuilder('b');
export const i = createBuilder('i');
export const small = createBuilder('small');
export const code = createBuilder('code');
export const pre = createBuilder('pre');
export const blockquote = createBuilder('blockquote');
export const hr = createBuilder('hr');
export const br = createBuilder('br');
export const img = createBuilder('img');
export const table = createBuilder('table');
export const thead = createBuilder('thead');
export const tbody = createBuilder('tbody');
export const tfoot = createBuilder('tfoot');
export const tr = createBuilder('tr');
export const th = createBuilder('th');
export const td = createBuilder('td');
export const caption = createBuilder('caption');
export const dl = createBuilder('dl');
export const dt = createBuilder('dt');
export const dd = createBuilder('dd');
export const details = createBuilder('details');
export const summary = createBuilder('summary');
export const dialog = createBuilder('dialog');
export const aside = createBuilder('aside');
export const article = createBuilder('article');
export const fieldset = createBuilder('fieldset');
export const legend = createBuilder('legend');
export const figure = createBuilder('figure');
export const figcaption = createBuilder('figcaption');
export const progress = createBuilder('progress');
export const time = createBuilder('time');
// SVG, for icons and simple drawings (src/grammar.js): the shapes stand inside an svg, and an svg says what it shows (aria-label with
// role: 'img') or that it is decoration ('aria-hidden': 'true').
export const svg = createBuilder('svg');
export const g = createBuilder('g');
export const path = createBuilder('path');
export const circle = createBuilder('circle');
export const ellipse = createBuilder('ellipse');
export const rect = createBuilder('rect');
export const line = createBuilder('line');
export const polyline = createBuilder('polyline');
export const polygon = createBuilder('polygon');
export const use = createBuilder('use');
