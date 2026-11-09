// Recipe: a dialog that opens, closes on Escape and keeps the focus until it closes.
// Whether it is open is state. The dialog is in the page only while it is open (`when`), the page behind it is `inert`, and
// the plugin focus.js moves the focus in, wraps Tab inside the dialog and gives the focus back to the button that opened it.
// Opening and closing are idempotent.
import { withDialogFocus } from './focus.js';

const dialog = {
  state: { open: false, confirmed: 0 },
  actions: {
    show: { args: {}, run: (store) => store.set('open', true) },
    close: { args: {}, run: (store) => store.set('open', false) },
    confirm: {
      args: {},
      run: (store) => {
        if (!store.get('open')) return;
        store.set('confirmed', store.get('confirmed') + 1);
        store.set('open', false);
      },
    },
  },
};

export const page = { head: { title: 'Dialog - cookbook' }, namespaces: { dialog }, plugins: [withDialogFocus] };
