// The reader half of the markup a page's document carries: the state script and the soft-navigation references (the entry
// script and the stylesheets). It is all a browser bundle needs; the writer half, which a server or the build uses, is
// src/document-markup.js. The state script's attributes are matched in any order, so a host transform can add a CSP nonce.
import { STATE_ELEMENT_ID } from './hydrate.js';
import { escapeRegex } from './url-pattern.js';

// The script is found by its type and id, whatever other attributes it carries and in whatever order: a server transform
// may add `nonce="..."` before `type`, and the document still reads.
const STATE_SCRIPT = new RegExp(`<script\\b(?=[^>]*(?:^|\\s)type="application/json")(?=[^>]*(?:^|\\s)id="${escapeRegex(STATE_ELEMENT_ID)}")[^>]*>([\\s\\S]*?)</script>`);
// Removing the script also removes the line break after it, so writing a document twice is idempotent.
const STATE_SCRIPT_WITH_NEWLINE = new RegExp(`${STATE_SCRIPT.source}\\n?`);

// The state in the text of a document ({} when it was not rendered with one).
export const readStateScript = (text) => {
  const found = STATE_SCRIPT.exec(text);
  return found ? JSON.parse(found[1]) : {};
};
// The text without its state script (and the line break after it), to put a new one in.
export const removeStateScript = (text) => text.replace(STATE_SCRIPT_WITH_NEWLINE, '');

// The file of the entry script (the first script with type="module" and a src), or null. Attributes may be in any order.
export const readModuleScript = (text) => {
  for (const match of text.matchAll(/<script\b([^>]*)>/g)) {
    const attributes = match[1];
    if (!/(?:^|\s)type="module"/.test(attributes)) continue;
    const source = /(?:^|\s)src="([^"]+)"/.exec(attributes)?.[1];
    if (source) return source;
  }
  return null;
};
// The stylesheets of the document, in order. Attributes may be in any order.
export const readStylesheets = (text) =>
  [...text.matchAll(/<link\b([^>]*)>/g)].flatMap((match) => {
    const attributes = match[1];
    if (!/(?:^|\s)rel="stylesheet"/.test(attributes)) return [];
    const href = /(?:^|\s)href="([^"]+)"/.exec(attributes)?.[1];
    return href ? [href] : [];
  });
