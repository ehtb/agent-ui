// The tables of the grammar, written once. The validator (src/validate.js), the builders' call-site checks (src/spec-checks.js),
// the JSON Schema (src/spec-schema.js) and the `grammar` export all read these, so a new tag, operator or key is one edit and the
// copies cannot disagree. Pure data: this module is reached only by the development checks, and production builds leave them out.
import { BINDING_KEYS, DELEGATED_EVENTS, ELEMENT_FIELDS, KEY_EVENTS } from './spec-core.js';
import { IDENTIFIER } from './namespaces.js';

export const ALLOWED_TAGS = (
  'div span p h1 h2 h3 ul ol li button input label a section header footer main nav form select option textarea ' +
  'strong em b i small code pre blockquote hr br img table thead tbody tfoot tr th td caption dl dt dd ' +
  'details summary dialog aside article fieldset legend figure figcaption progress time'
).split(' ');
// Tags that cannot have children. (src/server-dom.js writes more tags without a closing tag: that is about HTML text, this is about the grammar.)
export const VOID_TAGS = ['input', 'img', 'hr', 'br'];
export const LABELLED_TAGS = ['input', 'select', 'textarea', 'progress'];
export const MODIFIER_ORDER = ['Control', 'Alt', 'Shift', 'Meta'];
// Operand count allowed for list operators: [minimum, maximum]. Operators not listed here take exactly one operand.
export const OPERAND_COUNTS = { equals: [2, 2], greaterThan: [2, 2], lessThan: [2, 2], and: [2, Infinity], or: [2, Infinity], join: [1, Infinity] };
// What windowEvents may listen to: the events a spec's `on` delegates, and the ones that only the window or the document receive.
export const WINDOW_EVENTS = [...DELEGATED_EVENTS, 'resize', 'scroll', 'online', 'offline', 'visibilitychange', 'hashchange', 'popstate', 'focus', 'blur', 'pagehide', 'pageshow', 'beforeunload'];
// The attributes a prop may be: the global ones, those of forms, links, images, tables and the elements above, and the three that
// belong to agent-ui (`follow`, `soft`, `focus`). `data-*` and `aria-*` are allowed when something follows the prefix and the name has no space, quote, <, >, / or = (`isPrefixedAttribute`), and are not listed. A name that is not here is
// a typo or another framework's spelling, and is refused with the nearest name instead of becoming an attribute no browser reads.
export const ATTRIBUTES = (
  'class style title lang dir hidden tabindex role accesskey draggable contenteditable spellcheck translate autofocus inert slot part popover enterkeyhint inputmode ' +
  'id for name value type checked disabled readonly required placeholder min max step minlength maxlength pattern multiple selected size rows cols wrap ' +
  'autocomplete autocapitalize accept capture form formaction formmethod formnovalidate formtarget list open label novalidate method action enctype target ' +
  'href rel download hreflang ping referrerpolicy src alt width height loading decoding srcset sizes crossorigin usemap ismap ' +
  'colspan rowspan headers scope span abbr datetime cite start reversed high low optimum dirname media ' +
  'follow soft focus'
).split(' ');
export const ATTRIBUTE_PREFIXES = ['data-', 'aria-'];
// data-* and aria-* names end up as markup: something must follow the prefix, and no space, quote, <, >, / or = may.
export const isPrefixedAttribute = (name) => ATTRIBUTE_PREFIXES.some((prefix) => name.startsWith(prefix) && name.length > prefix.length && !/[\s"'<>/=]/.test(name));
// data-agent-ui-* names are the framework's: they mark what a server wrote into the head and the end of the body (src/head.js), and a
// soft navigation reads and replaces exactly those, so an element of a view must not carry one.
export const isReservedAttribute = (name) => name.startsWith('data-agent-ui-');
export const ARGUMENT_TYPES = ['string', 'number', 'boolean', 'json'];
// An element is { tag, props, children } and the fields the builders keep outside props (ELEMENT_FIELDS in spec-core.js).
export const ELEMENT_KEYS = ['tag', 'props', 'children', ...ELEMENT_FIELDS];
export const EACH_KEYS = ['each', 'key', 'as', 'template'];
export const WHEN_KEYS = ['when', 'children', 'otherwise'];
export const HANDLER_OPTIONS = ['preventDefault', 'stopPropagation'];

// {state: 'todos.items.0.title'}: namespace, key, then any path inside the value. An action is 'namespace.verb'.
const NAME = IDENTIFIER.source.slice(1, -1);
export const STATE_PATH = new RegExp(`^${NAME}\\.${NAME}(\\.[^.]+)*$`);
export const ACTION_NAME = new RegExp(`^${NAME}\\.${NAME}$`);
// {row: 'order.total'} or {row: 'order'} (the whole item); {rowState: 'pickers.open'} or {rowState: 'order.pickers.open'}.
export const ROW_PATH = new RegExp(`^${NAME}(\\..+)?$`);
export const ROW_STATE_PATH = new RegExp(`^${NAME}\\.${NAME}(\\.${NAME})?$`);

export const grammar = Object.freeze({
  tags: [...ALLOWED_TAGS],
  voidTags: [...VOID_TAGS],
  events: DELEGATED_EVENTS,
  keyEvents: KEY_EVENTS,
  keyModifiers: MODIFIER_ORDER,
  bindingKeys: BINDING_KEYS,
  argumentTypes: ARGUMENT_TYPES,
  nodeKeys: { element: ELEMENT_KEYS, each: EACH_KEYS, when: WHEN_KEYS },
  handlerOptions: HANDLER_OPTIONS,
  attributes: ATTRIBUTES,
  attributePrefixes: ATTRIBUTE_PREFIXES,
});
