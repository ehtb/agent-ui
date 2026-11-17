// The startup page of the benchmark, at "/count/:count": the list is derived from the URL's parameter, a pure function of
// state, so the server renders its rows and the browser takes the markup over (adopt). benchmark.mjs opens it at
// /count/1000, /count/5000 and /count/20000 to measure what a startup with that many rows costs.
import { items } from '../../../bench/items.js';

export const page = {
  head: { title: (state) => `List benchmark, ${state.route.params.count} rows - agent-ui` },
  namespaces: { bench: items },
};
