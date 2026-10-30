// The app's spec passes the framework's validator and matches the published JSON Schema.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '@ehtb/agent-ui';
import { createSpecSchema } from '@ehtb/agent-ui/spec-schema';
import { matchesSchema } from '@ehtb/agent-ui/testing/json-schema.mjs';
import { namespaces } from './pages/page.js';
import { view } from './pages/view.js';

test('the spec validates and matches the JSON Schema', () => {
  assert.deepEqual(validate(view, { namespaces: { route: { state: { params: {} } }, ...namespaces } }), []);
  assert.equal(matchesSchema(view, createSpecSchema()), true);
});
