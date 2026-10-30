// A plugin with effects of its own (a timer, a listener on the window, a request). The server runs the plugins of a page too, against
// a stand-in window that holds only location, addEventListener, removeEventListener, setTimeout and clearTimeout, and a page that
// is being rendered has nothing to save: so the plugin starts with `if (isServerRendering) return;`. Everything else is the rule
// of every plugin: state goes out through api.watch, what happens goes back through api.dispatch, quiet while api.replaying,
// and everything started is stopped in api.onDestroy.
//
// The page lists it as `plugins: [withAutosave]`: the page hands every plugin its environment (win, fetchFunction, isServerRendering).
export const AUTOSAVE_DELAY_MS = 1500;

export const withAutosave = ({ win, fetchFunction, isServerRendering }) => (api) => {
  if (isServerRendering) return;

  let timer = null;
  const save = async () => {
    timer = null;
    if (api.replaying) return;
    api.dispatch('note.saving', {});
    try {
      const response = await fetchFunction('/note', { method: 'PATCH', body: JSON.stringify({ text: api.get('note.text') }) });
      api.dispatch(response.ok ? 'note.saved' : 'note.saveFailed', {});
    } catch {
      api.dispatch('note.saveFailed', {});
    }
  };
  const schedule = () => {
    win.clearTimeout(timer);
    timer = win.setTimeout(save, AUTOSAVE_DELAY_MS);
  };

  const stop = api.watch(['note.text'], () => {
    if (!api.replaying) schedule();
  });
  // Leaving the page must not drop the last edit: save at once.
  const onHide = () => {
    if (timer !== null) {
      win.clearTimeout(timer);
      void save();
    }
  };
  win.addEventListener('pagehide', onHide);

  api.onDestroy(() => {
    stop();
    win.clearTimeout(timer);
    win.removeEventListener('pagehide', onHide);
  });
};
