// URL patterns (src/url-pattern.js): table cases, hostile input, and a differential test against a plain
// segment-by-segment reference matcher. Every pattern is one anchored regular expression, so these tests also pin down
// what must never happen: a throw on a bad URL, a match across a segment border, or a slow match.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileUrlPattern, sortBySpecificity } from '../src/url-pattern.js';

const match = (pattern, location) => compileUrlPattern(pattern).match(location);

test('literal patterns match exactly, and every regex character in them is literal', () => {
  assert.deepEqual(match('/about', '/about'), {});
  assert.equal(match('/about', '/about/'), null);
  assert.equal(match('/about', '/About'), null); // case matters
  assert.equal(match('/about', '/aboutx'), null);
  assert.equal(match('/about', '/xabout'), null);
  assert.deepEqual(match('/', '/'), {});
  assert.equal(match('/', '/x'), null);
  for (const special of ['a.b', 'a+b', 'a*b'.replace('*', '%2A'), 'a(b)', 'a[b]', 'a{2}', 'a|b', 'a^b', 'a$b', 'a\\b', 'a?b']) {
    assert.deepEqual(match(`/${special}`, `/${special}`), {}, special);
  }
  assert.equal(match('/a.b', '/axb'), null); // "." is not "any character"
  assert.equal(match('/a|b', '/a'), null); // "|" is not "or"
  assert.equal(match('/a+', '/aaa'), null);
  assert.equal(match('/(a)', '/a'), null);
});

test(':name matches exactly one non-empty segment', () => {
  assert.deepEqual(match('/item/:id', '/item/abc'), { id: 'abc' });
  assert.equal(match('/item/:id', '/item'), null);
  assert.equal(match('/item/:id', '/item/'), null);
  assert.equal(match('/item/:id', '/item/a/b'), null);
  assert.equal(match('/item/:id', '/item//'), null);
  assert.deepEqual(match('/a/:x/b/:y', '/a/1/b/2'), { x: '1', y: '2' });
  assert.equal(match('/a/:x/b/:y', '/a/1/c/2'), null);
});

test('*name matches one or more remaining segments, at every depth, and never zero', () => {
  assert.deepEqual(match('/docs/*path', '/docs/a'), { path: 'a' });
  assert.deepEqual(match('/docs/*path', '/docs/a/b/c'), { path: 'a/b/c' });
  assert.equal(match('/docs/*path', '/docs'), null);
  assert.equal(match('/docs/*path', '/docs/'), null);
  assert.equal(match('/docs/*path', '/docs/a//b'), null); // an empty segment inside
  assert.equal(match('/docs/*path', '/docs/a/'), null);
  assert.deepEqual(match('/*slug', '/x/y/z'), { slug: 'x/y/z' });
  assert.equal(match('/*slug', '/'), null);
});

test('values are decoded per segment; an encoded slash never splits or joins segments', () => {
  assert.deepEqual(match('/item/:id', '/item/a%20b'), { id: 'a b' });
  assert.deepEqual(match('/item/:id', '/item/a%2Fb'), { id: 'a/b' }); // one segment, whose value contains a slash
  assert.deepEqual(match('/docs/*path', '/docs/a%2Fb/c'), { path: 'a/b/c' });
  assert.deepEqual(match('/item/:id', '/item/%C3%A9t%C3%A9'), { id: 'été' });
  assert.deepEqual(match('/item/:id', '/item/é'), { id: 'é' }); // already decoded text passes through
});

test('malformed percent-encoding matches nothing and never throws', () => {
  for (const location of ['/item/%', '/item/%E0%A4%A', '/item/%zz', '/item/%C3', '/item/%FF']) {
    assert.equal(match('/item/:id', location), null, location);
  }
  assert.equal(match('/docs/*path', '/docs/ok/%E0%A4%A'), null);
  assert.deepEqual(match('/item/:id', '/item/100%25'), { id: '100%' });
});

test('anything that is not a string matches nothing', () => {
  for (const value of [undefined, null, 5, {}, []]) assert.equal(match('/a', value), null);
});

test('build is the inverse of match for any value, including hostile ones', () => {
  const single = compileUrlPattern('/item/:id');
  const rest = compileUrlPattern('/docs/*path');
  for (const value of ['abc', 'a b', 'a/b', 'a?b', 'a#b', 'a%b', '100%', 'été', '日本語', "it's", '<script>', 'a.b', '..', '%2F']) {
    assert.deepEqual(single.match(single.build({ id: value })), { id: value }, value);
  }
  for (const value of ['a/b', 'a b/c d', 'x/été/%']) {
    assert.deepEqual(rest.match(rest.build({ path: value })), { path: value }, value);
  }
  assert.equal(single.build({ id: 'a/b' }), '/item/a%2Fb');
});

test('patterns that cannot work are refused with the pattern and a fix', () => {
  assert.throws(() => compileUrlPattern('/a/:'), /URL pattern "\/a\/:": ":" is not a parameter name\. Use ":name" or "\*name"/);
  assert.throws(() => compileUrlPattern('/a/:1x'), /":1x" is not a parameter name/);
  assert.throws(() => compileUrlPattern('/a/:a-b'), /":a-b" is not a parameter name/);
  assert.throws(() => compileUrlPattern('/a/*'), /"\*" is not a parameter name/);
  assert.throws(() => compileUrlPattern('/*rest/more'), /"\*rest" must be the last segment\. Move it to the end/);
  assert.throws(() => compileUrlPattern('/:id/x/:id'), /the parameter "id" is used twice/);
  assert.throws(() => compileUrlPattern(undefined), /URL pattern must be a string, got undefined/);
});

test('matching stays fast on hostile input (no backtracking blow-up)', () => {
  const patterns = ['/a/:x/b/:y/c/:z', '/docs/*path', '/:a/:b/:c/:d/:e/*rest', '/(a+)+$'];
  const hostile = ['/' + 'a/'.repeat(50000), '/docs/' + 'a/'.repeat(100000) + '/', '/' + 'a'.repeat(200000), '/a/' + '/'.repeat(100000), '/(a+)+$' + 'a'.repeat(50000) + '!'];
  const started = performance.now();
  for (const pattern of patterns) {
    const compiled = compileUrlPattern(pattern);
    for (const location of hostile) compiled.match(location);
  }
  assert.ok(performance.now() - started < 1500, `took ${Math.round(performance.now() - started)} ms`);
});

test('the most specific pattern wins however they are listed, and ties keep the listed order', () => {
  const list = ['/item/*rest', '/item/:id', '/item/new', '/:a/:b', '/item/:id/edit'].map((pattern) => ({ pattern, compiled: compileUrlPattern(pattern) }));
  const ordered = sortBySpecificity(list, (entry) => entry.compiled).map((entry) => entry.pattern);
  assert.deepEqual(ordered.slice(0, 2), ['/item/new', '/item/:id']);
  assert.ok(ordered.indexOf('/item/:id') < ordered.indexOf('/item/*rest'));
  const same = [{ n: 1, c: compileUrlPattern('/a/:x') }, { n: 2, c: compileUrlPattern('/:y/b') }];
  assert.deepEqual(sortBySpecificity(same, (entry) => entry.c).map((entry) => entry.n), [1, 2]);
});

test('equal shapes are detected whatever the parameter is called', () => {
  assert.equal(compileUrlPattern('/item/:id').shape, compileUrlPattern('/item/:slug').shape);
  assert.notEqual(compileUrlPattern('/item/:id').shape, compileUrlPattern('/item/*id').shape);
});

// A reference matcher written the plain way, segment by segment. The compiled regex must agree with it on every input.
const reference = (pattern, location) => {
  const parts = pattern.split('/');
  const segments = location.split('/');
  const last = parts.at(-1);
  const rest = last.startsWith('*');
  if (rest ? segments.length < parts.length : segments.length !== parts.length) return null;
  const params = {};
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    if (part.startsWith('*')) {
      const tail = segments.slice(index);
      if (tail.some((segment) => !segment)) return null;
      params[part.slice(1)] = tail.map(decodeURIComponent).join('/');
    } else if (part.startsWith(':')) {
      if (!segments[index]) return null;
      params[part.slice(1)] = decodeURIComponent(segments[index]);
    } else if (part !== segments[index]) return null;
  }
  return params;
};

test('differential: the regex matcher agrees with the segment matcher on thousands of generated patterns and locations', () => {
  let seed = 20260301;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const pick = (items) => items[Math.floor(random() * items.length)];
  const literals = ['a', 'b', 'about', 'item', 'a.b', 'x-y', 'a+b', 'é', 'A'];
  const values = ['a', 'b', 'about', 'item', '1', 'a.b', 'x-y', 'a+b', 'é', 'A', 'a%20b', 'a%2Fb', '', 'new', 'Z9'];
  let compared = 0;
  let matched = 0;
  for (let round = 0; round < 4000; round++) {
    const depth = 1 + Math.floor(random() * 4);
    const parts = [];
    for (let index = 0; index < depth; index++) {
      const kind = random();
      if (kind < 0.5) parts.push(pick(literals));
      else if (kind < 0.85 || index !== depth - 1) parts.push(`:p${index}`);
      else parts.push(`*p${index}`);
    }
    const pattern = random() < 0.1 ? '/' : `/${parts.join('/')}`;
    const locationLength = Math.floor(random() * 6);
    const location = locationLength === 0 ? '/' : `/${Array.from({ length: locationLength }, () => pick(values)).join('/')}`;
    const expected = reference(pattern, location);
    const actual = compileUrlPattern(pattern).match(location);
    assert.deepEqual(actual, expected, `${pattern} against ${location}`);
    compared++;
    if (expected) matched++;
  }
  assert.equal(compared, 4000);
  assert.ok(matched > 150, `only ${matched} generated cases matched; the generator is too weak to prove anything`);
});
