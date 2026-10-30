// Response headers of an API answer, a form outcome or the render handler. They are checked in one place so that a header
// the framework writes itself cannot be set twice, a line break cannot turn one header into two, and `set-cookie` is the
// only header that may repeat. Names come back lower case (HTTP names are case-insensitive) and values as strings, each
// one line of printable ASCII or a tab.
import { fail } from './messages.js';
import { describeValue, isPlainObject, toArray } from './spec-core.js';

const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
// The framework writes these, or the connection owns them; a response of the framework must not set them.
// Every name in SECURITY_HEADERS (server/file-types.mjs) must be listed here; test/http-headers.test.mjs checks it.
const OWNED = ['connection', 'content-encoding', 'content-length', 'content-type', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'x-content-type-options'];

const headerText = (value, name, where) => {
  if (typeof value !== 'string' && typeof value !== 'number') fail(where, `the value of "${name}" must be a string or a number, not ${describeValue(value)}`, `Write "${name}": "..."`);
  // Check the value before trimming: a line break or control character at either end is still refused, not silently removed.
  const raw = String(value);
  if (/[\r\n]/.test(raw)) fail(where, `the value of "${name}" contains a line break`, 'A header value is one line');
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(raw)) fail(where, `the value of "${name}" contains a control character`, 'A header value is one line of text');
  if (/[^\u0009\u0020-\u007E]/.test(raw)) fail(where, `the value of "${name}" contains a character a header cannot carry`, 'A header value is printable ASCII; percent-encode a value that is not');
  return raw.trim();
};

// `name` is how the value is named in the message ("headers", "the headers of an outcome").
// `reserved` are headers this particular response writes itself.
// `allow` are the framework-owned headers this particular response may set (raw API answers set content-type).
export const checkResponseHeaders = (headers, where, { name = '"headers"', reserved = [], allow = [] } = {}) => {
  if (headers === undefined || headers === null) return undefined;
  if (!isPlainObject(headers)) fail(where, `${name} must be an object of header names and values, not ${describeValue(headers)}`, `Write ${name === '"headers"' ? 'headers' : name}: { "cache-control": "no-store" }`);
  // A null-prototype bag keeps a header named "__proto__" an ordinary header instead of dropping it silently.
  const checked = Object.create(null);
  const reservedNames = reserved.map((header) => String(header).toLowerCase());
  const allowedNames = allow.map((header) => String(header).toLowerCase());
  for (const [header, value] of Object.entries(headers)) {
    if (!TOKEN.test(header)) fail(where, `"${header}" is not an HTTP header name`, 'Use letters, digits and !#$%&\'*+-.^_`|~ only');
    const normalized = header.toLowerCase();
    if (Object.hasOwn(checked, normalized)) fail(where, `the header "${normalized}" is given twice`, 'Give each header once: HTTP header names are case-insensitive');
    if (OWNED.includes(normalized) && !allowedNames.includes(normalized)) fail(where, `the header "${normalized}" is written by the framework`, 'Leave it out');
    if (reservedNames.includes(normalized)) fail(where, `the header "${normalized}" is written for this response by the framework`, 'Leave it out');
    if (Array.isArray(value)) {
      if (normalized !== 'set-cookie') fail(where, `the value of "${normalized}" is a list; only "set-cookie" repeats`, `Write "${normalized}": "..."`);
      if (!value.length) fail(where, '"set-cookie" has an empty list', 'Give one cookie or more, or leave the header out');
      checked[normalized] = value.map((cookie, index) => headerText(cookie, `${normalized}[${index}]`, where));
    } else {
      checked[normalized] = headerText(value, normalized, where);
    }
  }
  return Object.fromEntries(Object.entries(checked));
};

// Lays response headers over each other, later ones winning, except `set-cookie`: every response may add cookies, so
// its values are joined instead of one replacing the others (a site-wide session refresh and an API's own cookie both stay).
export const mergeResponseHeaders = (...layers) => {
  const merged = Object.create(null);
  for (const layer of layers) {
    for (const [name, value] of Object.entries(layer ?? {})) {
      merged[name] = name === 'set-cookie' && merged[name] !== undefined ? [...toArray(merged[name]), ...toArray(value)] : value;
    }
  }
  return Object.fromEntries(Object.entries(merged));
};
