// Production stand-in for src/performance.js (see build/presets.mjs): the performance checks and observers run in development only.
// Every export of the real module exists here, so imports stay valid.
const noop = () => {};
export const auditSpecPerformance = () => [];
export const performance = () => noop;
// A page plugin is a factory, (environment) => plugin, and the real module accepts both `withPerformance` and
// `withPerformance({ ... })` in a page's plugins. The result of the call is a factory in both spellings: called with an
// environment it gives a plugin (page.js), and called with an app's api it does nothing.
const pagePluginFactory = () => noop;
export const withPerformance = () => pagePluginFactory;
