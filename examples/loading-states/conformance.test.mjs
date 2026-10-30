// Every page's spec passes the framework's validator and matches the published JSON Schema.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '@ehtb/agent-ui';
import { definePage } from '@ehtb/agent-ui/pages';
import { createSpecSchema } from '@ehtb/agent-ui/spec-schema';
import { matchesSchema } from '@ehtb/agent-ui/testing/json-schema.mjs';
import { page as overview } from './pages/page.js';
import { page as instant } from './pages/instant/page.js';
import { page as products } from './pages/products/page.js';
import { page as product } from './pages/products/[id]/page.js';
import { page as unavailable } from './pages/unavailable/page.js';
// The content of each page (view + the shared layout) lives in the view.js next to it; page.js is behavior only.
import * as overviewView from './pages/view.js';
import * as instantView from './pages/instant/view.js';
import * as productsView from './pages/products/view.js';
import * as productView from './pages/products/[id]/view.js';
import * as unavailableView from './pages/unavailable/view.js';

const pages = [
  ['overview', overview, overviewView, '/'],
  ['instant', instant, instantView, '/instant'],
  ['products', products, productsView, '/products'],
  ['product', product, productView, '/products/:id'],
  ['unavailable', unavailable, unavailableView, '/unavailable'],
];
for (const [name, page, view, path] of pages) {
  test(`the ${name} spec validates and matches the JSON Schema`, () => {
    const { spec, namespaces } = definePage(page, { path, view: view.view, layout: view.layout, pending: view.pending });
    assert.deepEqual(validate(spec, { namespaces }), []);
    assert.equal(matchesSchema(spec, createSpecSchema()), true);
  });
}
