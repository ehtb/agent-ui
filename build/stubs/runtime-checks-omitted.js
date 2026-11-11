// Production stand-in for src/runtime-checks.js (see build/presets.mjs): the runtime keeps its behavior and skips the
// development checks. Every export of the real module exists here, so imports stay valid.
export const checkAdopt = () => {};
export const checkBasePath = () => {};
export const checkPropertyHandler = () => {};
export const checkPluginProperties = () => {};
export const noteRowsJumped = () => {};
export const checkRowState = () => {};
export const checkRowKey = () => {};
export const checkRowChanges = () => {};
export const checkRowStateWrite = () => {};
export const consumeCheckedListProblem = () => false;
export const forgetCheckedListProblems = () => {};
export const checkEachKeys = () => {};
export const describeAdoptionDifference = () => null;
