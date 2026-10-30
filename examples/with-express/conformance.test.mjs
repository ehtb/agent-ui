// Every page's spec passes the framework's validator and matches the published JSON Schema.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '@ehtb/agent-ui';
import { definePage } from '@ehtb/agent-ui/pages';
import { createSpecSchema } from '@ehtb/agent-ui/spec-schema';
import { matchesSchema } from '@ehtb/agent-ui/testing/json-schema.mjs';
import { page as entries } from './pages/page.js';
import { view as entriesView } from './pages/view.js';
import { page as entry } from './pages/entry/[id]/page.js';
import { view as entryView } from './pages/entry/[id]/view.js';
import { page as sign } from './pages/sign/page.js';
import { view as signView } from './pages/sign/view.js';
import { page as about } from './pages/about/page.js';
import { view as aboutView } from './pages/about/view.js';
import { layout } from './pages/layout.js';

for (const [name, page, view, path] of [['entries', entries, entriesView, '/'], ['entry', entry, entryView, '/entry/:id'], ['sign', sign, signView, '/sign'], ['about', about, aboutView, '/about']]) {
  test(`the ${name} spec validates and matches the JSON Schema`, () => {
    const { spec, namespaces } = definePage(page, { path, view, layout });
    assert.deepEqual(validate(spec, { namespaces }), []);
    assert.equal(matchesSchema(spec, createSpecSchema()), true);
  });
}
