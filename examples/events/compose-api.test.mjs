// compose-api.js: the table of endpoints and forms per API part, mounted below <apiBase>/<name>/ and at the pages' paths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeApi } from './compose-api.js';

const expectError = (action, pattern) => assert.throws(action, (error) => pattern.test(error.message), String(pattern));

test('api: endpoints are mounted below /api/<name>/, forms at the page paths, and nothing answers for another part', () => {
  const api = composeApi({
    routes: {
      item: {
        endpoints: { 'POST /:id/buy': ({ params, body }) => ({ status: 201, body: { id: params.id, qty: body.qty } }) },
        forms: { '/item/:id/buy': ({ params, form }) => ({ status: 200, url: `/item/${params.id}`, initialState: { qty: form.qty } }) },
      },
      note: { endpoints: { 'GET /list': () => ({ status: 200, body: [] }) } },
    },
  });
  assert.deepEqual(api.handle({ method: 'POST', pathname: '/api/item/3/buy', body: { qty: 2 } }), { status: 201, body: { id: '3', qty: 2 } });
  assert.equal(api.handle({ method: 'GET', pathname: '/api/note/list' }).status, 200);
  assert.equal(api.handle({ method: 'GET', pathname: '/api/item/list' }).status, 404); // another part's endpoint
  const wrongMethod = api.handle({ method: 'GET', pathname: '/api/item/3/buy' });
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.allow, 'POST');
  assert.equal(api.handle({ method: 'GET', pathname: '/elsewhere' }), null);
  assert.deepEqual(api.handleForm({ pathname: '/item/3/buy', form: { qty: '4' } }), { status: 200, url: '/item/3', initialState: { qty: '4' } });
  assert.equal(api.handleForm({ pathname: '/other', form: {} }), null);
});

test('api mistakes name the part and say what to write', () => {
  const compose = (definition) => () => composeApi({ routes: { item: definition } });
  expectError(compose({ endpoint: {} }), /api part "item": unknown key "endpoint"\. Did you mean "endpoints"\? Allowed keys: endpoints, forms, reset/);
  expectError(compose({ endpoints: { '/x': () => ({}) } }), /endpoint "\/x" is not allowed.*METHOD \/pattern/);
  expectError(compose({ endpoints: { 'FETCH /x': () => ({}) } }), /endpoint "FETCH \/x" is not allowed/);
  expectError(compose({ endpoints: { 'GET x': () => ({}) } }), /pattern "x" is not allowed/);
  expectError(compose({ endpoints: { 'GET /x': 'nope' } }), /needs a function/);
  expectError(compose({ forms: { '/x?y': () => null } }), /pattern "\/x\?y" is not allowed/);
});

test('api tables follow the same rule: a literal endpoint beats a parameter endpoint', () => {
  const api = composeApi({
    routes: {
      item: { endpoints: { 'GET /:id': ({ params }) => ({ status: 200, body: `item ${params.id}` }), 'GET /archived': () => ({ status: 200, body: 'archived list' }) } },
    },
  });
  assert.equal(api.handle({ method: 'GET', pathname: '/api/item/archived' }).body, 'archived list');
  assert.equal(api.handle({ method: 'GET', pathname: '/api/item/9' }).body, 'item 9');
});

test('a form outcome url must be a local path; a bad one fails with the fix', () => {
  const api = composeApi({ routes: { item: { forms: { '/item/:id/buy': () => ({ status: 200, url: 'item/3', initialState: {} }) } } } });
  assert.throws(() => api.handleForm({ pathname: '/item/3/buy', form: {} }), /outcome url "item\/3" is not allowed\. Return a local path that starts with "\/" and is not "\/\/"/);
  const relative = composeApi({ routes: { item: { forms: { '/item/:id/buy': () => ({ status: 200, url: '//example.com/', initialState: {} }) } } } });
  assert.throws(() => relative.handleForm({ pathname: '/item/3/buy', form: {} }), /outcome url "\/\/example\.com\/" is not allowed/);
  const badRedirect = composeApi({ routes: { item: { forms: { '/item/:id/buy': () => ({ redirect: 'https://example.com/' }) } } } });
  assert.throws(() => badRedirect.handleForm({ pathname: '/item/3/buy', form: {} }), /redirect "https:\/\/example\.com\/" is not a path of this site/);
});

test('a form may redirect to a local path instead of naming a page; the render handler writes 303', () => {
  const api = composeApi({ routes: { item: { forms: { '/item/:id/buy': () => ({ redirect: '/thanks', headers: { 'set-cookie': ['bought=1; Path=/; HttpOnly'] } }) } } } });
  assert.deepEqual(api.handleForm({ pathname: '/item/3/buy', form: {} }), { redirect: '/thanks', headers: { 'set-cookie': ['bought=1; Path=/; HttpOnly'] } });
});

test('apiBase moves the endpoints; the default is /api, and a bad value says what to write', () => {
  const routes = { item: { endpoints: { 'GET /:id': ({ params }) => ({ status: 200, body: { id: params.id } }) } } };
  const versioned = composeApi({ apiBase: '/v1', routes });
  assert.equal(versioned.apiBase, '/v1');
  assert.deepEqual(versioned.handle({ method: 'GET', pathname: '/v1/item/3' }), { status: 200, body: { id: '3' } });
  assert.equal(versioned.handle({ method: 'GET', pathname: '/v1/other/3' }).status, 404); // unknown below the base
  assert.equal(versioned.handle({ method: 'GET', pathname: '/api/item/3' }), null); // not below the base: not this API's
  assert.equal(composeApi({ routes }).apiBase, '/api');
  for (const bad of ['api', '/api/', '', '/a?b']) {
    assert.throws(() => composeApi({ apiBase: bad, routes }), new RegExp(`composeApi: apiBase ${JSON.stringify(bad).replace(/[?]/g, '\\?')} is not allowed\\. Use a path that starts with '/' and has no trailing slash, for example '/api'`));
  }
});
