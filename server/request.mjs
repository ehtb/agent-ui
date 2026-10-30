// What the handlers read from a request before they trust it.

// A redirect or a rendered form outcome stays on this site: a local path starts with "/", is not "//" (another host),
// has no backslash, whitespace, control character or non-ASCII character, and does not start with an encoded slash or
// backslash (a client that decodes it before resolving could read "//host"). A Location value is printable ASCII; encode a
// path segment with encodeURIComponent. `?` and `#` are allowed: the page reads them.
export const isLocalPath = (value) => typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && !/^\/%(?:2f|5c)/i.test(value) && /^[!-~]+$/.test(value);

// The cookies of a Cookie header, as raw values (not percent-decoded: what the project stores is what it gets back).
// "a=1; b=two; quoted="a b"" gives { a: '1', b: 'two', quoted: 'a b' }; a part without "=" is ignored.
export const parseCookies = (header) => {
  // A null-prototype bag keeps a cookie named "__proto__" an ordinary cookie instead of dropping it silently.
  const cookies = Object.create(null);
  for (const part of String(header ?? '').split(';')) {
    const equals = part.indexOf('=');
    if (equals < 1) continue;
    const name = part.slice(0, equals).trim();
    if (!name) continue;
    let value = part.slice(equals + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    cookies[name] = value; // a repeated name keeps the last value, as a browser would
  }
  return Object.fromEntries(Object.entries(cookies));
};

// The one request object the server side of a page sees: what a page's state, its API and its form handler all read.
// pathname is still percent-encoded (URL patterns decode each segment themselves); query has decoded values.
export const createRequestContext = (request, { pathname, search = '' }, { signal = null } = {}) => {
  const cookie = request.headers?.cookie;
  return {
    method: String(request.method ?? 'GET').toUpperCase(),
    pathname,
    search,
    query: new URLSearchParams(search),
    headers: { ...request.headers },
    cookies: parseCookies(Array.isArray(cookie) ? cookie.join('; ') : cookie),
    signal,
  };
};

// The URL of a request target. A target is a path ("//about" is a path of this site, not the host "about"), so it is appended to an
// origin and never resolved against one. Throws for a target that is not a URL.
export const parseRequestUrl = (requestUrl) => new URL(String(requestUrl).startsWith('/') ? `http://localhost${requestUrl}` : requestUrl, 'http://localhost');

// The request as a page sees it when a form outcome renders that page: the method, headers and cookies of the POST, with the
// path, search and query of the page being shown. `url` is a local path that already passed isLocalPath.
export const requestContextForUrl = (context, url) => {
  const location = parseRequestUrl(url);
  return { ...context, pathname: location.pathname, search: location.search, query: new URLSearchParams(location.search) };
};

// The names a server bound to this machine answers to. A page of another site that makes a visitor's browser ask `localhost:8080`
// under its own name (DNS rebinding) sends that name as the Host header, and is refused: it must not read the project's sources or API.
export const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

// `hosts` is a list of host names, or null for "any" (a server that was told to serve the network).
export const isAllowedHost = (request, hosts) => {
  if (!hosts) return true;
  try {
    return hosts.includes(new URL(`http://${request.headers.host}`).hostname.toLowerCase());
  } catch {
    return false; // no Host header, or one that is not a host
  }
};

// The hosts a server listening on `address` answers to: this machine's names for a loopback address, any for the rest.
export const hostsFor = (address) => (['127.0.0.1', 'localhost', '::1'].includes(address) ? LOOPBACK_HOSTS : null);
