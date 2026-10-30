// The one traversal of "the nodes below a node", for everything that finds or lists nodes of a spec (patchSpec, mountElement).
// Its own module so that the runtime, which does not walk specs, does not carry it.
import { isPlainObject } from './spec-core.js';

// Where a node holds more nodes: an element's and a `when`'s children, a `when`'s otherwise, an `each`'s template.
export const SPEC_SLOTS = ['children', 'otherwise', 'template'];

// Walks a spec: calls visit(node, { parent, slot, index }) for every object node, parents before children, in document order
// (index is the position in a list of children, null for a single child). The first value visit returns that is not undefined
// stops the walk and is returned. The one traversal of "the nodes below a node" for everything that only needs to find or list nodes.
export const visitSpec = (spec, visit) => {
  const walk = (node, parent, slot, index) => {
    if (!isPlainObject(node)) return undefined;
    const result = visit(node, { parent, slot, index });
    if (result !== undefined) return result;
    for (const slotName of SPEC_SLOTS) {
      const value = node[slotName];
      if (value === undefined) continue;
      const list = Array.isArray(value) ? value : [value];
      for (let position = 0; position < list.length; position++) {
        const found = walk(list[position], node, slotName, Array.isArray(value) ? position : null);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  };
  return walk(spec, null, null, null);
};
