// The plugin that runs the visible part of a soft navigation as one View Transition: the browser captures the old page and animates to
// the new one (a cross-fade by default), instead of the page changing at once. A shell lists it after the navigation plugin it extends:
//
//   plugins: [withNavigation, withViewTransition]      withViewTransition is the export of @ehtb/agent-ui/view-transition
//
// Without it the swap is immediate, as it always was. What it does, and what it leaves alone:
//   * the swap (the new head, the new page, the focus, the scroll) is the update of `document.startViewTransition`, so what the
//     visitor sees is the old page turning into the new one; what the navigation does is the same, and in the same order;
//   * where the browser has no View Transitions, or the visitor asked for reduced motion (`prefers-reduced-motion: reduce`), the swap
//     runs directly;
//   * an update that throws ends in the page load a failed swap always ended in, with the reason in the console.
// The whole page cross-fades, the shell included. To keep the shell still while the page changes, give its elements a
// `view-transition-name` in CSS (`.site-header { view-transition-name: site-header; }`); the browser then moves them as one element
// instead of fading them.
import { fail } from './messages.js';
import { markPagePlugin } from './spec-core.js';

export const viewTransition = ({ win }) => (api) => {
  if (!win.history) return; // a server renders the shell too, and has nothing to animate
  if (typeof api.extendNavigation !== 'function') {
    fail('withViewTransition', 'the shell has no navigation to extend', 'List withNavigation before withViewTransition in the plugins of defineShell: plugins: [withNavigation, withViewTransition]');
  }
  api.extendNavigation({
    swap: async (update) => {
      const reducedMotion = win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
      if (typeof win.document.startViewTransition !== 'function' || reducedMotion) return update();
      await win.document.startViewTransition(update).updateCallbackDone;
    },
  });
};

// The plugin as a shell lists it (`plugins: [withNavigation, withViewTransition]`).
export const withViewTransition = markPagePlugin(function withViewTransition({ win }) {
  return viewTransition({ win });
});
