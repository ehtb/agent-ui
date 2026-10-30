// Browser stand-in for src/pages-server.js (see build/presets.mjs): a browser never reads the HTTP status of a page or writes its
// document, so definePage gets functions that answer nothing. Every export of the real module exists here.
export const createDocumentDescriber = () => () => undefined;
export const createStatusReader = () => () => undefined;
