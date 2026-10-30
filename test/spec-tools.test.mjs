// patchSpec: atomic, id-addressed edits of a spec with validation.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { patchSpec, listIds } = await import('../src/spec-tools.js');

const baseSpec = () => ({
  tag: 'main',
  id: 'page',
  children: [
    { tag: 'h1', id: 'title', children: 'Hello' },
    { tag: 'ul', id: 'list', children: [{ tag: 'li', id: 'first', children: 'one' }, { tag: 'li', id: 'second', children: 'two' }] },
    { tag: 'footer', id: 'footer', children: 'bye' },
  ],
});
const context = { namespaces: { page: { state: { name: '' } } } };
const ids = (spec) => listIds(spec).map((entry) => entry.id);

test('listIds returns explicit ids in document order, including nested ones', () => {
  assert.deepEqual(ids(baseSpec()), ['page', 'title', 'list', 'first', 'second', 'footer']);
  assert.deepEqual(listIds(baseSpec())[1], { id: 'title', tag: 'h1' });
});

test('set merges fields and null deletes a key; the input spec is never modified', () => {
  const original = baseSpec();
  const result = patchSpec(original, [
    { op: 'set', id: 'title', changes: { children: 'Welcome', props: { class: 'big' } } },
    { op: 'set', id: 'title', changes: { props: null } },
  ], context);
  assert.equal(result.ok, true);
  assert.deepEqual(result.spec.children[0], { tag: 'h1', id: 'title', children: 'Welcome' });
  assert.deepEqual(original, baseSpec());
});

test('insert, remove and move work by id, with index control', () => {
  const result = patchSpec(baseSpec(), [
    { op: 'insert', parentId: 'list', index: 1, node: { tag: 'li', id: 'between', children: 'new' } },
    { op: 'remove', id: 'first' },
    { op: 'move', id: 'footer', parentId: 'list' },
    { op: 'move', id: 'title', parentId: 'list', index: 0 },
  ], context);
  assert.equal(result.ok, true);
  assert.deepEqual(ids(result.spec), ['page', 'list', 'title', 'between', 'second', 'footer']);
});

test('a single child that is not an array is normalised when inserting into it', () => {
  const spec = { tag: 'div', id: 'box', children: 'only text' };
  const result = patchSpec(spec, [{ op: 'insert', parentId: 'box', node: { tag: 'span', id: 'extra', children: 'x' } }]);
  assert.deepEqual(result.spec.children, ['only text', { tag: 'span', id: 'extra', children: 'x' }]);
  const emptied = patchSpec({ tag: 'div', id: 'box', children: { tag: 'p', id: 'p', children: 'x' } }, [{ op: 'remove', id: 'p' }]);
  assert.equal('children' in emptied.spec, false);
});

test('all or nothing: any failing operation returns only problems', () => {
  const original = baseSpec();
  const result = patchSpec(original, [
    { op: 'set', id: 'title', changes: { children: 'changed' } },
    { op: 'remove', id: 'missing' },
    { op: 'insert', parentId: 'list', index: 9, node: { tag: 'li', children: 'x' } },
    { op: 'move', id: 'page', parentId: 'list' },
    { op: 'remove', id: 'page' },
    { op: 'rotate', id: 'title' },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.spec, undefined);
  assert.deepEqual(result.problems, [
    'operation 1 (remove): no element with id missing',
    'operation 2 (insert): index 9 is out of range 0..2',
    'operation 3 (move): page cannot be moved',
    'operation 4 (remove): the root cannot be removed',
    'operation 5 (rotate): unknown operation "rotate". Operations: set, insert, remove, move',
  ]);
  assert.deepEqual(original, baseSpec());
});

test('moving an element into itself or its descendants is rejected; templates cannot be removed', () => {
  const nested = { tag: 'div', id: 'outer', children: [{ tag: 'div', id: 'inner', children: 'x' }, { tag: 'ul', id: 'rows', children: { each: 'page.rows', key: 'id', template: { tag: 'li', id: 'row' } } }] };
  const moveIntoSelf = patchSpec(nested, [{ op: 'move', id: 'inner', parentId: 'inner' }]);
  assert.match(moveIntoSelf.problems[0], /cannot move an element into itself/);
  const removeTemplate = patchSpec(nested, [{ op: 'remove', id: 'row' }]);
  assert.match(removeTemplate.problems[0], /an each template cannot be removed/);
});

test('the patched spec is validated: invalid results are rejected with the validator problems', () => {
  const result = patchSpec(baseSpec(), [
    { op: 'insert', parentId: 'list', node: { tag: 'blink', id: 'bad' } },
    { op: 'insert', parentId: 'list', node: { tag: 'li', id: 'first', children: 'duplicate id' } },
  ], context);
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((message) => /bad tag blink/.test(message)));
  assert.ok(result.problems.some((message) => /duplicate id first/.test(message)));
});

test('operations are strict: unknown keys, missing keys, unknown change fields and wrong kinds are refused, with or without a context', () => {
  const problemsOf = (operations) => patchSpec(baseSpec(), operations).problems;
  assert.deepEqual(problemsOf([{ op: 'set', id: 'title', change: { children: 'x' } }]), [
    'operation 0 (set): unknown key change (allowed: op, id, changes). Did you mean "changes"?',
    'operation 0 (set): missing "changes" (a set needs id and changes)',
  ]);
  assert.deepEqual(problemsOf([{ op: 'set', id: 'title', changes: { chilren: 'typo' } }]), [
    'operation 0 (set): changes: unknown key chilren (allowed: props, children, id, classes, on, transition). Did you mean "children"?',
  ]);
  assert.deepEqual(problemsOf([{ op: 'set', id: 'title', changes: { tag: 'h2' } }]).length, 1, 'the tag is not changed in place');
  assert.match(problemsOf([{ op: 'set', id: 'title', changes: 'x' }])[0], /changes must be an object/);
  assert.match(problemsOf([{ op: 'remove', id: 'title', parentId: 'page' }])[0], /unknown key parentId \(allowed: op, id\)/);
  assert.match(problemsOf([{ op: 'insert', parentId: 'list', node: 5 }])[0], /node must be a spec node/);
  assert.match(problemsOf([{ op: 'move', id: 'title' }])[0], /missing "parentId"/);
  assert.match(problemsOf([null])[0], /operation 0: must be an object/);
  assert.match(problemsOf([{ op: 'sett', id: 'title', changes: {} }])[0], /unknown operation "sett"\. Did you mean "set"\?/);
  assert.deepEqual(patchSpec(baseSpec(), 'x').problems, ['operations must be a list of { op, ... }, got string']);
});
