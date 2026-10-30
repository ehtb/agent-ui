// The chart: Chart.js (the npm package, imported by name) drawn by a plugin into one element of the page. This is the "ref" of a
// React component, `useRef` plus `useEffect` around `new Chart(canvas)`, and it is the only code in the example that knows Chart.js exists.
//
// What the page owns and what the plugin owns:
//   page    the data (`sales.series`) and the selection (`sales.selectedId`), as state; the element `revenue-chart`, empty, with an id
//   plugin  a canvas inside that element, and the Chart.js instance that draws on it
// State goes out through api.watch (the chart follows `sales.series` and `sales.selectedId`); a click on a bar comes back as
// api.dispatch('sales.select'), a logged action like a click anywhere else, so it is in the log and replays. The plugin never writes state.
import { mountElement } from '@ehtb/agent-ui/mount-element';
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip } from 'chart.js';

// Chart.js is tree-shakeable: only what this chart uses is registered, and only what is imported is bundled.
Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

const BAR = '#94a3b8';
const SELECTED_BAR = '#2563eb';

const chartData = (series, selectedId) => ({
  labels: series.map((point) => point.label),
  datasets: [{ label: 'Revenue (k)', data: series.map((point) => point.value), backgroundColor: series.map((point) => (point.id === selectedId ? SELECTED_BAR : BAR)) }],
});

// The page lists `plugins: [withChart]`. A chart needs a real canvas, so the plugin does nothing while the page is rendered on the
// server or in a test shim: the environment's `win` is the browser's window only in a browser.
export const withChart = ({ win }) => (api) => {
  if (typeof window === 'undefined' || win !== window) return;
  mountElement(api, 'revenue-chart', (element) => {
    const canvas = element.ownerDocument.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true'); // the element has the role and the label; the canvas is its picture
    element.append(canvas);
    const { series, selectedId } = { series: api.get('sales.series'), selectedId: api.get('sales.selectedId') };
    const chart = new Chart(canvas, {
      type: 'bar',
      data: chartData(series, selectedId),
      options: {
        maintainAspectRatio: false,
        animation: false, // state is final at once; the chart follows it without a tween
        scales: { y: { beginAtZero: true } },
        // A click on a bar is an event of the outside world: it goes back as an action, unless the app is replaying.
        onClick: (event, bars) => {
          const point = bars.length ? api.get('sales.series')[bars[0].index] : undefined;
          if (point && !api.replaying) api.dispatch('sales.select', { id: point.id });
        },
      },
    });
    const stop = api.watch(['sales.series', 'sales.selectedId'], (values) => {
      chart.data = chartData(values['sales.series'], values['sales.selectedId']);
      chart.update();
    });
    return () => {
      stop();
      chart.destroy();
      canvas.remove();
    };
  });
};
