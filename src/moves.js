// The plugin that slides a row to its new place when its list reorders. A row of an `each` whose element has `transition: ms` gets its
// enter and leave markers from the runtime with or without this plugin; with it, a row that changes position also slides there over
// the same number of ms. A page lists it, `plugins: [withMoves]`; an app made with app() lists `moves`. Without it the rows jump, and in
// development the runtime says so in the console the first time, with this import. Copy recipe `drag-reorder`.
//
//   plugins: [withMoves]           withMoves is the export of @ehtb/agent-ui/moves
//
// It uses the browser's animation engine (FLIP): before the reorder (the runtime's hook, `api.onReorder`) it measures the rows that
// stay, after it plays a translate from the old spot to the new one with Element.animate. Nothing is animated where there is no layout
// (server rendering, the test DOM), while the app replays, for a visitor who prefers reduced motion, or for a row that follows the
// pointer (src/follow.js). State is final before anything moves.
export const moves = (api) => {
  const canAnimate = () => !api.replaying && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  api.onReorder((staying) => {
    if (!canAnimate()) return null;
    // "First" is where the row is on screen now, which for a row still sliding from an earlier move is partway. That earlier animation
    // is cancelled right after measuring, so "Last" is the real layout slot and two animations never stack on one row.
    const before = new Map();
    for (const element of staying) {
      if (element.__transitionMs && !element.__follow && element.getBoundingClientRect) {
        before.set(element, element.getBoundingClientRect());
        element.__moveAnimation?.cancel();
      }
    }
    if (!before.size) return null;
    return () => {
      for (const [element, rect] of before) {
        if (!element.animate) continue;
        const after = element.getBoundingClientRect();
        const deltaX = rect.left - after.left;
        const deltaY = rect.top - after.top;
        if (deltaX === 0 && deltaY === 0) continue;
        element.__moveAnimation = element.animate([{ transform: `translate(${deltaX}px, ${deltaY}px)` }, { transform: 'none' }], { duration: element.__transitionMs, easing: 'ease' });
      }
    };
  });
};

// The plugin as a page lists it (`plugins: [withMoves]`).
export const withMoves = () => moves;
