// The generated JSON Schema accepts valid specs and rejects structural mistakes. A small evaluator
// (testing/json-schema.mjs, only the keywords the generator uses) keeps the test dependency free.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchesSchema } from './support/json-schema.mjs';

const { createSpecSchema } = await import('../src/spec-schema.js');
const schema = createSpecSchema();

const matches = (value) => matchesSchema(value, schema);

test('the committed docs/spec.schema.json is current (run: node build/spec-schema.mjs)', () => {
  const committed = JSON.parse(readFileSync(new URL('../docs/spec.schema.json', import.meta.url), 'utf8'));
  assert.deepEqual(committed, JSON.parse(JSON.stringify(schema)));
});

test('structural mistakes are rejected', () => {
  const reject = (spec, why) => assert.equal(matches(spec), false, why);
  reject({ tag: 'blink' }, 'bad tag');
  reject({ tag: 'div', chilren: 'x' }, 'unknown key');
  reject({ tag: 'div', classes: { a: true } }, 'constant class');
  reject({ tag: 'div', on: { clik: ['a'] } }, 'unknown event');
  reject({ tag: 'button', on: { click: [] }, children: 'x' }, 'empty handler');
  reject({ tag: 'div', children: { equals: [1] } }, 'operator arity');
  reject({ each: 'items', template: { tag: 'li' } }, 'each without key');
  reject({ when: { state: 'a' }, kids: [] }, 'unknown when key');
  reject({ tag: 'button', on: { 'click.Enter': ['a.b', {}] }, children: 'x' }, 'a key chord is only for keydown and keyup');
  reject({ when: { state: 'a.b' } }, 'when without children or otherwise');
  reject({ tag: 'div', transition: 0 }, 'transition must be positive');
  reject({ tag: 'p', children: { state: 'a' } }, 'state binding without a namespace');
  reject({ tag: 'p', children: { state: 'form.rows..id' } }, 'empty path segment');
  reject({ tag: 'button', on: { click: ['go'] }, children: 'x' }, 'action without a namespace');
  reject({ each: 'items', key: 'id', template: { tag: 'li' } }, 'each source without a namespace');
  assert.ok(matches({ tag: 'input', props: { type: 'text', value: { state: 'a.b' } }, on: { 'keydown.Control+Shift+k': ['go.now', { x: { event: 'target.value' } }, { preventDefault: true }] } }));
});
