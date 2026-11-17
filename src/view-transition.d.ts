import type { Plugin } from './ui.js';

/** The plugin with its parts injectable (tests, unusual hosts). The shell lists the navigation plugin before it. */
export function viewTransition(options: { win: any }): Plugin;
/** The plugin as a shell lists it: `defineShell({ plugins: [withNavigation, withViewTransition] })`. */
export function withViewTransition(environment: { win: any }): Plugin;
