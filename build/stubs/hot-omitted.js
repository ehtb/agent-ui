// Production stand-in for src/hot.js (see build/presets.mjs): the hot swap of a page exists in `agent-ui dev` only.
// Every export of the real module exists here, so imports stay valid.
export const exposeHot = () => {};
