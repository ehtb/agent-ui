import type { AppApi, Namespaces, OutlineNode, Plugin, SpecNode, StateSnapshot } from '../../src/ui.js';

export function mountSpec(options: { namespaces?: Namespaces; initialState?: StateSnapshot; spec: SpecNode; plugins?: Plugin[]; dev?: boolean }): { ui: AppApi; root: any };
export function sleep(milliseconds: number): Promise<void>;
/** Polls until `condition()` is true; throws, naming the condition, after `timeout` milliseconds (default 3000). Use it instead of a fixed `sleep` to wait for a timer. */
export function waitFor(condition: () => unknown, options?: { timeout?: number; interval?: number }): Promise<void>;
/** Lets pending promises, zero-millisecond timers and scheduled UI updates finish. */
export function flushAsync(ui: AppApi): Promise<void>;
/** A fetch whose answers you control; `calls` records every request. */
export function createFakeFetch(respond: (url: string, options?: RequestInit) => unknown): ((url: string, options?: RequestInit) => Promise<any>) & { calls: { url: string; options?: RequestInit }[] };
export function deferred<T = unknown>(): Promise<T> & { resolve(value?: T): void };
export function outlineById(outline: OutlineNode[], id: string): OutlineNode | undefined;
/** Throws with the messages of `ui.errors` when the app reported any. */
export function assertNoErrors(ui: AppApi): void;
export function assertRepeatable(ui: AppApi, actionName: string, args?: Record<string, unknown>): Promise<void>;
/** What one action costs, counted (not timed): DOM writes on the test DOM, state keys replaced, derived values changed, elements shown. */
export function measureAction(ui: AppApi, actionName: string, args?: Record<string, unknown>): Promise<{ domWrites: number; effectRuns: number; stateChanged: string[]; derivedChanged: string[]; elements: number; elementsBefore: number }>;
/** Throws when an action costs more than its limits (upper bounds on domWrites, effectRuns, stateChanged, derivedChanged, elements); returns the measurement. */
export function assertCost(ui: AppApi, actionName: string, args: Record<string, unknown> | undefined, limits: { domWrites?: number; effectRuns?: number; stateChanged?: number; derivedChanged?: number; elements?: number }): Promise<ReturnType<typeof measureAction> extends Promise<infer T> ? T : never>;
