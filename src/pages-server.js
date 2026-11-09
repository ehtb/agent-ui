// The parts of definePage that only the build and the server use: the HTTP status of a page and the full description of its
// document. A browser never asks for any of them, so browser bundles replace this module with a
// stub (build/stubs/pages-server-omitted.js, see build/presets.mjs); `agent-ui check`, the static build and the render
// server import the page's source and get the real thing.
import { fail } from './messages.js';
import { describeValue } from './spec-core.js';
import { describeDocument } from './head-document.js';

// The value in a status error, even when JSON.stringify cannot write it (a BigInt, a cycle, a symbol).
const statusText = (answer) => {
  try {
    // JSON.stringify writes NaN and Infinity as "null", which would name a value the author never returned.
    return (typeof answer === 'number' ? String(answer) : JSON.stringify(answer)) ?? describeValue(answer);
  } catch {
    return describeValue(answer);
  }
};

// (state) => the HTTP status of the page, or undefined when it declares no `status`.
export const createStatusReader = ({ page, path }) => (currentState) => {
  if (!page.status) return undefined;
  const answer = page.status(currentState);
  if (!Number.isInteger(answer) || answer < 100 || answer > 599) fail(`page "${path}"`, `status(state) returned ${statusText(answer)}, not an HTTP status`, 'Return a whole number such as 200 or 404');
  return answer;
};

// (state, { basePath }) => everything the page says about its document, as the server writes it (src/head-document.js).
export const createDocumentDescriber = ({ page, path }) => (currentState, { basePath = '' } = {}) => describeDocument(page.head, currentState, `page "${path}" head`, basePath);
