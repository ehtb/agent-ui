/** The element id of the app's mount point, shared by the renderer, the document builder and the browser. */
export const APP_ELEMENT_ID: 'app';
/** The id of the mount point of a shell (src/shell.js); the page's own mount point is inside it. */
export const SHELL_ELEMENT_ID: 'shell';
/** The id of the script that carries the server's state to the browser. */
export const STATE_ELEMENT_ID: 'agent-ui-state';
export function readServerState(doc?: { getElementById(id: string): { textContent: string | null } | null }, elementId?: string): Record<string, Record<string, any>>;
/** `dev` is written by the generated entry: true in a development build, false in a production one. */
export function browserEnvironment(options: { dev: boolean; basePath?: string }): { root: Element | null; win: Window; fetchFunction: typeof fetch; initialState: Record<string, Record<string, any>>; serverRendered: boolean; dev: boolean; isServerRendering: false; basePath: string };
