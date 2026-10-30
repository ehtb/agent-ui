import type { ElementNode, SpecNode } from './ui.js';

export type PatchOperation =
  | { op: 'set'; id: string; changes: Record<string, unknown> }
  | { op: 'insert'; parentId: string; index?: number; node: SpecNode }
  | { op: 'remove'; id: string }
  | { op: 'move'; id: string; parentId: string; index?: number };
export function patchSpec(spec: SpecNode, operations: PatchOperation[], context?: { namespaces: object } | null): { ok: true; spec: SpecNode } | { ok: false; problems: string[] };
export function listIds(spec: SpecNode): Array<{ id: string; tag: string }>;
export type { ElementNode };
