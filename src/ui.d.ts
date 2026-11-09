// Type declarations for `@ehtb/agent-ui` (src/ui.js). Reference: docs/API.md and docs/AGENT-RULES.md in this package. Plain JS projects get editor checking with `// @ts-check`; no build step involved.
// The runtime validator remains the authority on semantics (action names, argument types, ids, accessibility).

export type Literal = string | number | boolean | null;
export type Operand = Literal | Binding | { param: string };
/** The path of state(...) ("namespace.key", then any path inside the value), item(...) and the name of an action ("namespace.verb"): a string, or a join built at the use. {param} exists only inside component definitions and is gone after expandComponents. */
export type PathOperand = string | { join: [Operand, ...Operand[]] } | { param: string };
export type Binding =
  | { state: PathOperand }
  | { item: PathOperand }
  /** "name.field" of a row of an enclosing each that says `as: 'name'`; "name" alone is the whole item. */
  | { row: PathOperand }
  /** "namespace.field" of the namespace's rowState for the row of the innermost each, or "rowname.namespace.field" for the row an enclosing each names with `as`. */
  | { rowState: PathOperand }
  | { not: Operand }
  | { length: Operand }
  | { equals: [Operand, Operand] }
  | { greaterThan: [Operand, Operand] }
  | { lessThan: [Operand, Operand] }
  | { and: [Operand, Operand, ...Operand[]] }
  | { or: [Operand, Operand, ...Operand[]] }
  | { join: [Operand, ...Operand[]] };

export type ArgumentType = 'string' | 'number' | 'boolean' | 'json';
export type HandlerArgument = Literal | object | { state: string } | { item: string } | { row: string } | { event: string };
export type Handler = [
  action: PathOperand,
  args?: Record<string, HandlerArgument>,
  options?: { preventDefault?: boolean; stopPropagation?: boolean },
];
/** One handler, or a list of at least two that run in order, each as its own logged action. */
export type Handlers = Handler | Handler[];

export interface ElementNode {
  tag: string;
  id?: string;
  /** `focus`, `follow` and `soft` are not plain attributes: `focus: true` focuses the element, `follow: <boolean>` makes it track the pointer (--follow-x, --follow-y), `soft: true` on a link (`a`) makes following it a soft navigation (a page swap, src/navigation.js) when the page has a shell that listens. */
  props?: Record<string, Literal | Binding>;
  classes?: Record<string, Binding>;
  on?: Record<string, Handlers>;
  /** Milliseconds; adds data-transition="enter"/"leave" to rows and branches after the first render, and slides a keyed row that changes position. */
  transition?: number;
  children?: SpecNode | SpecNode[];
}
export interface EachNode {
  /** A qualified key ("todos.visible") or a binding for a nested list. */
  each: string | Binding;
  key: string;
  /** Names this row for the template, at any depth: {row: 'name.field'} reads it from a nested each too (item reads the innermost row only). */
  as?: string;
  template: ElementNode;
}
export interface WhenNode {
  when: Binding;
  children?: SpecNode | SpecNode[];
  otherwise?: SpecNode | SpecNode[];
}
export type SpecNode = string | Binding | ElementNode | EachNode | WhenNode;

/**
 * What an action receives. Keys of its own namespace are written without the prefix ("draft"); keys of other namespaces,
 * for reading only, with it ("search.query"). Writing another namespace throws: use call(...) for an action listed in `calls`.
 */
export interface Store {
  get(key: string): any;
  set(key: string, value: unknown): void;
  /** Only in a namespace with rowState. All fields of one row (the key of the list's rows): the defaults with what the row changed laid over them. */
  getRow(id: string | number): Record<string, any>;
  /** Only in a namespace with rowState. Changes some fields of one row; a row equal to the defaults is dropped. */
  setRow(id: string | number, changes: Record<string, unknown>): void;
  /** Only in a namespace with rowState. Forgets one row (back to the defaults). */
  clearRow(id: string | number): void;
}
/** Runs an action of another namespace (listed in the caller's `calls`) inside the caller's undo scope. */
export type Call = (name: string, args?: Record<string, unknown>) => void;
export interface ActionDefinition<Args = any> {
  args: Record<string, ArgumentType>;
  /** Qualified names of actions in OTHER namespaces this action may call. Those actions cannot declare `calls` themselves. */
  calls?: string[];
  run: (store: Store, args: Args, call: Call) => void;
}
export type Actions = Record<string, ActionDefinition>;
/** `get` reads the namespace's own keys unqualified and other namespaces' keys as "namespace.key". */
export type Derive = Record<string, (get: (key: string) => any) => unknown>;
export interface Namespace {
  state?: Record<string, any>;
  derive?: Derive;
  actions?: Actions;
  /** Network resources of this namespace (read by the resources plugin, @ehtb/agent-ui/resources). */
  resources?: import('./resources.js').ResourceDefinition[];
  /** What one item of a list looks like, by state key or derived name. See docs/API.md, "Shapes". */
  shapes?: Record<string, Shape>;
  /**
   * State that belongs to the rows of a list, with the default of each field. The values live in the state key `rowState`
   * ({ [rowKey]: { field: value } }, only rows that differ), are written with store.setRow, and read with the rowState(...) binding.
   */
  rowState?: Record<string, any>;
}
/**
 * The shape of the items of a list. `fields` (name -> type, "json" for any value) is checked statically against `{item}`
 * bindings and, in development, against every write; `validate` returns a message for an item that is wrong, or null. It is
 * the hook for a runtime type checker such as zod; the framework never imports one.
 */
export interface Shape {
  fields?: Record<string, ArgumentType>;
  validate?: (item: any) => string | null | undefined;
}
export type Namespaces = Record<string, Namespace>;
/** The shape of ui.state(): { namespace: { key: value } }. */
export type StateSnapshot = Record<string, Record<string, any>>;

/** What an onError handler receives. `code` is AUI and four digits (docs/API.md, section 9); `details` is small plain data; in a production build `message` is the code and the details. */
export interface ErrorReport {
  code: string;
  details: Record<string, unknown>;
  message: string;
  error: unknown;
  /** The action that failed or was running, when there is one. */
  action: string | null;
  app: AppApi | null;
}

export interface AppApi {
  dispatch(name: string, args?: Record<string, unknown>): string | undefined;
  settle(): Promise<void>;
  log: Array<[string, Record<string, unknown>]>;
  errors: string[];
  /** { namespace: { key: value } } */
  state(): StateSnapshot;
  /** The same shape, for derived values. */
  derived(): StateSnapshot;
  /** Qualified action name ("todos.add") to its declared arguments. */
  actions(): Record<string, Record<string, ArgumentType>>;
  /** What app() was given. */
  namespaces(): Namespaces;
  /** Every qualified state key and derived name: ["todos.items", "todos.remaining", ...]. */
  keys(): string[];
  /** The current value of one qualified state key or derived value. */
  get(key: string): any;
  /** For plugins that read a part of the declarations: says it was read ("resources"), so an unread declaration is reported. */
  claim(feature: string): void;
  /** The spec the app renders (what @ehtb/agent-ui/mount-element reads to know which element ids exist). */
  spec(): SpecNode;
  /**
   * observer.added(element) is called for every element in the page now and for each one that arrives later (once it is in the page);
   * observer.removed(node) when a node leaves it. Returns a function that stops observing. @ehtb/agent-ui/mount-element is built on this.
   */
  observeElements(observer: { added(element: Element): void; removed(node: Node): void }): () => void;
  /** The plugin that writes a prop the grammar leaves to a plugin (`follow`: @ehtb/agent-ui/follow) takes its writes, also those made before it was installed. */
  handleProperty(name: 'follow', handler: (element: Element, value: unknown) => void): void;
  /** Called before every reorder of a list with the row elements that stay; the function it returns runs after the rows are placed (@ehtb/agent-ui/moves). Returns a function that removes it. */
  onReorder(handler: (rowElements: Element[]) => void | (() => void) | null): () => void;
  /** `keys` are qualified; the callback receives { "namespace.key": value }. */
  watch(keys: string[], callback: (values: Record<string, any>) => void, options?: { owns?: { where: string; keys: string[]; allowedActions: string[]; message: (key: string) => string } }): () => void;
  tree(): Array<{ id: string; key?: string; tag: string; label: string; value?: string; checked?: boolean; href?: string; on: Record<string, string | string[]> }>;
  outline(): OutlineNode[];
  readonly replaying: boolean;
  /** Stops the app (effects, event listeners, the cleanups plugins registered with onDestroy) and empties its root. Later dispatches do nothing. */
  destroy(): void;
  readonly destroyed: boolean;
  /** For plugins that hold something outside the app (a timer, a request in flight, a window listener): called by destroy(). */
  onDestroy(cleanup: () => void): void;
  /** Calls the handler when replay() starts, so a plugin can drop what it has in flight (a request, a timer) even if no key it watches changes. */
  onReplay(handler: () => void): void;
  /** Calls the handler for every error the runtime catches and does not throw again. Returns a function that removes it. */
  onError(handler: (report: ErrorReport) => void): () => void;
  /** Calls the handler after every logged action with its name and arguments, and whether the app is replaying. Returns a function that removes it. */
  onAction(handler: (action: { name: string; args: Record<string, unknown>; replaying: boolean }) => void): () => void;
  /** Hands over an error a plugin caught: it is kept in `errors`, written to the console and shown to the onError handlers. */
  report(error: unknown): string;
  /** Only on apps made by definePage: does the current page say it is ready? undefined when it declares no `ready`. */
  isReady?(): boolean | undefined;
  /** Only on apps made by definePage: the current page's HTTP status; undefined when it declares no `status`. */
  getStatus?(): number | undefined;
  replay(actionLog?: Array<[string, Record<string, unknown>]>): Promise<StateSnapshot>;
}
export interface OutlineNode {
  id: string;
  key?: string;
  tag: string;
  text?: string;
  classes?: string[];
  value?: string;
  checked?: boolean;
  children?: OutlineNode[];
}
export type Plugin = (api: AppApi) => void;

export interface AppOptions {
  /** Every state key, derived value and action belongs to one namespace (docs/API.md, "Namespaces"). Default: none (a page that only displays text). */
  namespaces?: Namespaces;
  /** Start from this state instead of the declared one: { namespace: { key: value } }, only declared keys. */
  initialState?: StateSnapshot;
  spec: SpecNode;
  root: Element | { replaceChildren(...nodes: any[]): void };
  plugins?: Plugin[];
  /** Required. true freezes state so an in-place mutation fails loudly and reports mistakes; false is for production. There is no default: the mode is always written down. */
  dev: boolean;
  /** True makes the browser console show what the app does: the state, and every action with what it changed (docs/API.md, "The debug console"). Default false. */
  debug?: boolean;
  /** The path the site is served below, for example '/shop' (docs/BUILD.md, "A site below a base path"): written before every root-absolute URL the app puts in the page. Default '' (the root). Pages get it from the build. */
  basePath?: string;
  /** The caller checks this same spec and namespaces before (a server makes one app per request): skip walking an unchanged spec again. */
  specChecked?: boolean;
}

export function app(options: AppOptions): AppApi;
/** How many times effects (bindings, derived values, watches) have run in this process: the counter measureAction reads. */
export function countEffectRuns(): number;
export function validate(spec: SpecNode, context?: { namespaces?: Namespaces; initialState?: StateSnapshot }): string[];
/** Lays partial states over each other, namespace by namespace and key by key; later ones win. */
export function mergeInitialState(...partialStates: Array<StateSnapshot | null | undefined>): StateSnapshot;
export function signal<Value>(initialValue?: Value): { get(): Value; peek(): Value; set(value: Value): void };
export function effect(callback: () => void): () => void;
export function settle(): Promise<void>;
export function eventKeyName(event: { key: string; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; metaKey?: boolean }): string;
export const grammar: Readonly<{
  tags: string[];
  voidTags: string[];
  events: string[];
  keyEvents: string[];
  keyModifiers: string[];
  bindingKeys: string[];
  argumentTypes: ArgumentType[];
  nodeKeys: { element: string[]; each: string[]; when: string[] };
  handlerOptions: string[];
  attributes: string[];
  attributePrefixes: string[];
  /** The SVG tags (also in `tags`), drawn in the SVG namespace. */
  svgTags: string[];
  /** The attributes that belong on an SVG tag only (also in `attributes`). */
  svgAttributes: string[]; // data-* and aria-* names are accepted when something follows the prefix and the name has no space, quote, <, >, / or =
}>;

export function isPlainObject(value: unknown): value is Record<string, unknown>;
export function toArray<Item>(children: Item | Item[] | null | undefined): Item[];
export function isSameValue(previous: unknown, next: unknown, depth: number): boolean;
export function readEventPath(event: unknown, path: string): unknown;
