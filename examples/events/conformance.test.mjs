// Every page's spec passes the framework's validator and matches the published JSON Schema.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '@ehtb/agent-ui';
import { definePage } from '@ehtb/agent-ui/pages';
import { createSpecSchema } from '@ehtb/agent-ui/spec-schema';
import { matchesSchema } from '@ehtb/agent-ui/testing/json-schema.mjs';
import { page as listPage } from './pages/page.js';
import * as listView from './pages/view.js';
import { page as aboutPage } from './pages/about/page.js';
import * as aboutView from './pages/about/view.js';
import { page as faqPage } from './pages/faq/page.js';
import * as faqView from './pages/faq/view.js';
import { page as eventPage } from './pages/event/[id]/page.js';
import * as eventView from './pages/event/[id]/view.js';
import { page as archivedPage } from './pages/event/archived/page.js';
import * as archivedView from './pages/event/archived/view.js';
import { page as unknownPage } from './pages/event/[...path]/page.js';
import * as unknownView from './pages/event/[...path]/view.js';
import { page as contactPage } from './pages/contact/page.js';
import * as contactView from './pages/contact/view.js';

const pages = [
  ['list', listPage, listView, '/'],
  ['about', aboutPage, aboutView, '/about'],
  ['faq', faqPage, faqView, '/faq'],
  ['event', eventPage, eventView, '/event/:id'],
  ['archived', archivedPage, archivedView, '/event/archived'],
  ['unknown', unknownPage, unknownView, '/event/*path'],
  ['contact', contactPage, contactView, '/contact'],
];
for (const [name, page, view, path] of pages) {
  test(`the ${name} spec validates and matches the JSON Schema`, () => {
    // The same call the generated app.js makes: view and layout come from view.js, next to page.js.
    const { spec, namespaces } = definePage(page, { path, view: view.view, layout: view.layout });
    assert.deepEqual(validate(spec, { namespaces }), []);
    assert.equal(matchesSchema(spec, createSpecSchema()), true);
  });
}
