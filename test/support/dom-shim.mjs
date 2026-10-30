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

// Fires an event that bubbles from `element` up through its ancestors, like input/change/keydown/click/focusout.
export const fireEvent = (element, type, properties = {}) => {
  const event = { type, target: element, ...properties };
  for (let node = element; node; node = node.parentElement) {
    for (const listener of node.listeners[type] || []) listener(event);
  }
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
