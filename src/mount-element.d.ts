// Type declarations for `@ehtb/agent-ui/mount-element` (src/mount-element.js). Reference: docs/API.md, "Plugins that draw into an element".
import type { AppApi } from './ui.js';

/**
 * Claims the element with this explicit `id` (it must have no children in the spec) for a plugin that draws into it, such as an
 * editor or a chart. `mount` is called once the element is in the page, for each element with the id (one per row of an each,
 * again after a when brings it back); what it returns is called when the element leaves the page or the app is destroyed.
 * Returns a function that gives the id back. An element has one owner.
 */
export function mountElement(
  api: AppApi,
  id: string,
  mount: (element: Element, info: { id: string; key: string | undefined }) => void | (() => void),
): () => void;
