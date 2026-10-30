// Atomic edits of a spec as data, addressed by explicit element `id` (not by position or text).
// For agents that generate or modify UI specs programmatically: the whole batch is applied to a copy and validated;
// if anything is wrong nothing is returned except the list of problems.
//
//   patchSpec(spec, [
//     { op: 'set', id: 'title', changes: { children: 'New title', props: null } },    null deletes a key
//     { op: 'insert', parentId: 'list', index: 0, node: { tag: 'li', children: 'first' } },
//     { op: 'remove', id: 'old-banner' },
//     { op: 'move', id: 'footer', parentId: 'page', index: 1 },
//   ], { namespaces })    // context is optional; when given, the result is run through validate()
//   -> { ok: true, spec } | { ok: false, problems: [...] }
import { validate } from './validate.js';
import { isPlainObject } from './spec-core.js';
import { didYouMean } from './messages.js';
import { ELEMENT_KEYS } from './grammar.js';
import { checkUnknownKeys } from './handler-checks.js';
import { visitSpec } from './spec-walk.js';

// Finds the element with `id`: { node, parent, slot, index }, or null.
const findElementById = (root, id) => visitSpec(root, (node, location) => (node.tag && node.id === id ? { node, ...location } : undefined)) ?? null;

// Every explicit id in the spec, in document order.
export const listIds = (spec) => {
  const ids = [];
  visitSpec(spec, (node) => {
    if (node.tag && node.id !== undefined) ids.push({ id: node.id, tag: node.tag });
  });
  return ids;
};

const childList = (parent) => {
  if (parent.children === undefined) parent.children = [];
  else if (!Array.isArray(parent.children)) parent.children = [parent.children];
  return parent.children;
};

const detach = (location) => {
  const { parent, slot, index } = location;
  if (Array.isArray(parent[slot])) parent[slot].splice(index, 1);
  else delete parent[slot];
};

// The shape of each operation: its keys, and which of them must be there. Anything else is refused, never ignored.
const OPERATIONS = {
  set: { keys: ['op', 'id', 'changes'], required: ['id', 'changes'] },
  insert: { keys: ['op', 'parentId', 'index', 'node'], required: ['parentId', 'node'] },
  remove: { keys: ['op', 'id'], required: ['id'] },
  move: { keys: ['op', 'id', 'parentId', 'index'], required: ['id', 'parentId'] },
};
// What `set` may change: the fields of an element, except the tag (insert a new element to change what it is).
const CHANGEABLE_KEYS = ELEMENT_KEYS.filter((key) => key !== 'tag');

// The problems with the shape of one operation (empty when it is well formed), checked before anything is applied.
const checkOperationShape = (operation) => {
  if (!isPlainObject(operation)) return [`must be an object { op, ... }, got ${Array.isArray(operation) ? 'a list' : typeof operation}`];
  const shape = Object.hasOwn(OPERATIONS, operation.op) ? OPERATIONS[operation.op] : undefined;
  if (!shape) return [`unknown operation ${JSON.stringify(operation.op)}. ${didYouMean(String(operation.op), Object.keys(OPERATIONS))}Operations: ${Object.keys(OPERATIONS).join(', ')}`];
  const problems = checkUnknownKeys('', operation, shape.keys).map((line) => line.slice(2));
  for (const key of shape.required) if (operation[key] === undefined) problems.push(`missing "${key}" (a ${operation.op} needs ${shape.required.join(' and ')})`);
  if (operation.op === 'set' && operation.changes !== undefined) {
    if (!isPlainObject(operation.changes)) problems.push('changes must be an object of element fields to new values (null deletes a field)');
    else problems.push(...checkUnknownKeys('', operation.changes, CHANGEABLE_KEYS).map((line) => `changes: ${line.slice(2)}`));
  }
  if (operation.op === 'insert' && operation.node !== undefined && !isPlainObject(operation.node) && typeof operation.node !== 'string') problems.push('node must be a spec node (an element object, or text)');
  return problems;
};

export const patchSpec = (spec, operations, context = null) => {
  if (!Array.isArray(operations)) return { ok: false, problems: [`operations must be a list of { op, ... }, got ${typeof operations}`] };
  const draft = JSON.parse(JSON.stringify(spec));
  const problems = [];

  operations.forEach((operation, position) => {
    const label = `operation ${position}${isPlainObject(operation) && operation.op !== undefined ? ` (${operation.op})` : ''}`;
    const fail = (message) => problems.push(`${label}: ${message}`);
    const shapeProblems = checkOperationShape(operation);
    if (shapeProblems.length) return shapeProblems.forEach(fail);

    if (operation.op === 'set') {
      const location = findElementById(draft, operation.id);
      if (!location) return fail(`no element with id ${operation.id}`);
      for (const [key, value] of Object.entries(operation.changes)) {
        if (value === null) delete location.node[key];
        else location.node[key] = value;
      }
    } else if (operation.op === 'insert' || operation.op === 'move') {
      const parent = findElementById(draft, operation.parentId);
      if (!parent) return fail(`no element with id ${operation.parentId}`);
      let node = operation.node;
      if (operation.op === 'move') {
        const location = findElementById(draft, operation.id);
        if (!location) return fail(`no element with id ${operation.id}`);
        if (!location.parent || location.slot === 'template') return fail(`${operation.id} cannot be moved`);
        if (findElementById(location.node, operation.parentId)) return fail('cannot move an element into itself');
        node = location.node;
        detach(location);
      }
      const list = childList(parent.node);
      const index = operation.index ?? list.length;
      if (!Number.isInteger(index) || index < 0 || index > list.length) return fail(`index ${index} is out of range 0..${list.length}`);
      list.splice(index, 0, node);
    } else if (operation.op === 'remove') {
      const location = findElementById(draft, operation.id);
      if (!location) return fail(`no element with id ${operation.id}`);
      if (!location.parent) return fail('the root cannot be removed');
      if (location.slot === 'template') return fail('an each template cannot be removed');
      detach(location);
    }
  });

  if (!problems.length && context) problems.push(...validate(draft, context));
  return problems.length ? { ok: false, problems } : { ok: true, spec: draft };
};
