// Recipe: a bar chart in SVG, with a gradient, axis labels and a tooltip on every bar.
// The chart is spec like any other markup: what is drawn from data (the position and the height of each bar, the label above the picked
// one) is computed in `derive`, one display row per bar, and the template reads it. A chart that needs zoom, pointer-following tooltips or
// thousands of marks is a library drawn by a plugin (recipe `draw-into-element`); a chart that fits in the spec needs no plugin.
const WIDTH = 220;
const PLOT_HEIGHT = 80;

const sales = {
  state: { months: [{ id: 'jan', label: 'Jan', value: 12 }, { id: 'feb', label: 'Feb', value: 19 }, { id: 'mar', label: 'Mar', value: 8 }, { id: 'apr', label: 'Apr', value: 24 }], pickedId: null },
  derive: {
    // One row per bar, in a 220 wide box with the highest month at the top of an 80 high plot. Equal rows keep their reference,
    // so changing the picked month rewrites two bars and no more.
    bars: (get) => {
      const months = get('months');
      const highest = Math.max(...months.map((month) => month.value), 1);
      const slot = WIDTH / months.length;
      return months.map((month, index) => {
        const height = (month.value / highest) * PLOT_HEIGHT;
        return {
          id: month.id,
          label: month.label,
          x: index * slot + slot * 0.15,
          width: slot * 0.7,
          y: PLOT_HEIGHT - height,
          height,
          center: index * slot + slot / 2,
          valueY: PLOT_HEIGHT - height - 3,
          tooltip: `${month.label}: ${month.value}`,
          picked: month.id === get('pickedId'),
        };
      });
    },
    summary: (get) => {
      const months = get('months');
      const best = months.reduce((top, month) => (month.value > top.value ? month : top), months[0]);
      return `Sales by month, ${months.length} months, the most in ${best.label} with ${best.value}`;
    },
  },
  actions: {
    pick: { args: { id: 'string' }, run: (store, { id }) => store.set('pickedId', store.get('pickedId') === id ? null : id) },
  },
};

export const page = { head: { title: 'Chart - cookbook' }, namespaces: { sales } };
