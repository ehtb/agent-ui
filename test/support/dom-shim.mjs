// Minimal DOM and environment shim (zero dependencies) for headless tests.
// The DOM itself is src/server-dom.js (shared with server rendering); this file adds what tests need on top:
// a mutation counter so tests can assert update cost, focus tracking, and a window environment.
// Selector support is limited to "[attribute]" in closest/querySelectorAll; use findElements() for anything else.
import { DomElement, createServerDocument, domHooks } from '../../src/server-dom.js';

export const mutations = { count: 0 };
domHooks.mutated = () => {
  mutations.count++;
};

export class ShimElement extends DomElement {
  static focusedElement = null;

  constructor(localName, ownerDocument = null) {
    super(localName, ownerDocument);
    this.focusCount = 0;
  }
  get classNames() {
    return (this.attributes.class || '').split(' ').filter(Boolean);
  }
  focus() {
    ShimElement.focusedElement = this;
    this.focusCount++;
  }
}

export const shimDocument = createServerDocument(ShimElement);
// A real document tracks the focused element; the shim keeps it on the element class, because focus() is defined there.
Object.defineProperty(shimDocument, 'activeElement', { get: () => ShimElement.focusedElement });
globalThis.document = shimDocument;
globalThis.window = {};

// Fires an event that bubbles from `element` up through its ancestors, like input/change/keydown/click/focusout. The event has
// the two methods a real one has, so a handler that says `{ stopPropagation: true }` stops here as it would in a browser.
export const fireEvent = (element, type, properties = {}) => {
  let stopped = false;
  let defaultPrevented = false;
  const event = { type, target: element, ...properties };
  event.preventDefault ??= () => {
    defaultPrevented = true;
  };
  event.stopPropagation ??= () => {
    stopped = true;
  };
  Object.defineProperty(event, 'defaultPrevented', { get: () => defaultPrevented });
  for (let node = element; node && !stopped; node = node.parentElement) {
    for (const listener of node.listeners[type] || []) {
      listener(event);
      if (stopped) break;
    }
  }
  return event;
};

export const findElements = (root, predicate, found = []) => {
  for (const child of root.childNodes) {
    if (child instanceof ShimElement && predicate(child)) found.push(child);
    if (child.childNodes) findElements(child, predicate, found);
  }
  return found;
};
export const findByClass = (root, className) => findElements(root, (element) => element.classNames.includes(className));
export const findByTag = (root, tagName) => findElements(root, (element) => element.localName === tagName);

// Reads the markup `serialize()` writes (src/server-dom.js) into the children of `into`, the way a browser reads it: neighbouring texts
// are ONE text node, an empty text is no node, `value` and `checked` become the properties of the field, and a textarea's content is its
// value. It is not an HTML parser (no error recovery, no implied tags): it exists so that a test can give an app that takes over server
// markup (`adopt: true`) the nodes a browser would have made from the markup of a server render. Nodes are made without counting
// mutations, so a test counts what the app did after this.
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const unescape = (text) => text.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
export const parseHtml = (html, into) => {
  const before = mutations.count;
  const stack = [into];
  const current = () => stack[stack.length - 1];
  const addText = (text) => {
    if (!text) return;
    const last = current().lastChild;
    if (last?.nodeType === 3) last.currentData += text;
    else current().append(shimDocument.createTextNode(text));
  };
  const token = /<!--([\s\S]*?)-->|<\/([a-zA-Z0-9]+)>|<([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s=>]+(?:="[^"]*")?)*)\s*>|([^<]+)/g;
  for (const [, comment, closing, opening, attributeText, text] of html.matchAll(token)) {
    if (comment !== undefined) current().append(shimDocument.createComment(comment));
    else if (text !== undefined) {
      // A textarea holds its text as its value; the first newline after <textarea> and <pre> is dropped, as a parser does.
      addText(unescape(text));
    } else if (closing) {
      const element = stack.pop();
      if (element.localName === 'textarea') {
        element.currentValue = element.textContent;
      } else if (element.localName === 'select') {
        const selected = element.childNodes.find((child) => child.attributes && 'selected' in child.attributes);
        if (selected) element.currentValue = selected.attributes.value ?? selected.textContent;
      }
    } else {
      const element = shimDocument.createElement(opening);
      for (const [, name, value] of attributeText.matchAll(/([^\s=>]+)(?:="([^"]*)")?/g)) {
        const written = value === undefined ? '' : unescape(value);
        element.attributes[name] = written;
        if (name === 'value' && !['select', 'textarea', 'option'].includes(opening)) element.currentValue = written;
        if (name === 'checked') element.currentChecked = true;
        if (name === 'disabled') element.disabled = true;
      }
      current().append(element);
      if (!VOID.has(opening)) stack.push(element);
    }
  }
  mutations.count = before;
  return into;
};

// Window stub for a page at `path`: addEventListener/fireWindowEvent for any event type, a document whose title the page keeps
// current, and the location the page reads its URL from. setTimeout/clearTimeout are the real ones.
export const createWindow = (path = '/', search = '') => {
  const listeners = {};
  const win = {
    addEventListener: (type, listener) => (listeners[type] ??= []).push(listener),
    removeEventListener: (type, listener) => {
      listeners[type] = (listeners[type] || []).filter((registered) => registered !== listener);
    },
    fireWindowEvent: (type, properties = {}) => {
      const event = { type, target: win, ...properties };
      for (const listener of listeners[type] || []) listener(event);
    },
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (timer) => clearTimeout(timer),
    document: { addEventListener() {}, removeEventListener() {} },
    location: { pathname: path, search, hash: '' },
  };
  return win;
};

export const createRoot = () => {
  const root = new ShimElement('div');
  root.attributes.id = 'app';
  return root;
};
