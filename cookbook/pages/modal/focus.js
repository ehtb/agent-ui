// Recipe: focus stays in an open dialog and returns to the control that opened it.
//
// The plugin owns the focus, not the state: `dialog.open` is still the only thing that says whether the dialog exists. It
// watches the spec element with id "dialog" through api.observeElements (the same hook mountElement is built on), focuses the
// dialog itself (it has tabindex="-1" so a screen reader reads its label), wraps Tab and Shift+Tab inside it, and gives the
// focus back to the element that had it before the dialog appeared. The page marks the rest of the content `inert`, so the
// browser's own focus order cannot reach it either.
//
// `isServerRendering` is true while the page is rendered on the server: there is no focus there, only markup.
export const withDialogFocus = ({ isServerRendering, win = globalThis }) => (api) => {
  if (isServerRendering) return;
  let dialog = null;
  let returnFocusTo = null;
  let onKeydown = null;
  let restoreTimer = null;

  // The controls of this dialog. The recipe gives every one an id, so [data-id] is enough and works in the test DOM too.
  const focusable = (element) =>
    [...element.querySelectorAll('[data-id]')].filter(
      (node) => ['button', 'a', 'input', 'select', 'textarea'].includes(node.localName) && !node.disabled && node.getAttribute('tabindex') !== '-1',
    );

  const forgetDialog = () => {
    if (dialog && onKeydown) dialog.removeEventListener?.('keydown', onKeydown);
    dialog = null;
    onKeydown = null;
  };

  const cancelRestore = () => {
    if (restoreTimer !== null) win.clearTimeout?.(restoreTimer);
    restoreTimer = null;
  };

  // Later, after the render that closed the dialog has also removed `inert` from the page behind it.
  const restoreFocus = () => {
    restoreTimer = null;
    if (dialog) return; // the dialog was opened again before the timer ran
    const target = returnFocusTo;
    returnFocusTo = null;
    if (target && (typeof target.ownerDocument?.contains !== 'function' || target.ownerDocument.contains(target))) target.focus?.();
  };

  const stopObserving = api.observeElements({
    added: (element) => {
      if (dialog || element.getAttribute('data-id') !== 'dialog') return;
      cancelRestore(); // a pending restore of an earlier dialog must not steal this one's focus
      dialog = element;
      returnFocusTo = element.ownerDocument?.activeElement ?? null;
      element.focus?.(); // the dialog itself: its aria-labelledby names it, and Tab starts at its first control
      onKeydown = (event) => {
        if (event.key !== 'Tab') return;
        const items = focusable(element);
        if (!items.length) return void event.preventDefault?.();
        const active = element.ownerDocument?.activeElement;
        const index = items.indexOf(active);
        if (event.shiftKey && index <= 0) {
          event.preventDefault?.();
          items[items.length - 1].focus();
        } else if (!event.shiftKey && (index === -1 || index === items.length - 1)) {
          event.preventDefault?.();
          items[0].focus();
        }
      };
      element.addEventListener?.('keydown', onKeydown);
    },
    removed: (node) => {
      if (node !== dialog) return;
      forgetDialog();
      // The rest of the page is inert until this same render has finished; wait for it before focusing the old control.
      cancelRestore();
      restoreTimer = win.setTimeout(restoreFocus, 0);
    },
  });

  api.onDestroy(() => {
    stopObserving();
    cancelRestore();
    forgetDialog();
    returnFocusTo = null; // the trigger is going away with the page: there is nowhere to put the focus back
  });
};
