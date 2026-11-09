// A warning for a browser bundle that holds the code that builds specs. A page is page.js (behavior, shipped) and view.js (content,
// evaluated in Node, shipped as data), so the builders (src/spec.js) and the component macros (src/components.js) belong to view.js and
// to nothing a browser entry reaches. When one does reach it, the build still works and the bundle is just larger; this says so and
// names the import chain. A development build is skipped: its entries import view.js on purpose.
const VIEW_ONLY_MODULE = /(^|\/)src\/(spec|components)\.js$/;
const VIEW_FILE = /(^|\/)view\.js$/;

// The shortest chain of imports from an entry to `target`, as paths. A dynamic import() reaches the module too, so it is part of
// the chain (a module only imported that way still makes the browser download the builders).
const chainTo = (graph, target) => {
  const parents = new Map(graph.roots.filter((root) => root.kind === 'entry').map((root) => [root.path, null]));
  const queue = [...parents.keys()];
  for (let index = 0; index < queue.length; index++) {
    const path = queue[index];
    if (path === target) break;
    for (const dependency of [...graph.modules.get(path).staticDependencies, ...graph.modules.get(path).dynamicDependencies]) {
      if (parents.has(dependency)) continue;
      parents.set(dependency, path);
      queue.push(dependency);
    }
  }
  const chain = [];
  for (let path = target; path !== null && path !== undefined; path = parents.get(path)) chain.unshift(path);
  return chain;
};

// A development entry (build/pages.mjs writes it into .agent-ui/) imports view.js on purpose and builds the spec in the browser,
// so that build is not warned about. Only the entry itself is looked at: a page.js that imports its own view.js in a production
// build is exactly the mistake this check exists for, and must not turn the check off.
const isDevelopmentEntry = (graph, path) =>
  /(^|\/)\.agent-ui\/[^/]+\/main\.js$/.test(path) && (graph.modules.get(path)?.staticDependencies ?? []).some((dependency) => VIEW_FILE.test(dependency));

export const findViewCodeInBrowserBundle = (graph) => {
  if (graph.roots.some((root) => root.kind === 'entry' && isDevelopmentEntry(graph, root.path))) return [];
  return [...graph.modules.keys()].filter((path) => VIEW_ONLY_MODULE.test(path)).map((path) => `${path} is in a browser bundle (${chainTo(graph, path).join(' -> ')}). It builds specs and belongs to view.js only, so the page downloads code it never runs. Move what imports it into a module that only view.js imports`);
};
