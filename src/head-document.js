// The server's half of a page's `head` (src/head.js is the browser's): the names the checks and the document writer share, and
// the full description, including the text of scripts and styles, which only a server writes. Production browser bundles never
// include this module: it is reached through src/pages-server.js and src/pages-checks.js, which they replace by stubs (a
// development bundle keeps the checks, so it holds this module too).
import { escapeJsonForScript } from './html-escape.js';
import { valueForState } from './spec-core.js';
import { resolveHead } from './head.js';
import { fail } from './messages.js';

export const HEAD_KEYS = ['title', 'description', 'html', 'body', 'tags', 'bodyTags'];
export const HEAD_TAGS = ['meta', 'link', 'base', 'script', 'style'];
export const BODY_TAGS = ['meta', 'link', 'script', 'style'];
// A script of these types is data, not code: its children may be built from the state, and are escaped for it.
export const DATA_SCRIPT_TYPES = ['application/ld+json', 'application/json', 'importmap', 'speculationrules'];
export const VOID_HEAD_TAGS = ['meta', 'link', 'base'];
export const ATTRIBUTE_NAME = /^[a-z_:][-a-z0-9_:.]*$/; // lower case: HTML names are case-insensitive, and one spelling keeps the URL and reserved-name checks exact

const closingTag = (tag) => new RegExp(`</${tag}|<!--`, 'i');

// The text inside a script or a style. Code and CSS are literals and must not be able to end their own element; data a
// function builds from the state (JSON for a script of a data type) is escaped so that no state value can.
const textOf = (node, attributes, state, where) => {
  if (node.children === undefined) return '';
  const isData = node.tag === 'script' && DATA_SCRIPT_TYPES.includes(attributes.type);
  const value = isData ? valueForState(node.children, state) : node.children;
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  if (isData) return escapeJsonForScript(text);
  if (closingTag(node.tag).test(text)) fail(where, `the text of a ${node.tag} contains "</${node.tag}" or "<!--"`, `Move that text into a file and load it with ${node.tag === 'script' ? '`src`' : 'a `link`'}`);
  return text;
};

const withText = (resolved, nodes, state, where) => resolved.map((entry, index) => ({ ...entry, text: textOf(nodes[index], entry.attributes, state, `${where}[${index}]`) }));

// The description of the document for one state, as the server writes it.
export const describeDocument = (head, state, where, basePath = '') => {
  const description = resolveHead(head, state, where, basePath);
  return {
    ...description,
    tags: withText(description.tags, head.tags ?? [], state, `${where}.tags`),
    bodyTags: withText(description.bodyTags, head.bodyTags ?? [], state, `${where}.bodyTags`),
  };
};
