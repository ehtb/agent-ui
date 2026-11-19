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
// Only the page fades. The element the page is in (the shell's slot) is named for the length of the transition and the root's own
// cross-fade is turned off, so everything outside the slot, the shell's header and footer and any element a new version of the shell adds,
// stays where it is without a `view-transition-name` of its own; the slot fades from the old page to the new one and moves to its new size.
// This needs a browser that has View Transition types (`transition.types`, `:active-view-transition-type()`, Chrome 125, Safari 18.2) and
// constructable stylesheets: elsewhere the whole page cross-fades, shell included, as it did before (the browser's own default), and giving the
// shell's elements a `view-transition-name` in CSS (`.site-header { view-transition-name: site-header; }`) keeps them still then.
// The rule is the plugin's own stylesheet, added to the document's `adoptedStyleSheets` (a Content-Security-Policy that forbids inline
// styles does not stop it), and it applies only to the transitions this plugin starts (the type `agent-ui-page`), so a site's own view
// transitions are left alone.
import { fail } from './messages.js';
import { APP_ELEMENT_ID, markPagePlugin } from './spec-core.js';

const TRANSITION_NAME = 'agent-ui-page';
const RULE = `:root:active-view-transition-type(${TRANSITION_NAME})::view-transition-old(root) { display: none; }
:root:active-view-transition-type(${TRANSITION_NAME})::view-transition-new(root) { animation: none; mix-blend-mode: normal; }
:root:active-view-transition-type(${TRANSITION_NAME})::view-transition-group(root) { animation: none; }`;

// The rule goes into the document once.
const addRule = (win) => {
  const document = win.document;
  if (document.__agentUiViewTransitionRule) return;
  const sheet = new win.CSSStyleSheet();
  sheet.replaceSync(RULE);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  document.__agentUiViewTransitionRule = sheet;
};
const canNameThePage = (win) => typeof win.ViewTransition === 'function' && 'types' in win.ViewTransition.prototype && typeof win.CSSStyleSheet === 'function' && Array.isArray(win.document.adoptedStyleSheets);

export const viewTransition = ({ win }) => (api) => {
  if (!win.history) return; // a server renders the shell too, and has nothing to animate
  if (typeof api.extendNavigation !== 'function') {
    fail('withViewTransition', 'the shell has no navigation to extend', 'List withNavigation before withViewTransition in the plugins of defineShell: plugins: [withNavigation, withViewTransition]');
  }
  api.extendNavigation({
    swap: async (update) => {
      const reducedMotion = win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
      if (typeof win.document.startViewTransition !== 'function' || reducedMotion) return update();
      const slot = canNameThePage(win) ? win.document.getElementById(APP_ELEMENT_ID) : null;
      if (!slot) {
        await win.document.startViewTransition(update).updateCallbackDone;
        return;
      }
      addRule(win);
      // The name is on the slot for the old page's picture too, so it is set before the transition starts and taken off when it ends.
      slot.style.viewTransitionName = TRANSITION_NAME;
      const release = () => {
        slot.style.viewTransitionName = '';
      };
      let transition;
      try {
        transition = win.document.startViewTransition({ update, types: [TRANSITION_NAME] });
      } catch (error) {
        release();
        throw error;
      }
      transition.finished.then(release, release);
      transition.ready.catch(() => {}); // a transition that is skipped rejects `ready`: the swap reports what went wrong, not an unhandled rejection
      await transition.updateCallbackDone;
    },
  });
};

// The plugin as a shell lists it (`plugins: [withNavigation, withViewTransition]`).
export const withViewTransition = markPagePlugin(function withViewTransition({ win }) {
  return viewTransition({ win });
});
