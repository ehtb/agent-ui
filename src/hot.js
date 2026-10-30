// The hot swap of the running page, for `agent-ui dev` (cli/hot-reload.mjs and cli/hot-client.js are the other halves). A production build
// replaces this module with a stub (build/stubs/hot-omitted.js), so none of it is downloaded.
//
// What the dev client does after a rebuild that changed the running page: it imports the page's new entry file (which registers the new
// definition through startPage, as a soft navigation's import does) and calls `swap(url)`. The swap is the one of a soft navigation
// (src/navigation.js, showPage) with one difference: the new page starts from the state the old one had, so an edit does not cost the
// visitor what they typed. State is plain data, so this is the same handover a server gives (`initialState`). If the new definition does not
// accept that state (a namespace or key was renamed), the page starts afresh and the console says so. The shell, if there is one, stays.
import { browserEnvironment } from './hydrate.js';

export const exposeHot = ({ entries, getCurrent }) => {
  if (typeof window === 'undefined') return;
  window.__agentUiHot = {
    // The URL the running page's entry was imported from, or null.
    entryUrl: () => {
      const running = getCurrent();
      for (const [url, entry] of entries) if (running && entry === running.entry) return url;
      return null;
    },
    hasShell: () => Boolean(getCurrent()?.shellApp),
    swap: (url) => {
      const running = getCurrent();
      const entry = entries.get(url);
      if (!running || !entry) throw new Error(`hot swap: no page was registered by ${url}`);
      const state = running.ui.state();
      running.ui.destroy();
      running.entry = entry;
      const environment = { ...browserEnvironment({ dev: running.dev }), root: running.slot, shell: running.shellApp };
      try {
        running.ui = entry.mount({ ...environment, initialState: state });
      } catch (error) {
        console.warn(`[agent-ui] hot update: the page did not accept the state it had (${String(error?.message ?? error).split('\n')[0]}), so it starts afresh`);
        running.ui = entry.mount(environment);
      }
      return running.ui;
    },
  };
};
