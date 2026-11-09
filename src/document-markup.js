// The writer half of the markup a page's document carries: the state script, the entry script and the stylesheet links. The
// build and the server write them (build/write-site.mjs, server/render-page.js, server/document.mjs); the browser's reader is
// src/document-markup-reader.js, so a browser bundle never carries this module.
import { escapeAttribute, escapeJsonForScript } from './html-escape.js';
import { STATE_ELEMENT_ID } from './hydrate.js';

// JSON that is safe inside <script type="application/json">: "<" and the two line separators are escaped. The reader accepts
// attributes in any order, so a server transform can add a nonce for a Content-Security-Policy.
export const stateScriptHtml = (state, elementId = STATE_ELEMENT_ID) => {
  return `<script type="application/json" id="${escapeAttribute(elementId)}">${escapeJsonForScript(JSON.stringify(state))}</script>`;
};

// ---- the script that starts the page, and the page's stylesheets -----------------------------------------------------------------------

export const MODULE_SCRIPT_START = '<script type="module"';
export const moduleScriptHtml = (source) => `${MODULE_SCRIPT_START} src="${source}"></script>`;
export const stylesheetLinkHtml = (href) => `<link rel="stylesheet" href="${href}">`;
