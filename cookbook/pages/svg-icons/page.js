// Recipe: icons and a small chart in SVG.
// SVG is a closed set of tags (svg, g, path, circle, ellipse, rect, line, polyline, polygon, use): its shapes stand inside an svg, and
// an svg either says what it shows (role: 'img' with aria-label) or is decoration next to text that says it ('aria-hidden': 'true').
// What is drawn from data is computed in `derive`, like any other value: the stars to show, and the points of the line.
const rating = {
  state: { value: 3 },
  derive: {
    // Five stars, each on or off. Equal values keep their reference, so only the stars that changed are written again.
    stars: (get) => [1, 2, 3, 4, 5].map((id) => ({ id, on: id <= get('value') })),
  },
  actions: {
    set: { args: { value: 'number' }, run: (store, { value }) => store.set('value', value) },
  },
};

const visits = {
  state: { perDay: [3, 5, 2, 8, 6, 9, 7] },
  derive: {
    // The points of a polyline in a 60 by 20 box: one step of 10 per day, the highest day at the top.
    points: (get) => {
      const perDay = get('perDay');
      const highest = Math.max(...perDay, 1);
      return perDay.map((count, day) => `${day * 10},${20 - (count / highest) * 20}`).join(' ');
    },
    summary: (get) => `Visits this week, from ${get('perDay')[0]} to ${get('perDay').at(-1)} a day`,
  },
  actions: {
    add: { args: { count: 'number' }, run: (store, { count }) => store.set('perDay', [...store.get('perDay').slice(1), count]) },
  },
};

export const page = { head: { title: 'Icons - cookbook' }, namespaces: { rating, visits } };
