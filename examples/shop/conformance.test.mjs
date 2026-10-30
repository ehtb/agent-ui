// Every page's spec passes the framework's validator and matches the published JSON Schema.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '@ehtb/agent-ui';
import { definePage } from '@ehtb/agent-ui/pages';
import { createSpecSchema } from '@ehtb/agent-ui/spec-schema';
import { matchesSchema } from '@ehtb/agent-ui/testing/json-schema.mjs';
import { page as list } from './pages/page.js';
import { view as listView, shell as listShell } from './pages/view.js';
import { page as product } from './pages/product/[id]/page.js';
import { view as productView, shell as productShell } from './pages/product/[id]/view.js';
import { page as checkout } from './pages/checkout/page.js';
import { view as checkoutView, shell as checkoutShell } from './pages/checkout/view.js';

for (const [name, page, view, shell, path] of [
  ['list', list, listView, listShell, '/'],
  ['product', product, productView, productShell, '/product/:id'],
  ['checkout', checkout, checkoutView, checkoutShell, '/checkout'],
]) {
  test(`the ${name} spec and the shell around it validate and match the JSON Schema`, () => {
    const { spec, namespaces, shellContent, shellNamespaces } = definePage(page, { path, view, shell });
    assert.deepEqual(validate(spec, { namespaces }), []);
    assert.deepEqual(validate(shellContent.view, { namespaces: shellNamespaces }), [], 'the shell\'s content validates against the shell\'s namespaces');
    assert.equal(matchesSchema(spec, createSpecSchema()), true);
    assert.equal(matchesSchema(shellContent.view, createSpecSchema()), true);
  });
}
