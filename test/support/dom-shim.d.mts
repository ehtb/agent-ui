/** A small DOM for headless tests. Not a browser: see the "Testing" section of API.md. */
export class ShimElement {
  /** The element that last took the focus (set by focus()). */
  static focusedElement: ShimElement | null;
  constructor(localName: string, ownerDocument?: any);
  localName: string;
  attributes: Record<string, string>;
  childNodes: any[];
  parentElement: ShimElement | null;
  readonly textContent: string;
  readonly dataset: Record<string, string>;
  /** How many times focus() was called on it. */
  focusCount: number;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  hasAttribute(name: string): boolean;
  /** Only "[attribute]" selectors are supported; use findElements() for anything else. */
  querySelectorAll(selector: string): ShimElement[];
  closest(selector: string): ShimElement | null;
  value?: string;
  checked?: boolean;
  disabled?: boolean;
  readonly classNames: string[];
  focus(): void;
}
export const mutations: { count: number };
export const shimDocument: any;
export function fireEvent(element: ShimElement, type: string, properties?: Record<string, unknown>): void;
export function findElements(root: any, predicate: (element: ShimElement) => boolean): ShimElement[];
export function findByClass(root: any, className: string): ShimElement[];
export function findByTag(root: any, tagName: string): ShimElement[];
export function createWindow(path?: string, search?: string): any;
export function createRoot(): ShimElement;
