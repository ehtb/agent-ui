// Production stand-in for src/spec-checks.js (see build/presets.mjs): the builders keep their output and skip the
// development checks. Every export of the real module exists here, so imports stay valid.
export const checkAct = () => {};
export const checkElement = () => {};
export const checkOperator = () => {};
export const checkPath = () => {};
export const checkWhen = () => {};
export const checkEach = () => {};
