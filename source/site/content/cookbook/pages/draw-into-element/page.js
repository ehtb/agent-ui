// Recipe: a chart, an editor or a map drawn by a plugin into one element.
// The page has no idea how the chart draws. It owns the data (`sales.series`) and the selection; the plugin (bars.js) draws the data
// and reports a click as `sales.select`. The element in view.js is empty and has an explicit id, which is how the plugin finds it.
import { withBars } from './bars.js';

const sales = {
  state: { series: [3, 5, 2], selected: -1 },
  actions: {
    add: { args: { value: 'number' }, run: (store, { value }) => store.set('series', [...store.get('series'), value]) },
    select: { args: { index: 'number' }, run: (store, { index }) => store.set('selected', index) },
  },
};

export const page = { head: { title: 'Chart - cookbook' }, namespaces: { sales }, plugins: [withBars] };
