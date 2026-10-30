// The request context (server/request.mjs): one object shared by page state, the API and form handlers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequestContext, isLocalPath, parseCookies, requestContextForUrl } from '../server/request.mjs';

test('parseCookies reads the raw values of a Cookie header', () => {
  assert.deepEqual(parseCookies('session=abc; theme=dark'), { session: 'abc', theme: 'dark' });
  assert.deepEqual(parseCookies('quoted="a b"; equals=a=b; empty=; broken; spaced = value'), { quoted: 'a b', equals: 'a=b', empty: '', spaced: 'value' });
  assert.deepEqual(parseCookies('session=first; session=last'), { session: 'last' });
  assert.deepEqual(parseCookies(''), {});
  assert.deepEqual(parseCookies(undefined), {});
  assert.deepEqual(parseCookies(null), {});
});

test('a cookie name that JavaScript treats specially is still a cookie', () => {
  const cookies = parseCookies('__proto__=admin; constructor=value');
  assert.equal(cookies.__proto__, 'admin');
  assert.equal(Object.getPrototypeOf(cookies), Object.prototype);
  assert.deepEqual(Object.keys(cookies).sort(), ['__proto__', 'constructor']);
});

test('createRequestContext keeps the path as sent, parses the query, copies the headers and parses cookies', () => {
  const context = createRequestContext(
    { method: 'post', headers: { cookie: 'session=abc; theme=dark', host: 'example.test', 'content-type': 'application/json' } },
    { pathname: '/item/a%2Fb', search: '?q=one&q=two&empty=' },
  );
  assert.equal(context.method, 'POST');
  assert.equal(context.pathname, '/item/a%2Fb');
  assert.equal(context.search, '?q=one&q=two&empty=');
  assert.deepEqual(context.query.getAll('q'), ['one', 'two']);
  assert.equal(context.query.get('empty'), '');
  assert.equal(context.headers.host, 'example.test');
  assert.deepEqual(context.cookies, { session: 'abc', theme: 'dark' });
});

test('createRequestContext defaults the method and search, and joins an array Cookie header', () => {
  const context = createRequestContext({ headers: { cookie: ['a=1', 'b=2'] } }, { pathname: '/' });
  assert.equal(context.method, 'GET');
  assert.equal(context.search, '');
  assert.deepEqual(context.cookies, { a: '1', b: '2' });
  assert.deepEqual(createRequestContext({}, { pathname: '/' }).headers, {});
});

test('isLocalPath accepts a path of this site and refuses another host, a backslash, a space, a non-ASCII character or an encoded separator at the start', () => {
  for (const path of ['/', '/contact', '/item/3?ok=1#top', '/a%20b', '/item/a%2Fb', '/item/%5C']) assert.equal(isLocalPath(path), true, path);
  for (const value of ['', 'contact', '//example.com/', '/\\example.com/', '/a b', '/caf\u00e9', '/%2F', '/%2F%2Fexample.com/', '/%5Cexample.com/', 'https://example.com/', 7, null]) assert.equal(isLocalPath(value), false, String(value));
});

test('requestContextForUrl keeps the POST method, headers and cookies but reads the page URL', () => {
  const context = createRequestContext({ method: 'POST', headers: { cookie: 'session=ada', 'content-type': 'application/x-www-form-urlencoded' } }, { pathname: '/greet', search: '?form=1' });
  const page = requestContextForUrl(context, '/?sent=1');
  assert.equal(page.method, 'POST');
  assert.equal(page.pathname, '/');
  assert.equal(page.search, '?sent=1');
  assert.deepEqual([...page.query.keys()], ['sent']);
  assert.equal(page.query.get('sent'), '1');
  assert.deepEqual(page.cookies, { session: 'ada' });
  assert.equal(page.headers['content-type'], 'application/x-www-form-urlencoded');
  assert.equal(context.pathname, '/greet', 'the POST context is not changed');
});
