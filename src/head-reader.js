// The head of a document a server rendered, read back from its text: the description a soft navigation hands to applyHead
// (src/head.js), so the next page leaves the document as a load of it would. The writer is injectHead in server/document.mjs;
// the two are tested as a pair. Scripts, styles and base are included, with their text (`complete`).
//
// The text of a script or style is never read as markup: the elements the page wrote are found between the comments injectHead
// puts around them (a script may not contain `<!--`), and the tags and the description are searched in a copy of the document
// whose script and style text is blanked out.
import { BODY_END, BODY_START, HEAD_END, HEAD_START, MARKER_ATTRIBUTES, MARKER_BODY, MARKER_HEAD } from './head.js';

const VOID_TAGS = ['meta', 'link', 'base'];
const unescapeText = (text) => text.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// { name: value } of the attributes in the text of an open tag; a bare one is true.
const readAttributes = (raw) => {
  const attributes = {};
  for (const [, name, double, single, bare] of raw.matchAll(/([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    const value = double ?? single ?? bare; // the writer always uses double quotes; a template edited by hand may not
    attributes[name] = value === undefined ? true : unescapeText(value);
  }
  return attributes;
};

// The same text with what is inside <script> and <style> replaced by spaces (same length, so positions match the original).
const withoutRawText = (text) => text.replace(/(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2>)/gi, (whole, open, name, inside, close) => open + ' '.repeat(inside.length) + close);

const regionOf = (text, start, end) => {
  const from = text.indexOf(start);
  const to = from < 0 ? -1 : text.indexOf(end, from);
  return to < 0 ? '' : text.slice(from + start.length, to);
};

// The elements the page wrote in one region, in the order of their position.
const readTags = (text, code, marker, start, end) => {
  const region = regionOf(text, start, end);
  const maskedRegion = regionOf(code, start, end); // same length: the openings are found here, the text is cut from the original
  const tags = [];
  for (const found of maskedRegion.matchAll(new RegExp(`<([a-z]+) ${marker}="(\\d+)"([^>]*)>`, 'g'))) {
    const [opening, tag, index, rest] = found;
    const close = VOID_TAGS.includes(tag) ? -1 : region.indexOf(`</${tag}>`, found.index + opening.length);
    tags[Number(index)] = { tag, attributes: readAttributes(rest), text: close < 0 ? '' : region.slice(found.index + opening.length, close) };
  }
  return tags;
};

// The attributes of <html> or <body> as the document has them, the template's own and the page's (a load shows both), without the
// list that says which the page wrote: applyHead lists them again.
const readElementAttributes = (code, tagName) => {
  const attributes = readAttributes(new RegExp(`<${tagName}(\\s[^>]*)?>`, 'i').exec(code)?.[1] ?? '');
  const written = typeof attributes[MARKER_ATTRIBUTES] === 'string' ? attributes[MARKER_ATTRIBUTES].split(' ').filter(Boolean) : [];
  delete attributes[MARKER_ATTRIBUTES];
  return { attributes, written };
};

export const readHead = (text) => {
  const code = withoutRawText(text);
  const head = code.slice(0, Math.max(0, code.indexOf('</head>')) || code.length); // the description is in <head>, never in what comes after
  const html = readElementAttributes(code, 'html');
  const body = readElementAttributes(code.slice(Math.max(0, code.indexOf('</head>'))), 'body');
  return {
    title: '', // the title is the page's own (src/pages.js)
    description: unescapeText(/<meta name="description" content="([^"]*)">/.exec(head)?.[1] ?? ''),
    html: html.attributes,
    body: body.attributes,
    // Which of them the page wrote (the rest is the template's): only those are the page's to take away again.
    written: { html: html.written, body: body.written },
    tags: readTags(text, code, MARKER_HEAD, HEAD_START, HEAD_END),
    bodyTags: readTags(text, code, MARKER_BODY, BODY_START, BODY_END),
    complete: true,
  };
};
