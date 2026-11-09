// Recipe: a plugin that only makes sense in a browser (here: saving the text a little after the last keystroke).
// The page owns the text and the save status; the plugin (autosave.js) watches the text and reports `note.saving` and `note.saved`.
import { withAutosave } from './autosave.js';

const note = {
  state: { text: '', status: 'saved' },
  actions: {
    setText: { args: { value: 'string' }, run: (store, { value }) => { store.set('text', value); store.set('status', 'unsaved'); } },
    saving: { args: {}, run: (store) => store.set('status', 'saving') },
    saved: { args: {}, run: (store) => store.set('status', 'saved') },
    saveFailed: { args: {}, run: (store) => store.set('status', 'failed') },
  },
};

export const page = { head: { title: 'Autosave - cookbook' }, namespaces: { note }, plugins: [withAutosave] };
