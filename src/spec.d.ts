// Type declarations for `@ehtb/agent-ui/spec` (src/spec.js). Reference: docs/API.md "Builders".
import type { ComponentUse } from './components.js';
import type { PathOperand, Binding, ElementNode, EachNode, Handler, Handlers, HandlerArgument, Literal, Operand, SpecNode, WhenNode } from './ui.js';

/** Placeholders of a component definition: param(...), paramKey(...) and slot() from @ehtb/agent-ui/components. */
export type Placeholder = { param: string; key?: true } | { slot: 'children' };
export type AttributeValue = Literal | Binding | Placeholder;
/** The attributes of an element: id, classes, on and transition keep their meaning, everything else is a prop. */
export interface Attributes {
  /** The element's address in the spec (rendered as data-id), used by patchSpec, tree() and the action log. */
  id?: string;
  /** The HTML id attribute, for `for` and aria-* references. Becomes props.id. */
  domId?: string;
  classes?: Record<string, Binding | Placeholder>;
  on?: Record<string, Handlers | Placeholder>;
  /** Milliseconds. */
  transition?: number;
  [prop: string]: AttributeValue | Record<string, Binding | Placeholder> | Record<string, Handlers | Placeholder> | undefined;
}
/** A component made by defineElement (@ehtb/agent-ui/components) is a child like any element; expandComponents turns it into one. */
export type Child = SpecNode | ComponentUse | Placeholder | Child[];
export type ElementBuilder = (attributes: Attributes | null, ...children: Child[]) => ElementNode;

export function state(path: PathOperand): { state: PathOperand };
export function item(path: PathOperand): { item: PathOperand };
/** A field of a row of an enclosing each that says `as` ("order.total"), or the whole item ("order"). */
export function row(path: PathOperand): { row: PathOperand };
/** A field of the namespace's rowState ("pickers.open") for the row of the innermost each, or ("order.pickers.open") for the row an enclosing each names with `as`. */
export function rowState(path: PathOperand): { rowState: PathOperand };
/** Only valid as a handler argument. */
export function event(path: string): { event: string };
export function not(operand: Operand): { not: Operand };
export function length(operand: Operand): { length: Operand };
export function equals(first: Operand, second: Operand): { equals: [Operand, Operand] };
export function greaterThan(first: Operand, second: Operand): { greaterThan: [Operand, Operand] };
export function lessThan(first: Operand, second: Operand): { lessThan: [Operand, Operand] };
export function and(first: Operand, second: Operand, ...rest: Operand[]): { and: [Operand, Operand, ...Operand[]] };
export function or(first: Operand, second: Operand, ...rest: Operand[]): { or: [Operand, Operand, ...Operand[]] };
export function join(first: Operand, ...rest: Operand[]): { join: [Operand, ...Operand[]] };

export function act(name: PathOperand, args?: Record<string, HandlerArgument>, options?: { preventDefault?: boolean; stopPropagation?: boolean }): Handler;
export function when(condition: Binding, children?: Child | Child[] | null, otherwise?: Child | Child[] | null): WhenNode;
/** One row per item of a state or derived list. `key` names a field that is unique for every item of the whole list and never missing (`"."` when the item itself is the key), also for lists built in `derive` or `initialState` and inside a `when` branch that is not shown at first: the later item of a duplicate is dropped (AUI0303). `agent-ui check` reports it. */
export function each(source: string | Binding, key: string, template: ElementNode | ComponentUse | Placeholder, options?: { as: string }): EachNode;

export const div: ElementBuilder;
/** Where a shell holds the page: the element the page's app renders into (HTML id "app"). Once per shell, and not inside a when or an each. */
export function pageSlot(): ElementNode;
export const span: ElementBuilder;
export const p: ElementBuilder;
export const h1: ElementBuilder;
export const h2: ElementBuilder;
export const h3: ElementBuilder;
export const ul: ElementBuilder;
export const ol: ElementBuilder;
export const li: ElementBuilder;
export const button: ElementBuilder;
export const input: ElementBuilder;
export const label: ElementBuilder;
export const a: ElementBuilder;
export const section: ElementBuilder;
export const header: ElementBuilder;
export const footer: ElementBuilder;
export const main: ElementBuilder;
export const nav: ElementBuilder;
export const form: ElementBuilder;
export const select: ElementBuilder;
export const option: ElementBuilder;
export const textarea: ElementBuilder;
export const strong: ElementBuilder;
export const em: ElementBuilder;
export const b: ElementBuilder;
export const i: ElementBuilder;
export const small: ElementBuilder;
export const code: ElementBuilder;
export const pre: ElementBuilder;
export const blockquote: ElementBuilder;
export const hr: ElementBuilder;
export const br: ElementBuilder;
export const img: ElementBuilder;
export const table: ElementBuilder;
export const thead: ElementBuilder;
export const tbody: ElementBuilder;
export const tfoot: ElementBuilder;
export const tr: ElementBuilder;
export const th: ElementBuilder;
export const td: ElementBuilder;
export const caption: ElementBuilder;
export const dl: ElementBuilder;
export const dt: ElementBuilder;
export const dd: ElementBuilder;
export const details: ElementBuilder;
export const summary: ElementBuilder;
export const dialog: ElementBuilder;
export const aside: ElementBuilder;
export const article: ElementBuilder;
export const fieldset: ElementBuilder;
export const legend: ElementBuilder;
export const figure: ElementBuilder;
export const figcaption: ElementBuilder;
export const progress: ElementBuilder;
export const time: ElementBuilder;
/** SVG for icons and simple drawings: shapes stand inside an svg; an svg has aria-label (with role: 'img') or 'aria-hidden': 'true'. */
export const svg: ElementBuilder;
export const g: ElementBuilder;
export const path: ElementBuilder;
export const circle: ElementBuilder;
export const ellipse: ElementBuilder;
export const rect: ElementBuilder;
export const line: ElementBuilder;
export const polyline: ElementBuilder;
export const polygon: ElementBuilder;
export const use: ElementBuilder;
