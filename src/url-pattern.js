// URL patterns: the one way a URL is described. A page's pattern comes from the folder it lives in (pages/event/[id]/
// is "/event/:id", build/pages.mjs), and the server tables of an API use the same syntax. There is no client-side router:
// following a link is a page load.
//
// Pattern syntax:
//   "/about"          literal segments match exactly
//   "/item/:id"       ":name" matches exactly one non-empty segment and puts it in params ("/item/abc" -> { id: 'abc' })
//   "/docs/*path"     "*name" must be last; matches one or more remaining segments, joined with "/" in params
//                     ("/docs/a/b/c" -> { path: 'a/b/c' })
// When several patterns match a location, the most specific one wins no matter how they are listed: at the first segment
// where two patterns differ, a literal beats ":name", which beats "*name". "/item/new" therefore beats "/item/:id",
// which beats "/item/*rest". Patterns of equal specificity that could match the same location keep their listed order.
const SEGMENT_RANK = { literal: 3, param: 2, rest: 1 };
const PARAM_NAME = /^[A-Za-z][A-Za-z0-9]*$/;

// Every pattern becomes one anchored regular expression. Its pieces cannot overlap, so matching takes time proportional to
// the length of the location (no backtracking blow-up, however hostile the URL):
//   literal    the segment's text with every regex character escaped
//   ":name"    ([^/]+)                 one non-empty segment
//   "*name"    ([^/]+(?:/[^/]+)*)      one or more non-empty segments, last in the pattern only
export const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PARAM_SOURCE = '([^/]+)';
const REST_SOURCE = '([^/]+(?:/[^/]+)*)';

// Decodes one captured segment; null when it is not valid percent-encoding (such a location matches nothing).
const decodeSegment = (segment) => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
};

// Turns "/items/:id" into a matcher. `match` returns the params object, or null when the location does not match.
// A pattern that cannot work (bad parameter name, "*name" not last, a name used twice) throws here, naming the pattern.
export const compileUrlPattern = (pattern) => {
  if (typeof pattern !== 'string') throw new Error(`URL pattern must be a string, got ${typeof pattern}. Write for example "/items/:id"`);
  const parts = pattern.split('/').map((part) => {
    if (part.startsWith(':')) return { kind: 'param', name: part.slice(1) };
    if (part.startsWith('*')) return { kind: 'rest', name: part.slice(1) };
    return { kind: 'literal', literal: part };
  });
  const names = new Set();
  parts.forEach((part, index) => {
    if (part.kind === 'literal') return;
    const written = `${part.kind === 'param' ? ':' : '*'}${part.name}`;
    if (!PARAM_NAME.test(part.name)) throw new Error(`URL pattern "${pattern}": "${written}" is not a parameter name. Use ":name" or "*name" with letters and digits, starting with a letter`);
    if (part.kind === 'rest' && index !== parts.length - 1) throw new Error(`URL pattern "${pattern}": "${written}" must be the last segment. Move it to the end, or use ":name" for a single segment`);
    if (names.has(part.name)) throw new Error(`URL pattern "${pattern}": the parameter "${part.name}" is used twice. Give each parameter its own name`);
    names.add(part.name);
  });
  const source = parts.map((part) => (part.kind === 'literal' ? escapeRegex(part.literal) : part.kind === 'param' ? PARAM_SOURCE : REST_SOURCE)).join('/');
  const regex = new RegExp(`^${source}$`);
  const parameters = parts.filter((part) => part.kind !== 'literal');
  return {
    match: (location) => {
      const found = typeof location === 'string' ? regex.exec(location) : null;
      if (!found) return null;
      const params = {};
      for (let index = 0; index < parameters.length; index++) {
        const { kind, name } = parameters[index];
        const decoded = kind === 'rest' ? found[index + 1].split('/').map(decodeSegment) : [decodeSegment(found[index + 1])];
        if (decoded.includes(null)) return null;
        params[name] = decoded.join('/');
      }
      return params;
    },
    build: (params) =>
      parts
        .map((part) => {
          if (part.kind === 'literal') return part.literal;
          const value = params[part.name] ?? '';
          return part.kind === 'rest' ? String(value).split('/').map(encodeURIComponent).join('/') : encodeURIComponent(value);
        })
        .join('/'),
    paramNames: parameters.map((part) => part.name),
    // One rank per segment, compared left to right (see the rules above).
    specificity: parts.map((part) => SEGMENT_RANK[part.kind]),
    // The shape without parameter names: "/item/:" for "/item/:id" and "/item/:slug". Equal shapes are the same pattern.
    shape: parts.map((part) => (part.kind === 'literal' ? part.literal : part.kind === 'param' ? ':' : '*')).join('/'),
  };
};

// Orders compiled patterns from most to least specific; ties keep their given order (Array.sort is stable).
export const sortBySpecificity = (entries, readPattern = (entry) => entry) =>
  [...entries].sort((first, second) => {
    const left = readPattern(first).specificity;
    const right = readPattern(second).specificity;
    for (let index = 0; index < Math.min(left.length, right.length); index++) {
      if (left[index] !== right[index]) return right[index] - left[index];
    }
    return 0;
  });
