import type { SpecNode } from './ui.js';

/** What a param may declare. `{}` is a required param; `options` makes it a variant. */
export interface ParamDeclaration {
  /** Used when the param is omitted. For a variant it is one of the option keys. */
  default?: unknown;
  /** Variant: the use writes a key, the component spec receives the mapped string. */
  options?: Record<string, string>;
  /** When omitted, whatever holds {param: name} disappears. Cannot be combined with `default`. */
  optional?: boolean;
  /** Checked against literal values at the use. Bindings pass for string, number and boolean. */
  type?: 'string' | 'number' | 'boolean' | 'handler' | 'node';
}
export interface ComponentDefinition {
  /** A list of names (all required) or an object of declarations; leave it out for a component without params. */
  params?: string[] | Record<string, ParamDeclaration>;
  spec: object;
}
export type ComponentUse = { use: string; with?: Record<string, unknown>; children?: ComponentChild | ComponentChild[] };
export type ComponentChild = SpecNode | ComponentUse;
/** Expands {use, with, children} nodes into plain spec. Throws an Error whose message lists the problems, one per line; they are also on `error.problems`. */
export function expandComponents(spec: object, components?: Record<string, ComponentDefinition | ElementFunction<any>> | ElementFunction<any>[]): SpecNode;

type Declarations = Record<string, ParamDeclaration>;
type OptionKeys<Declaration> = Declaration extends { options: infer Options } ? keyof Options & string : never;
type ParamValue<Declaration> = [OptionKeys<Declaration>] extends [never] ? unknown : OptionKeys<Declaration>;
type IsOptional<Declaration> = Declaration extends { default: unknown } | { optional: true } ? true : false;
type RequiredNames<Params extends Declarations> = { [Name in keyof Params]: IsOptional<Params[Name]> extends true ? never : Name }[keyof Params];
/** The `with` object of a use: required params must be given, variants only accept their option keys. */
export type ParamValues<Params extends Declarations> = { [Name in RequiredNames<Params>]: ParamValue<Params[Name]> } & {
  [Name in Exclude<keyof Params, RequiredNames<Params>>]?: ParamValue<Params[Name]>;
};
/** What defineElement returns: call it like a builder, params first (or null when there are none to give), then children. */
export interface ElementFunction<Params extends Declarations = Declarations> {
  (...args: [RequiredNames<Params>] extends [never] ? [values?: ParamValues<Params> | null, ...children: Array<ComponentChild | ComponentChild[]>] : [values: ParamValues<Params> | null, ...children: Array<ComponentChild | ComponentChild[]>]): ComponentUse;
  componentName: string;
  definition: ComponentDefinition;
}
/** Defines a component for use with the builders (see @ehtb/agent-ui/spec). Mistakes are reported at the call that makes them. */
export function defineElement(name: string, definition: { params: string[]; spec: object }): ElementFunction<Record<string, {}>>;
export function defineElement<Params extends Declarations = {}>(name: string, definition: { params?: Params; spec: object }): ElementFunction<Params>;
/** { param: name }: the value given for the param. */
export function param(name: string): { param: string };
/** { param: name, key: true }: the option key a variant was written with. */
export function paramKey(name: string): { param: string; key: true };
/** { slot: 'children' }: where the children of the use go. */
export function slot(): { slot: 'children' };
