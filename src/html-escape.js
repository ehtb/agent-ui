// The one place that escapes text for HTML. Text goes between tags (escapeText); attribute values go inside double quotes
// (escapeAttribute). Used by the server renderer, the document builder and the page writer.
export const escapeText = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const escapeAttribute = (value) => escapeText(value).replace(/"/g, '&quot;');
