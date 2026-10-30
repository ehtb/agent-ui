// syncApps: one-way state sync between TWO SEPARATE APPS that live on the same page (for example a header cart widget and
// the page app next to it). That is the only thing it is for.
//
//   const stop = syncApps({
//     from: cartApp,                       // the value app() returned for the app that owns the data
//     to: badgeApp,                        // the app that wants to know
//     watch: ['cart.count'],               // qualified keys of `from` (state or derived)
//     action: 'badge.set',                 // qualified action of `to`; it receives the values
//     args: { count: 'cart.count' },       // argument of the action -> the watched key that supplies it
//   });
//
// It is not an anchor element and not routing; it is NOT a way to share state inside one app (namespaces, `calls` and `derive` do that), NOT a way to add namespaces
// or routes at runtime, and NOT two-way: to sync both directions, make each side own different keys and sync twice.
//
// How it stays inside the model: the receiving app only changes through its own action, so every change is in its log and
// its own replay works; the sending app is only read, through `watch`. Both ends are checked when the sync is made
// (known keys, a real action, the exact argument names), the first values are sent at once, and nothing is sent while
// either app is replaying.
import { checkSyncApps } from './sync-apps-checks.js';

export const syncApps = (options) => {
  checkSyncApps(options);
  const { from, to, watch, action, args } = options;

  // Runs now (the first values) and after every change of a watched key. A derived value settles after the state it is
  // computed from, so the callback can run twice for one change; the same values are not sent twice.
  let lastSent = null;
  return from.watch(watch, (values) => {
    if (from.replaying || to.replaying) return; // replays rebuild each app from its own log; they never talk
    const sent = Object.fromEntries(Object.entries(args).map(([name, key]) => [name, values[key]]));
    const text = JSON.stringify(sent);
    if (text === lastSent) return;
    lastSent = text;
    const problem = to.dispatch(action, sent);
    if (problem) throw new Error(`syncApps: ${watch.join(', ')} -> ${action}: ${problem}`);
  });
};
