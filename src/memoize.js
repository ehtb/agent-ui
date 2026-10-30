// memoizeItem: caches an expensive per-item computation, for derived values over long lists.
//
// (Reusable state logic is a namespace: define { state, derive, actions } once and mount it under several names,
// `namespaces: { sidebar: disclosure, help: disclosure }`; see docs/API.md, "Namespaces".)
import { fail } from './messages.js';

// Caches an expensive per-item computation by the item's reference. The store replaces changed items and keeps
// unchanged items' references (replace, never mutate), so a reference hit means the item is unchanged and the cached
// result is exact: updating one row recomputes one row. Removed items leave the WeakMap with the item, so there is
// nothing to invalidate. Two rules follow from caching by the item alone:
//   - `computeFromItem` must depend on the item only. A function that also reads other state (a query, a selected id)
//     would serve stale results; derive from both inputs without memoizing instead.
//   - Items must be objects (or arrays). Strings and numbers have no reference identity to cache by.
export const memoizeItem = (computeFromItem) => {
  if (typeof computeFromItem !== 'function') {
    fail('memoizeItem', `want a function of one item, got ${computeFromItem === null ? 'null' : typeof computeFromItem}`, 'Write memoizeItem((item) => expensiveResult(item))');
  }
  const cache = new WeakMap();
  return (item) => {
    if (item === null || typeof item !== 'object') {
      fail('memoizeItem', `want an object item to cache by its reference, got ${item === null ? 'null' : typeof item}`, 'A string or number has no identity to cache by; compute those directly, without memoizeItem');
    }
    if (cache.has(item)) return cache.get(item);
    const result = computeFromItem(item);
    cache.set(item, result);
    return result;
  };
};
