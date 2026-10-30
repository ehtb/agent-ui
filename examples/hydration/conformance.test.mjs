// Both pages' specs pass the framework's validator and match the published JSON Schema.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '@ehtb/agent-ui';
import { definePage } from '@ehtb/agent-ui/pages';
import { createSpecSchema } from '@ehtb/agent-ui/spec-schema';
import { matchesSchema } from '@ehtb/agent-ui/testing/json-schema.mjs';
import { page as listPage } from './pages/page.js';
import { page as articlePage } from './pages/article/[id]/page.js';
import { view as listView, layout as listLayout } from './pages/view.js';
import { view as articleView, layout as articleLayout } from './pages/article/[id]/view.js';

for (const [name, page, view, layout, path] of [['list', listPage, listView, listLayout, '/'], ['article', articlePage, articleView, articleLayout, '/article/:id']]) {
  test(`the ${name} spec validates and matches the JSON Schema`, () => {
    const { spec, namespaces } = definePage(page, { path, view, layout });
    assert.deepEqual(validate(spec, { namespaces }), []);
    assert.equal(matchesSchema(spec, createSpecSchema()), true);
  });
}
