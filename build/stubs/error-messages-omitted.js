// Production stand-in for src/error-messages.js (see build/presets.mjs): an error is its code and its details, "AUI0103 {...}", and
// src/error-messages.js decodes it where the error is read (docs/GUIDE.md, "Reporting errors"). Every export of the real module exists here,
// so imports stay valid; a production build carries no prose and does not decode (decodeError answers null): decode with the real module.
export const describeError = () => null;
export const describeUnknownKey = () => '';
export const MESSAGES = {};
export const decodeError = () => null;
