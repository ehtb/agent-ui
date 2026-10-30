// For plugins that draw into an element of the page: an editor, a chart, a map, anything that owns its own DOM.
//
//   (mountElement comes from the package entry @ehtb/agent-ui/mount-element)
//   export const withChart = (api) => mountElement(api, 'revenue-chart', (element, { key }) => {
//     const chart = drawChart(element, api.get('sales.series'));
//     const stop = api.watch(['sales.series'], (values) => chart.update(values['sales.series']));
//     return () => { stop(); chart.destroy(); };           // called when the element leaves the page or the app is destroyed
//   });
//
// The plugin claims the element by its explicit `id`. `mount` is called once the element is in the page, for every element with
// that id (one per row of an each, a new one each time a when brings it back), and what it returns is called when that element is
// taken out of the page or the app is destroyed. From then on the element belongs to the plugin: it writes into it, and what happens
// in it goes back to the app as api.dispatch(...), a logged action. The element must have no children in the spec. Nothing here
// is bundled into a page that does not import it.
import { didYouMean, fail } from './messages.js';
import { codedError } from './errors.js';
import { toArray } from './spec-core.js';
import { visitSpec } from './spec-walk.js';

// { explicit: the ids of elements without children, withChildren: the ids of elements that have some } for a spec.
const readElementIds = (spec) => {
  const ids = { explicit: new Set(), withChildren: new Set() };
  visitSpec(spec, (node) => {
    if (typeof node.id === 'string') (toArray(node.children).length ? ids.withChildren : ids.explicit).add(node.id);
  });
  return ids;
};

// Per app: which ids exist in its spec, and which are claimed already.
const appsState = new WeakMap();
const stateOf = (api) => {
  if (!appsState.has(api)) appsState.set(api, { known: readElementIds(api.spec()), claimed: new Set() });
  return appsState.get(api);
};

const reportError = (api, where, id, phase, error) => api.report(codedError('AUI0401', { where, id, phase, cause: error.message }));

// Claims the element with this id for `mount(element, { id, key })`; `key` is the key of the row the element is in, if it is in one.
// Returns a function that gives the id back (and cleans up the elements that were mounted).
export const mountElement = (api, id, mount) => {
  const where = 'mountElement';
  if (typeof id !== 'string' || typeof mount !== 'function') fail(where, 'it takes the api, the id of an element and a function mount(element, { id, key })', "Write mountElement(api, 'chart', (element) => { ...; return () => { ... }; })");
  const { known, claimed } = stateOf(api);
  if (known.withChildren.has(id)) fail(where, `the element "${id}" has children in the spec, and the plugin would write into what the spec renders`, `Claim an element without children: div({ id: '${id}' }), and put the surrounding content in its parent`);
  if (!known.explicit.has(id)) fail(where, `the spec has no element with the id "${id}"`, `${didYouMean(id, [...known.explicit])}Give the element an explicit id (div({ id: '${id}' })): a default id is its position and changes when siblings do`);
  if (claimed.has(id)) fail(where, `the element "${id}" is already claimed`, 'An element has one owner. Claim another element, or let one plugin do both');
  claimed.add(id);

  const mounted = new Map(); // element -> its cleanup, or null
  const unmount = (element) => {
    const cleanup = mounted.get(element);
    mounted.delete(element);
    try {
      cleanup?.();
    } catch (error) {
      reportError(api, where, id, 'cleanup', error);
    }
  };
  const stop = api.observeElements({
    added: (element) => {
      if (element.getAttribute('data-id') !== id || mounted.has(element)) return;
      mounted.set(element, null);
      try {
        const cleanup = mount(element, { id, key: element.closest('[data-key]')?.dataset.key });
        mounted.set(element, typeof cleanup === 'function' ? cleanup : null);
      } catch (error) {
        reportError(api, where, id, 'mount', error);
      }
    },
    removed: (node) => {
      if (!mounted.size || node.nodeType !== 1) return;
      for (const element of [node, ...node.querySelectorAll('[data-id]')]) if (mounted.has(element)) unmount(element);
    },
  });
  const release = () => {
    if (!claimed.delete(id)) return;
    stop();
    for (const element of [...mounted.keys()]) unmount(element);
  };
  api.onDestroy(release);
  return release;
};
