// Response headers (src/http-headers.js): one check for the API, form outcomes and createSsrHandler, and the merge that
// keeps every `set-cookie` while a later layer replaces the other headers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkResponseHeaders, mergeResponseHeaders } from '../src/http-headers.js';
import { SECURITY_HEADERS } from '../server/file-types.mjs';

const expectError = (action, pattern) => assert.throws(action, (error) => pattern.test(error.message), String(pattern));

test('header names come back lower case and values as strings', () => {
  assert.deepEqual(checkResponseHeaders({ 'X-Count': 2, 'Cache-Control': 'no-store' }, 'response'), { 'x-count': '2', 'cache-control': 'no-store' });
  assert.deepEqual(checkResponseHeaders({ 'x-empty': '' }, 'response'), { 'x-empty': '' });
  assert.equal(checkResponseHeaders(undefined, 'response'), undefined);
  assert.equal(checkResponseHeaders(null, 'response'), undefined);
});

test('a header name that JavaScript treats specially is still an ordinary header', () => {
  const checked = checkResponseHeaders(JSON.parse('{"__proto__":"x","constructor":"y"}'), 'response');
  assert.deepEqual(Object.keys(checked).sort(), ['__proto__', 'constructor']);
  assert.equal(checked.__proto__, 'x');
  const merged = mergeResponseHeaders(checked);
  assert.equal(Object.getOwnPropertyDescriptor(merged, '__proto__').value, 'x');
  assert.equal(Object.getPrototypeOf(merged), Object.prototype);
});

test('a header the framework owns, or one that belongs to the connection, is refused instead of silently overridden', () => {
  for (const name of ['content-type', 'content-length', 'content-encoding', 'connection', 'transfer-encoding', 'x-content-type-options']) {
    expectError(() => checkResponseHeaders({ [name]: 'x' }, 'response'), new RegExp(`response: the header "${name}" is written by the framework`));
  }
  expectError(() => checkResponseHeaders({ 'X-Note': 'a', 'x-note': 'b' }, 'response'), /response: the header "x-note" is given twice/);
});

test('every header the server writes itself is refused by the one check, so a later addition cannot be dropped silently', () => {
  for (const name of Object.keys(SECURITY_HEADERS)) {
    expectError(() => checkResponseHeaders({ [name]: 'x' }, 'response'), new RegExp(`response: the header "${name}" is written by the framework`));
  }
});

test('a name is a token, a value is one line, and a list is only for set-cookie', () => {
  expectError(() => checkResponseHeaders({ 'bad name': 'x' }, 'response'), /response: "bad name" is not an HTTP header name/);
  expectError(() => checkResponseHeaders({ 'x-note': 'a\r\nb' }, 'response'), /response: the value of "x-note" contains a line break/);
  expectError(() => checkResponseHeaders({ 'x-note': 'a\n' }, 'response'), /response: the value of "x-note" contains a line break/);
  expectError(() => checkResponseHeaders({ 'x-note': 'a\u0000b' }, 'response'), /response: the value of "x-note" contains a control character/);
  expectError(() => checkResponseHeaders({ 'x-note': '\u000b' }, 'response'), /response: the value of "x-note" contains a control character/);
  expectError(() => checkResponseHeaders({ 'x-note': 'caf\u00e9 \u{1f600}' }, 'response'), /response: the value of "x-note" contains a character a header cannot carry/);
  expectError(() => checkResponseHeaders({ 'x-list': ['a', 'b'] }, 'response'), /response: the value of "x-list" is a list; only "set-cookie" repeats/);
  expectError(() => checkResponseHeaders({ 'set-cookie': [] }, 'response'), /response: "set-cookie" has an empty list/);
  expectError(() => checkResponseHeaders({ 'x-object': { a: 1 } }, 'response'), /response: the value of "x-object" must be a string or a number, not object/);
  expectError(() => checkResponseHeaders([], 'response'), /response: "headers" must be an object of header names and values, not a list/);
});

test('set-cookie repeats and reserved headers are named by the caller', () => {
  assert.deepEqual(checkResponseHeaders({ 'set-cookie': ['a=1', 'b=2'] }, 'response'), { 'set-cookie': ['a=1', 'b=2'] });
  expectError(() => checkResponseHeaders({ location: '/x' }, 'form', { reserved: ['location'] }), /form: the header "location" is written for this response by the framework/);
  expectError(() => checkResponseHeaders({ Location: '/x' }, 'form', { reserved: ['LOCATION'] }), /form: the header "location" is written for this response by the framework/);
});

test('mergeResponseHeaders joins set-cookie across layers and lets the later layer replace every other header', () => {
  assert.deepEqual(
    mergeResponseHeaders({ 'set-cookie': 'site=1', 'cache-control': 'public' }, { 'set-cookie': ['api=2', 'api=3'], 'cache-control': 'no-store' }, { 'x-content-type-options': 'nosniff' }),
    { 'set-cookie': ['site=1', 'api=2', 'api=3'], 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  );
  assert.deepEqual(mergeResponseHeaders(null, undefined, { 'x-a': '1' }), { 'x-a': '1' });
});
