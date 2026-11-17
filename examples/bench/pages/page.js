// The interactive page of the benchmark, at "/". Its list is empty until an action writes it: press a seed button (or let
// benchmark.mjs dispatch the same actions) and the rows appear. The /count/:count page shows the rows its URL names.
import { items } from '../bench/items.js';

export const page = { head: { title: 'List benchmark - agent-ui' }, namespaces: { bench: items } };
