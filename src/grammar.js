// The tables of the grammar, written once. The validator (src/validate.js), the builders' call-site checks (src/spec-checks.js),
// the JSON Schema (src/spec-schema.js) and the `grammar` export all read these, so a new tag, operator or key is one edit and the
// copies cannot disagree. Pure data: this module is reached only by the development checks, and production builds leave them out.
import { BINDING_KEYS, DELEGATED_EVENTS, ELEMENT_FIELDS, KEY_EVENTS, SVG_SHARED_TAGS, SVG_TAGS } from './spec-core.js';
import { IDENTIFIER } from './namespaces.js';

export const ALLOWED_TAGS = (
  'div span p h1 h2 h3 ul ol li button input label a section header footer main nav form select option textarea ' +
  'strong em b i small code pre blockquote hr br img table thead tbody tfoot tr th td caption dl dt dd ' +
  'details summary dialog aside article fieldset legend figure figcaption progress time'
).split(' ').concat(SVG_TAGS);
// Tags that cannot have children. (src/server-dom.js writes more tags without a closing tag: that is about HTML text, this is about the grammar.)
export const VOID_TAGS = ['input', 'img', 'hr', 'br'];
export const LABELLED_TAGS = ['input', 'select', 'textarea', 'progress'];
export const MODIFIER_ORDER = ['Control', 'Alt', 'Shift', 'Meta'];
// Operand count allowed for list operators: [minimum, maximum]. Operators not listed here take exactly one operand.
export const OPERAND_COUNTS = { equals: [2, 2], greaterThan: [2, 2], lessThan: [2, 2], and: [2, Infinity], or: [2, Infinity], join: [1, Infinity] };
// What windowEvents may listen to: the events a spec's `on` delegates, and the ones that only the window or the document receive.
export const WINDOW_EVENTS = [...DELEGATED_EVENTS, 'resize', 'scroll', 'online', 'offline', 'visibilitychange', 'hashchange', 'popstate', 'focus', 'blur', 'pagehide', 'pageshow', 'beforeunload'];
// The attributes of the SVG tags, checked by name and not by element (`r` is on any of them, as are `path`, which only animateMotion reads, and `z`,
// which only the light sources read): the standard says where each one is read, the validator says where it is written at all. (They also take href, width, height, type, class, style and the global attributes below, written once
// in ATTRIBUTES). They belong on an SVG tag only, and are written in the case the SVG standard uses: an HTML parser puts the case back on
// the ones it knows (viewBox, gradientUnits, stdDeviation, ...), so the server's markup and the runtime's elements agree.
export const SVG_ATTRIBUTES = (
  // painting and what a stylesheet could also set (presentation attributes)
  'fill fill-rule fill-opacity clip-rule clip-path mask marker-start marker-mid marker-end stroke stroke-width stroke-linecap stroke-linejoin ' +
  'stroke-dasharray stroke-dashoffset stroke-miterlimit stroke-opacity opacity color display visibility overflow cursor pointer-events paint-order ' +
  'mix-blend-mode isolation shape-rendering text-rendering image-rendering color-rendering color-interpolation color-interpolation-filters ' +
  'vector-effect filter flood-color flood-opacity lighting-color stop-color stop-opacity ' +
  // text
  'font-family font-size font-size-adjust font-stretch font-style font-variant font-weight letter-spacing word-spacing text-anchor text-decoration ' +
  'dominant-baseline alignment-baseline baseline-shift writing-mode direction unicode-bidi dx dy rotate textLength lengthAdjust startOffset spacing side ' +
  // geometry
  'viewBox preserveAspectRatio d pathLength cx cy r rx ry x y z x1 y1 x2 y2 fx fy fr points transform refX refY markerWidth markerHeight markerUnits orient ' +
  // gradients, patterns, clip paths and masks
  'gradientUnits gradientTransform spreadMethod offset patternUnits patternContentUnits patternTransform clipPathUnits maskUnits maskContentUnits ' +
  // filters
  'filterUnits primitiveUnits in in2 result stdDeviation baseFrequency numOctaves seed stitchTiles kernelMatrix kernelUnitLength divisor bias targetX targetY ' +
  'edgeMode preserveAlpha order surfaceScale diffuseConstant specularConstant specularExponent azimuth elevation pointsAtX pointsAtY pointsAtZ ' +
  'limitingConeAngle operator k1 k2 k3 k4 scale xChannelSelector yChannelSelector radius mode values tableValues slope intercept amplitude exponent ' +
  // animation
  'attributeName from to by keyTimes keySplines keyPoints calcMode dur begin end repeatCount repeatDur restart additive accumulate path ' +
  'focusable'
).split(' ');

// What an SVG element may hold, besides the elements of its own kind (src/validate.js reads these two tables). The browser draws nothing
// where an element stands in the wrong place, so the validator names the place instead.
//
// SVG_HOLDS: the tags that hold only the listed tags. A tag that is not a key (svg, g, defs, symbol, marker, pattern, mask and the SVG `a`)
// holds any SVG tag that may stand there (SVG_PARENTS says which ones are restricted); foreignObject holds HTML, not SVG.
const DESCRIPTIVE = ['title', 'desc'];
const ANIMATION = ['animate', 'animateTransform', 'set'];
const LEAF_CHILDREN = [...DESCRIPTIVE, ...ANIMATION, 'animateMotion'];
const FILTER_PRIMITIVES = [
  'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite', 'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap', 'feDropShadow', 'feFlood',
  'feGaussianBlur', 'feImage', 'feMerge', 'feMorphology', 'feOffset', 'feSpecularLighting', 'feTile', 'feTurbulence',
];
const LIGHTS = ['feDistantLight', 'fePointLight', 'feSpotLight'];
const TRANSFER_FUNCTIONS = ['feFuncA', 'feFuncB', 'feFuncG', 'feFuncR'];
const GRAPHICS = ['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'image', 'use'];
const TEXT_PARTS = ['tspan', 'textPath', 'a', ...DESCRIPTIVE, ...ANIMATION, 'animateMotion'];
const TEXT_PARTS_WITHOUT_PATH = TEXT_PARTS.filter((tag) => tag !== 'textPath'); // a textPath stands in text, not in a tspan or another textPath
export const SVG_HOLDS = {
  ...Object.fromEntries(GRAPHICS.map((tag) => [tag, LEAF_CHILDREN])),
  text: TEXT_PARTS,
  tspan: TEXT_PARTS_WITHOUT_PATH,
  textPath: TEXT_PARTS_WITHOUT_PATH,
  title: [],
  desc: [],
  linearGradient: [...DESCRIPTIVE, 'stop', ...ANIMATION],
  radialGradient: [...DESCRIPTIVE, 'stop', ...ANIMATION],
  stop: ['animate', 'set'],
  clipPath: [...GRAPHICS.filter((tag) => tag !== 'image'), 'text', ...DESCRIPTIVE, ...ANIMATION],
  filter: [...DESCRIPTIVE, ...FILTER_PRIMITIVES, 'animate', 'set'],
  ...Object.fromEntries(FILTER_PRIMITIVES.map((tag) => [tag, [...DESCRIPTIVE, 'animate', 'set']])),
  feMerge: [...DESCRIPTIVE, 'feMergeNode', 'animate', 'set'],
  feMergeNode: ['animate', 'set'],
  feComponentTransfer: [...DESCRIPTIVE, ...TRANSFER_FUNCTIONS, 'animate', 'set'],
  feDiffuseLighting: [...DESCRIPTIVE, ...LIGHTS, 'animate', 'set'],
  feSpecularLighting: [...DESCRIPTIVE, ...LIGHTS, 'animate', 'set'],
  ...Object.fromEntries([...TRANSFER_FUNCTIONS, ...LIGHTS].map((tag) => [tag, ['animate', 'set']])),
  animate: DESCRIPTIVE,
  animateTransform: DESCRIPTIVE,
  set: DESCRIPTIVE,
  animateMotion: [...DESCRIPTIVE, 'mpath'],
  mpath: DESCRIPTIVE,
};
// SVG_PARENTS: the tags that stand only inside the listed tags (a stop in a gradient, a filter primitive in a filter, a tspan in text).
export const SVG_PARENTS = {
  stop: ['linearGradient', 'radialGradient'],
  tspan: ['text', 'tspan', 'textPath', 'a'],
  textPath: ['text', 'a'],
  mpath: ['animateMotion'],
  feMergeNode: ['feMerge'],
  ...Object.fromEntries(FILTER_PRIMITIVES.map((tag) => [tag, ['filter']])),
  ...Object.fromEntries(TRANSFER_FUNCTIONS.map((tag) => [tag, ['feComponentTransfer']])),
  ...Object.fromEntries(LIGHTS.map((tag) => [tag, ['feDiffuseLighting', 'feSpecularLighting']])),
};
// The tags that hold text (a string or a binding) inside an svg, and nothing else inside an svg does.
export const SVG_TEXT_TAGS = ['text', 'tspan', 'textPath', 'title', 'desc'];
// The attributes a prop may be: the global ones, those of forms, links, images, tables and the elements above, the SVG ones, and the three that
// belong to agent-ui (`follow`, `soft`, `focus`). `data-*` and `aria-*` are allowed when something follows the prefix and the name has no space, quote, <, >, / or = (`isPrefixedAttribute`), and are not listed. A name that is not here is
// a typo or another framework's spelling, and is refused with the nearest name instead of becoming an attribute no browser reads.
export const ATTRIBUTES = (
  'class style title lang dir hidden tabindex role accesskey draggable contenteditable spellcheck translate autofocus inert slot part popover enterkeyhint inputmode ' +
  'id for name value type checked disabled readonly required placeholder min max step minlength maxlength pattern multiple selected size rows cols wrap ' +
  'autocomplete autocapitalize accept capture form formaction formmethod formnovalidate formtarget list open label novalidate method action enctype target ' +
  'href rel download hreflang ping referrerpolicy src alt width height loading decoding fetchpriority srcset sizes crossorigin usemap ismap ' +
  'colspan rowspan headers scope span abbr datetime cite start reversed high low optimum dirname media ' +
  'follow soft focus'
).split(' ').concat(SVG_ATTRIBUTES);
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
  svgTags: [...SVG_TAGS],
  svgAttributes: [...SVG_ATTRIBUTES],
  svgHolds: SVG_HOLDS,
  svgParents: SVG_PARENTS,
  svgTextTags: [...SVG_TEXT_TAGS],
  svgSharedTags: [...SVG_SHARED_TAGS],
  attributePrefixes: ATTRIBUTE_PREFIXES,
});
