const module_devtools = (() => {
const NAME = 'color:#fff;background:#4b5bd7;border-radius:3px;padding:0 4px;font-weight:bold';
const ACTION = 'font-weight:bold';
const KEY = 'font-weight:bold;color:#4b5bd7';
const MUTED = 'color:#888';
const flatten = (nested) => Object.fromEntries(Object.entries(nested).flatMap(([namespace, values]) => Object.entries(values).map(([key, value]) => [`${namespace}.${key}`, value])));
const changesBetween = (before, after) => Object.keys(after).filter((key) => before[key] !== after[key]).map((key) => ({ key, before: before[key], after: after[key] }));
const isPrimitive = (value) => value === null || typeof value !== 'object';
const writeChanges = (title, changes) => {
if (!changes.length) return;
console.log(`%c${title}`, MUTED);
for (const { key, before, after } of changes) {
if (isPrimitive(before) && isPrimitive(after)) console.log(`  %c${key}%c`, KEY, '', before, '→', after);
else console.log(`  %c${key}%c`, KEY, '', { before, after });
}
};
const mountDevtools = (ui) => {
let state = flatten(ui.state());
let derived = flatten(ui.derived());
console.groupCollapsed('%cagent-ui%c debug console on: the state, then every action', NAME, '');
console.table(Object.fromEntries(Object.entries(state).map(([key, value]) => [key, { value }])));
console.log('Ask the app: %c__ui.state()  __ui.derived()  __ui.actions()  console.table(__ui.log)  __ui.dispatch(name, args)  __ui.replay(__ui.log)', MUTED);
console.groupEnd();
return ui.onAction(({ name, args, replaying }) => {
const nextState = flatten(ui.state());
const nextDerived = flatten(ui.derived());
if (replaying) {
state = nextState;
derived = nextDerived;
return;
}
const stateChanges = changesBetween(state, nextState);
const derivedChanges = changesBetween(derived, nextDerived);
state = nextState;
derived = nextDerived;
console.groupCollapsed(`%c▸ %c${name}%c ${JSON.stringify(args)}%c ${stateChanges.length ? `${stateChanges.length} changed` : 'no change'}`, NAME, ACTION, '', MUTED);
console.log('args', args);
writeChanges('state', stateChanges);
writeChanges('derived', derivedChanges);
console.groupEnd();
});
};
return { mountDevtools };
})();
export { module_devtools };
