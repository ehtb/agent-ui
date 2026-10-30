// The browser half of hot reload (served by `agent-ui dev` as /__dev/client.js; cli/hot-reload.mjs is the other half). It keeps only
// the stream's server/build ids and its update queue, and uses no browser storage: the page's state is handed from the old app to
// the new one in memory (src/hot.js).
// An update that it cannot apply to this page ends in a reload, which is what the page would have had without hot reload.
(() => {
  let serverId = null;
  let build = null; // the last build this page heard about; a page hidden in the Back/Forward cache misses broadcasts
  let reconnected = false; // a stream that came back after pagehide; if hello never arrived, updates may have been missed
  let queue = Promise.resolve(); // updates are applied one after the other
  const hot = () => window.__agentUiHot;

  // A changed stylesheet: the new one is added next to the old and the old goes when the new has loaded, so the page never flashes unstyled.
  const swapStylesheet = (path, version) => {
    const old = [...document.querySelectorAll('link[rel="stylesheet"]')].filter((link) => (link.getAttribute('href') || '').split('?')[0] === path);
    if (!old.length) return null;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `${path}?v=${version}`;
    return new Promise((done) => {
      link.onload = () => done(true);
      link.onerror = () => done(false);
      old[old.length - 1].after(link);
    }).then((loaded) => {
      if (loaded) old.forEach((previous) => previous.remove());
      else {
        link.remove(); // the new sheet did not load: the page keeps the one it has
        console.error(`[agent-ui] hot update: ${path} did not load, the old stylesheet stays`);
      }
    });
  };

  const apply = async (update) => {
    if (update.reload) return location.reload();
    await Promise.all(Object.entries(update.css).map(([path, version]) => swapStylesheet(path, version)));
    const entries = Object.entries(update.entries);
    if (!entries.length) return;
    const api = hot();
    if (!api) return location.reload(); // not a page of agent-ui (an app made by hand): nothing to swap
    const running = api.entryUrl();
    if (!running) return;
    const next = update.entries[new URL(running).pathname];
    if (!next) return; // the running page is not affected
    if (api.hasShell() && !next.onlyEntry) return location.reload(); // the shell may have changed too, and it is not swapped
    const url = new URL(next.url, location.href).href;
    await import(url);
    api.swap(url);
    console.log(`[agent-ui] hot update: ${new URL(running).pathname}`);
  };

  const onMessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.hello) {
      if (serverId !== null && serverId !== message.hello) return location.reload(); // the dev server was restarted: this page is from the one before
      // The stream was closed while this page was hidden in the Back/Forward cache. If a build happened meanwhile, the page
      // missed it, so it loads the current build rather than showing something stale. A page that never received the first
      // hello cannot know either: its stream may have been closed before the server introduced itself.
      if (reconnected && build === null) return location.reload();
      if (build !== null && build !== message.build) return location.reload();
      reconnected = false;
      serverId = message.hello;
      build = message.build;
      return;
    }
    if (typeof message.build === 'number') build = message.build;
    queue = queue.then(() => apply(message)).catch((error) => {
      console.error('[agent-ui] hot update failed, reloading:', error);
      location.reload();
    });
  };

  // HTTP/1.1 gives a host six connections, and a page the browser keeps for Back/Forward keeps its open stream: a few page loads
  // would hold them all and the next one would wait for a connection. So the stream closes when the page is hidden, and opens
  // again when a kept page is shown.
  let source = null;
  const connect = () => {
    source = new EventSource('/__dev/events');
    source.onmessage = onMessage;
  };
  window.addEventListener('pagehide', () => {
    source?.close();
    source = null;
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && !source) {
      reconnected = true;
      connect();
    }
  });
  connect();
})();
