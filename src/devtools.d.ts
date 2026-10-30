import type { AppApi } from './ui.js';

/** Makes the browser console show the app: the state at the start and, for every action, a collapsed group with its arguments and the state and derived values it changed. Load it on demand: `import('@ehtb/agent-ui/devtools').then((m) => m.mountDevtools(ui))`; an app made with `debug: true` does it. Returns a function that stops it. */
export function mountDevtools(ui: AppApi): () => void;
