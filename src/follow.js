// The plugin behind the `follow` prop: while `follow` is true, the element tracks the pointer (the drag overlay of a sortable list, a
// slider thumb). A page lists it, `plugins: [withFollow]`; an app made with app() lists `follow`. A spec that uses `follow` without it
// fails at mount (in development) with this import in the message. Copy recipe `drag-reorder` (`agent-ui explain drag-reorder`).
//
//   plugins: [withFollow]          withFollow is the export of @ehtb/agent-ui/follow
//
// It listens to the document only while an element follows, and writes how far the element must move from where its layout put it as
// the CSS custom properties --follow-x and --follow-y; the CSS decides what to do with them (a transform). No coordinate enters the
// state or the log, and the element keeps its grab point when a list reorders under it (the runtime's reorder hook, `api.onReorder`).
// The runtime hands the plugin every write of the prop (`api.handleProperty`), also the ones made before the plugin was installed.
import { markPagePlugin, nextFrame } from './spec-core.js';

export const follow = (api) => {
  const document = globalThis.document;
  const followers = new Set();
  const stopFollowing = (element) => element.__follow?.stop();
  const startFollowing = (element) => {
    // The server's DOM has no layout: nothing to follow there.
    if (element.__follow || !document?.addEventListener || !element.getBoundingClientRect) return;
    let start = null;
    let pointer = null;
    let origin = null;
    let moved = { x: 0, y: 0 };
    let scheduled = false;
    const follower = {
      update: () => {
        scheduled = false;
        if (!pointer || element.__follow !== follower) return;
        const rect = element.getBoundingClientRect();
        moved = { x: origin.left + pointer.x - start.x - (rect.left - moved.x), y: origin.top + pointer.y - start.y - (rect.top - moved.y) };
        element.style.setProperty('--follow-x', `${moved.x}px`);
        element.style.setProperty('--follow-y', `${moved.y}px`);
      },
      stop: () => {
        document.removeEventListener('pointermove', onMove);
        followers.delete(follower);
        element.__follow = null;
        pointer = null; // a frame already scheduled must not write after this
        element.style?.removeProperty('--follow-x');
        element.style?.removeProperty('--follow-y');
      },
    };
    // The first move fixes the start: the element is still where the list put it, so the pointer's place inside it is kept. A row that
    // left the page while it followed stops at the next move.
    const onMove = (event) => {
      if (element.isConnected === false) return follower.stop();
      pointer = { x: event.clientX, y: event.clientY };
      if (!start) {
        start = pointer;
        const rect = element.getBoundingClientRect();
        origin = { left: rect.left, top: rect.top };
      }
      if (!scheduled) {
        scheduled = true;
        nextFrame(follower.update);
      }
    };
    document.addEventListener('pointermove', onMove);
    followers.add(follower);
    // Read by the moves plugin (src/moves.js): a row that follows the pointer is not also slid to its new place.
    element.__follow = follower;
  };

  api.handleProperty('follow', (element, value) => (value ? startFollowing(element) : stopFollowing(element)));
  // A list that reorders under a following row: the row is placed again at once, under the pointer.
  api.onReorder(() => () => followers.forEach((follower) => follower.update()));
  api.onDestroy(() => followers.forEach((follower) => follower.stop()));
};

// The plugin as a page lists it (`plugins: [withFollow]`).
export const withFollow = markPagePlugin(function withFollow() {
  return follow;
});
