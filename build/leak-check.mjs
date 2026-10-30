// A warning for a browser bundle that holds the code that builds specs. A page is page.js (behavior, shipped) and view.js (content,
// evaluated in Node, shipped as data), so the builders (src/spec.js) and the component macros (src/components.js) belong to view.js and
// to nothing a browser entry reaches. When one does reach it, the build still works and the bundle is just larger; this says so and
// names the import chain. A development build is skipped: its entries import view.js on purpose.
const VIEW_ONLY_MODULE = /(^|\/)src\/(spec|components)\.js$/;
const VIEW_FILE = /(^|\/)view\.js$/;

// The shortest chain of imports from an entry to `target`, as paths.
const chainTo = (graph, target) => {
  const parents = new Map(graph.roots.filter((root) => root.kind === 'entry').map((root) => [root.path, null]));
  const queue = [...parents.keys()];
  for (let index = 0; index < queue.length; index++) {
    const path = queue[index];
    if (path === target) break;
    for (const dependency of graph.modules.get(path).staticDependencies) {
      if (parents.has(dependency)) continue;
      parents.set(dependency, path);
      queue.push(dependency);
    }
  }
  const chain = [];
  for (let path = target; path !== null && path !== undefined; path = parents.get(path)) chain.unshift(path);
  return chain;
};

export const findViewCodeInBrowserBundle = (graph) => {
  if ([...graph.modules.keys()].some((path) => VIEW_FILE.test(path))) return [];
  return [...graph.modules.keys()].filter((path) => VIEW_ONLY_MODULE.test(path)).map((path) => `${path} is in a browser bundle (${chainTo(graph, path).join(' -> ')}). It builds specs and belongs to view.js only, so the page downloads code it never runs. Move what imports it into a module that only view.js imports`);
};
