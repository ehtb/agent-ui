// The debug console: making the app with debug: true (or calling mountDevtools(ui) yourself) makes the browser's console show what the
// app does. There is no panel; the console already has what one needs: collapsible groups, expandable objects, tables, styles and
// filtering by level. Not part of the runtime chunk: pages load it on demand with a dynamic import, so it only costs bytes when used.
//
//   - once, at the start: the state as a table, and how to ask the app for more (window.__ui)
//   - every action, as a collapsed group "▸ todos.add { text: 'milk' }": its arguments, and each state key and derived value it
//     changed with the value before and after (expand the objects to look inside)
//   - a replay as one line, not one group per action
//   - errors are already reported by the runtime with console.error; the group of the action that failed is not written
//
// What the console can do beyond that is yours: __ui.state(), __ui.derived(), console.table(__ui.log), __ui.replay(__ui.log),
// __ui.dispatch('todos.add', { text: 'milk' }), __ui.outline(), __ui.tree().

const NAME = 'color:#fff;background:#4b5bd7;border-radius:3px;padding:0 4px;font-weight:bold';
const ACTION = 'font-weight:bold';
const KEY = 'font-weight:bold;color:#4b5bd7';
const MUTED = 'color:#888';

// { 'namespace.key': value } from the nested { namespace: { key: value } } that state() and derived() return.
const flatten = (nested) => Object.fromEntries(Object.entries(nested).flatMap(([namespace, values]) => Object.entries(values).map(([key, value]) => [`${namespace}.${key}`, value])));

// The keys whose value is not the same value any more. State is replaced, never mutated, so a different reference is a change.
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

export const mountDevtools = (ui) => {
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
      // Nothing is written during a replay, but the snapshots follow it: the first action after it is compared with the replayed state.
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
