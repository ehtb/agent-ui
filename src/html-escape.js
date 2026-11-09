// The one place that escapes text for HTML. Text goes between tags (escapeText); attribute values go inside double quotes
// (escapeAttribute). Used by the server renderer, the document builder and the page writer.
export const escapeText = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const escapeAttribute = (value) => escapeText(value).replace(/"/g, '&quot;');
// JSON that is safe inside a <script>: "<" could close the element, and U+2028/U+2029 end a line in an older JavaScript. Used by
// the state script and by a head's data scripts, so both escape the same way (src/document-markup.js, src/head-document.js).
export const escapeJsonForScript = (json) =>
  String(json).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, (character) => `\\u${character.charCodeAt(0).toString(16)}`);
