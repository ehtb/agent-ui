// Every page's spec passes the framework's validator and matches the published JSON Schema.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '@ehtb/agent-ui';
import { createSpecSchema } from '@ehtb/agent-ui/spec-schema';
import { matchesSchema } from '@ehtb/agent-ui/testing/json-schema.mjs';
import { namespaces } from './pages/page.js';
import { view } from './pages/view.js';
import { namespaces as primitives } from './pages/primitives/page.js';
import { view as primitivesView } from './pages/primitives/view.js';
import { namespaces as charts } from './pages/charts/page.js';
import { view as chartsView } from './pages/charts/view.js';

test('the spec validates and matches the JSON Schema', () => {
  assert.deepEqual(validate(view, { namespaces: { route: { state: { params: {} } }, ...namespaces } }), []);
  assert.equal(matchesSchema(view, createSpecSchema()), true);
});

test('the primitives page also validates and matches the JSON Schema', () => {
  assert.deepEqual(validate(primitivesView, { namespaces: { route: { state: { params: {} } }, ...primitives } }), []);
  assert.equal(matchesSchema(primitivesView, createSpecSchema()), true);
});

test('the charts page also validates and matches the JSON Schema', () => {
  assert.deepEqual(validate(chartsView, { namespaces: { route: { state: { params: {} } }, ...charts } }), []);
  assert.equal(matchesSchema(chartsView, createSpecSchema()), true);
});
