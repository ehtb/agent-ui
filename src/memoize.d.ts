/**
 * Caches `computeFromItem` by the item's reference (a WeakMap). Because the store replaces changed items and keeps
 * unchanged items' references, a hit means the item is unchanged: updating one row recomputes one row, and removed
 * items are garbage-collected with their cache entry. `computeFromItem` must depend on the item alone (a function that
 * also reads other state would serve stale results), and items must be objects or arrays.
 */
export function memoizeItem<Item extends object, Result>(computeFromItem: (item: Item) => Result): (item: Item) => Result;
