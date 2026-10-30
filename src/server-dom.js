// A minimal DOM: just the parts of the DOM API that src/ui.js uses, plus serialization to HTML.
// Two users share it, so there is one implementation to keep correct:
//   - server rendering (server/render-page.js)
//   - the headless test shim (test/support/dom-shim.mjs), which subclasses DomElement and counts mutations through `domHooks`
// Why a DOM instead of a second string renderer: the page is produced by the very same runtime code that runs in the
// browser, so server and client output cannot drift apart, and there is only one set of render semantics to learn.
//
//   const document = createServerDocument();
//   const root = document.createElement('div');
//   app({ ..., root });                 // app() picks up root.ownerDocument
//   serialize(root)                     // HTML string of root's children

import { escapeAttribute, escapeText } from './html-escape.js';

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const BOOLEAN_PROPERTIES = ['disabled'];


// Called once per DOM write that a browser would perform (insert, move, remove, attribute, text, value, checked).
// Tests replace it to count update cost; it does nothing in production.
export const domHooks = { mutated: () => {} };

// Children are a doubly linked list, like a real DOM: insert, remove and nextSibling are O(1), so rendering
// thousands of rows is linear and timings measured through the test shim reflect the runtime, not the DOM.
export class DomNode {
  constructor() {
    this.parentNode = null;
    this.previousSibling = null;
    this.nextSibling = null;
    this.firstChild = null;
    this.lastChild = null;
  }
  get childNodes() {
    const nodes = [];
    for (let child = this.firstChild; child; child = child.nextSibling) nodes.push(child);
    return nodes;
  }
  get parentElement() {
    return this.parentNode instanceof DomElement ? this.parentNode : null;
  }
  // Unlinks this node from its parent without counting a mutation (used when moving nodes).
  detach() {
    const parent = this.parentNode;
    if (!parent) return;
    if (this.previousSibling) this.previousSibling.nextSibling = this.nextSibling;
    else parent.firstChild = this.nextSibling;
    if (this.nextSibling) this.nextSibling.previousSibling = this.previousSibling;
    else parent.lastChild = this.previousSibling;
    this.parentNode = null;
    this.previousSibling = null;
    this.nextSibling = null;
  }
  insertBefore(node, reference = null) {
    if (node instanceof DomFragment) {
      for (const child of node.childNodes) {
        child.detach();
        this.insertBefore(child, reference);
      }
      return node;
    }
    if (node === reference) return node;
    if (node.parentNode) {
      node.detach();
      domHooks.mutated();
    }
    node.parentNode = this;
    node.nextSibling = reference;
    node.previousSibling = reference ? reference.previousSibling : this.lastChild;
    if (node.previousSibling) node.previousSibling.nextSibling = node;
    else this.firstChild = node;
    if (reference) reference.previousSibling = node;
    else this.lastChild = node;
    domHooks.mutated();
    return node;
  }
  append(...nodes) {
    for (const node of nodes) this.insertBefore(typeof node === 'string' ? new DomText(node) : node, null);
  }
  remove() {
    if (!this.parentNode) return;
    this.detach();
    domHooks.mutated();
  }
  // Puts `node` where this one is and takes this one out (the browser's Element.replaceWith, for one node).
  replaceWith(node) {
    this.parentNode.insertBefore(node, this);
    this.remove();
  }
  removeChild(child) {
    child.remove();
    return child;
  }
  replaceChildren(...nodes) {
    for (const child of this.childNodes) child.detach();
    this.append(...nodes);
  }
  get textContent() {
    return this.childNodes.map((child) => child.textContent).join('');
  }
}

export class DomFragment extends DomNode {
  nodeType = 11;
}

export class DomComment extends DomNode {
  nodeType = 8;
  constructor(data = '') {
    super();
    this.data = data;
  }
  get textContent() {
    return '';
  }
}

export class DomText extends DomNode {
  nodeType = 3;
  constructor(data) {
    super();
    this.currentData = String(data);
  }
  get data() {
    return this.currentData;
  }
  set data(value) {
    const text = String(value);
    if (text === this.currentData) return;
    this.currentData = text;
    domHooks.mutated();
  }
  get textContent() {
    return this.currentData;
  }
}

// Selector support is limited to "[attribute]" in closest/querySelectorAll, which is all the runtime needs.
export class DomElement extends DomNode {
  nodeType = 1;
  constructor(tagName, ownerDocument = null) {
    super();
    this.localName = tagName.toLowerCase();
    this.ownerDocument = ownerDocument;
    this.attributes = {};
    this.listeners = {};
    this.currentValue = '';
    this.currentChecked = false;
    this.disabled = false;
  }
  setAttribute(name, value) {
    const text = String(value);
    if (this.attributes[name] === text) return;
    this.attributes[name] = text;
    domHooks.mutated();
  }
  getAttribute(name) {
    return this.attributes[name] ?? null;
  }
  getAttributeNames() {
    return Object.keys(this.attributes);
  }
  hasAttribute(name) {
    return name in this.attributes;
  }
  removeAttribute(name) {
    if (!(name in this.attributes)) return;
    delete this.attributes[name];
    domHooks.mutated();
  }
  get dataset() {
    const data = {};
    for (const name in this.attributes) {
      if (name.startsWith('data-')) data[name.slice('data-'.length)] = this.attributes[name];
    }
    return data;
  }
  get value() {
    return this.currentValue;
  }
  set value(value) {
    this.currentValue = String(value);
    // An option's value is its attribute: an empty one must stay written, or the text of the option becomes its value.
    if (this.localName === 'option') this.setAttribute('value', this.currentValue);
    else domHooks.mutated();
  }
  get checked() {
    return this.currentChecked;
  }
  set checked(value) {
    this.currentChecked = Boolean(value);
    domHooks.mutated();
  }
  focus() {}
  addEventListener(type, listener) {
    (this.listeners[type] ??= []).push(listener);
  }
  removeEventListener(type, listener) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((registered) => registered !== listener);
  }
  // The first element below this one with the given HTML id (the server renderer looks for the slot of a shell with it).
  findById(id) {
    for (let child = this.firstChild; child; child = child.nextSibling) {
      if (child instanceof DomElement) {
        if (child.attributes.id === id) return child;
        const inner = child.findById(id);
        if (inner) return inner;
      }
    }
    return null;
  }
  closest(selector) {
    const attribute = selector.slice(1, -1);
    for (let element = this; element; element = element.parentElement) {
      if (attribute in element.attributes) return element;
    }
    return null;
  }
  querySelectorAll(selector) {
    const attribute = selector.slice(1, -1);
    const found = [];
    const visit = (node) => {
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child instanceof DomElement && attribute in child.attributes) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }
}

// `ElementClass` lets the test shim create its richer elements through the same factory.
export const createServerDocument = (ElementClass = DomElement) => {
  const document = {
    createElement: (tagName) => new ElementClass(tagName, document),
    createTextNode: (data) => new DomText(data),
    createComment: (data) => new DomComment(data),
    createDocumentFragment: () => new DomFragment(),
  };
  return document;
};

// Properties that the runtime sets as JS properties but that must appear as markup.
const serializeAttributes = (element, selectedValue) => {
  const attributes = { ...element.attributes };
  const tag = element.localName;
  // `value` is a JS property in the runtime, so it has to be written out as an attribute (textarea and select are
  // special: content and `selected`, handled in serializeNode; an option's value is its attribute, set by the setter).
  if (tag !== 'select' && tag !== 'textarea' && tag !== 'option' && element.currentValue !== '') attributes.value = element.currentValue;
  if (element.currentChecked) attributes.checked = '';
  if (tag === 'option' && selectedValue !== undefined && attributes.value === selectedValue) attributes.selected = '';
  for (const name of BOOLEAN_PROPERTIES) {
    if (element[name]) attributes[name] = '';
  }
  return Object.entries(attributes)
    .map(([name, value]) => (value === '' ? ` ${name}` : ` ${name}="${escapeAttribute(value)}"`))
    .join('');
};

// Serializes into one output list. Walking the linked children instead of building an array and a joined string at every
// level keeps a large page linear: no intermediate arrays and no copying of a child's text into its parent's string.
const appendNode = (node, selectedValue, output) => {
  if (node.nodeType === 3) {
    output.push(escapeText(node.data));
    return;
  }
  if (node.nodeType === 8) {
    output.push(`<!--${node.data}-->`);
    return;
  }
  if (node.nodeType === 11) {
    for (let child = node.firstChild; child; child = child.nextSibling) appendNode(child, selectedValue, output);
    return;
  }
  const tag = node.localName;
  output.push(`<${tag}${serializeAttributes(node, selectedValue)}>`);
  if (VOID_TAGS.has(tag)) return;
  // A textarea's value is its content; a select's value becomes `selected` on the matching option.
  if (tag === 'textarea') output.push(escapeText(node.currentValue));
  else {
    const childSelected = tag === 'select' ? node.currentValue : tag === 'optgroup' ? selectedValue : undefined;
    for (let child = node.firstChild; child; child = child.nextSibling) appendNode(child, childSelected, output);
  }
  output.push(`</${tag}>`);
};

// HTML of the node's children (innerHTML-like).
export const serialize = (node) => {
  const output = [];
  for (let child = node.firstChild; child; child = child.nextSibling) appendNode(child, undefined, output);
  return output.join('');
};
