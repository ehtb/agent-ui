// The page "/charts": behavior only. The sales are state; the chart is drawn by a plugin (chart-plugin.js) from that state, and
// a click on a bar selects the quarter. The content is view.js next to this file.
import { withChart } from './chart-plugin.js';

export const sales = {
  state: {
    series: [
      { id: 'q1', label: 'Q1', value: 12 },
      { id: 'q2', label: 'Q2', value: 19 },
      { id: 'q3', label: 'Q3', value: 7 },
      { id: 'q4', label: 'Q4', value: 15 },
    ],
    selectedId: null,
  },
  derive: {
    total: (get) => get('series').reduce((sum, point) => sum + point.value, 0),
    selectedLabel: (get) => get('series').find((point) => point.id === get('selectedId'))?.label ?? 'none',
  },
  actions: {
    setValue: {
      args: { id: 'string', value: 'number' },
      // An emptied number field reads as NaN, which is not JSON: it changes nothing.
      run: (store, { id, value }) => {
        if (!Number.isFinite(value)) return;
        store.set('series', store.get('series').map((point) => (point.id === id ? { ...point, value: Math.max(0, value) } : point)));
      },
    },
    select: { args: { id: 'string' }, run: (store, { id }) => store.set('selectedId', id) },
  },
};

export const namespaces = { sales };

export const page = { head: { title: 'Charts' }, namespaces, plugins: [withChart] };
