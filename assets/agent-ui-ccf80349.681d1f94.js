import { module_base_path, module_ui, module_errors, module_messages, module_namespaces } from "./agent-ui.02a96618.js";
const module_hydrate = (() => {
const { withBase } = module_base_path;
const APP_ELEMENT_ID = 'app';
const SHELL_ELEMENT_ID = 'shell';
const STATE_ELEMENT_ID = 'agent-ui-state';
const readServerState = (doc = document, elementId = STATE_ELEMENT_ID) => {
try {
const element = doc.getElementById(elementId);
return element ? JSON.parse(element.textContent) : {};
} catch {
return {};
}
};
const browserEnvironment = ({ dev, basePath = '' }) => ({
root: document.getElementById(APP_ELEMENT_ID),
win: window,
fetchFunction: window.fetch && (basePath ? (url, init) => window.fetch(withBase(basePath, url), init) : window.fetch.bind(window)),
basePath,
initialState: readServerState(document),
serverRendered: document.getElementById?.(STATE_ELEMENT_ID) != null,
dev,
isServerRendering: false,
});
return { APP_ELEMENT_ID, SHELL_ELEMENT_ID, STATE_ELEMENT_ID, readServerState, browserEnvironment };
})();
const module_url_pattern = (() => {
const SEGMENT_RANK = { literal: 3, param: 2, rest: 1 };
const PARAM_NAME = /^[A-Za-z][A-Za-z0-9]*$/;
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PARAM_SOURCE = '([^/]+)';
const REST_SOURCE = '([^/]+(?:/[^/]+)*)';
const withoutTrailingSlash = (pathname) => (pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname);
const decodeSegment = (segment) => {
try {
return decodeURIComponent(segment);
} catch {
return null;
}
};
const compileUrlPattern = (pattern) => {
if (typeof pattern !== 'string') throw new Error(`URL pattern must be a string, got ${typeof pattern}. Write for example "/items/:id"`);
const parts = pattern.split('/').map((part) => {
if (part.startsWith(':')) return { kind: 'param', name: part.slice(1) };
if (part.startsWith('*')) return { kind: 'rest', name: part.slice(1) };
return { kind: 'literal', literal: part };
});
const names = new Set();
parts.forEach((part, index) => {
if (part.kind === 'literal') return;
const written = `${part.kind === 'param' ? ':' : '*'}${part.name}`;
if (!PARAM_NAME.test(part.name)) throw new Error(`URL pattern "${pattern}": "${written}" is not a parameter name. Use ":name" or "*name" with letters and digits, starting with a letter`);
if (part.kind === 'rest' && index !== parts.length - 1) throw new Error(`URL pattern "${pattern}": "${written}" must be the last segment. Move it to the end, or use ":name" for a single segment`);
if (names.has(part.name)) throw new Error(`URL pattern "${pattern}": the parameter "${part.name}" is used twice. Give each parameter its own name`);
names.add(part.name);
});
const source = parts.map((part) => (part.kind === 'literal' ? escapeRegex(part.literal) : part.kind === 'param' ? PARAM_SOURCE : REST_SOURCE)).join('/');
const regex = new RegExp(`^${source}$`);
const parameters = parts.filter((part) => part.kind !== 'literal');
return {
match: (location) => {
const found = typeof location === 'string' ? regex.exec(location) : null;
if (!found) return null;
const params = {};
for (let index = 0; index < parameters.length; index++) {
const { kind, name } = parameters[index];
const decoded = kind === 'rest' ? found[index + 1].split('/').map(decodeSegment) : [decodeSegment(found[index + 1])];
if (decoded.includes(null)) return null;
params[name] = decoded.join('/');
}
return params;
},
build: (params) =>
parts
.map((part) => {
if (part.kind === 'literal') return part.literal;
const value = params[part.name] ?? '';
return part.kind === 'rest' ? String(value).split('/').map(encodeURIComponent).join('/') : encodeURIComponent(value);
})
.join('/'),
paramNames: parameters.map((part) => part.name),
specificity: parts.map((part) => SEGMENT_RANK[part.kind]),
shape: parts.map((part) => (part.kind === 'literal' ? part.literal : part.kind === 'param' ? ':' : '*')).join('/'),
};
};
const sortBySpecificity = (entries, readPattern = (entry) => entry) =>
[...entries].sort((first, second) => {
const left = readPattern(first).specificity;
const right = readPattern(second).specificity;
for (let index = 0; index < Math.min(left.length, right.length); index++) {
if (left[index] !== right[index]) return right[index] - left[index];
}
return 0;
});
return { escapeRegex, withoutTrailingSlash, compileUrlPattern, sortBySpecificity };
})();
const module_pages_checks = (() => {
const VIEW_EXPORTS = [];
const checkPage = () => {};
const checkPageExports = () => {};
const checkViewExports = () => {};
return { VIEW_EXPORTS, checkPage, checkPageExports, checkViewExports };
})();
const module_hot = (() => {
const exposeHot = () => {};
return { exposeHot };
})();
const module_pages_server = (() => {
const createDocumentDescriber = () => () => undefined;
const createStatusReader = () => () => undefined;
return { createDocumentDescriber, createStatusReader };
})();
const module_pages = (() => {
const { app } = module_ui;
const { browserEnvironment } = module_hydrate;
const { codedError } = module_errors;
const { fail, problem } = module_messages;
const { RESERVED_NAMESPACE, declaredStateKeys, mergeInitialState } = module_namespaces;
const { withoutBase } = module_base_path;
const { compileUrlPattern, withoutTrailingSlash } = module_url_pattern;
const { checkPage, checkPageExports, checkViewExports } = module_pages_checks;
const { exposeHot } = module_hot;
const { createDocumentDescriber, createStatusReader } = module_pages_server;
const contentOf = (viewModule, file) => {
checkViewExports(viewModule, file);
return { view: viewModule.view, layout: viewModule.layout, pending: viewModule.pending, shell: viewModule.shell };
};
const pageOf = (pageModule, file) => {
checkPageExports(pageModule, file);
return pageModule.page;
};
const definePage = (page, { path, view, layout, pending, spec, shell: shellContent }) => {
checkPage(page, { path, view, layout, pending, spec, shell: shellContent });
const pattern = compileUrlPattern(path);
const { namespaces: pageNamespaces = {}, plugins: pagePlugins = [] } = page;
const stateKeys = Object.entries(pageNamespaces).flatMap(([namespace, definition]) => declaredStateKeys(definition).map((key) => [namespace, key]));
const readiness = (currentState) => {
if (!page.ready) return undefined;
const answer = page.ready(currentState);
if (typeof answer !== 'boolean') throw codedError('AUI0501', { path, answer });
return answer;
};
const statusOf = createStatusReader({ page, path });
const routeNamespace = {
state: { params: {}, hydrated: false, ...page.shell?.route.state },
actions: { hydrate: { args: {}, run: (store) => store.set('hydrated', true) }, ...page.shell?.route.actions },
derive: {
ready: (get) => {
const snapshot = { route: { params: get('params') } };
for (const [namespace, key] of stateKeys) (snapshot[namespace] ??= {})[key] = get(`${namespace}.${key}`);
return readiness(snapshot) ?? true;
},
},
};
const namespaces = { [RESERVED_NAMESPACE]: routeNamespace, ...pageNamespaces };
const buildSpec = () => {
const content = pending ? { when: { state: 'route.ready' }, children: view, otherwise: pending } : view;
return layout ? layout(content) : content;
};
const pageSpec = spec !== undefined ? spec : buildSpec();
const describePage = createDocumentDescriber({ page, path });
const keepTitleCurrent = (win) => (api) => {
const writeTitle = (title) => {
if (win?.document && win.document.title !== title) win.document.title = title;
};
if (typeof page.head.title !== 'function') return writeTitle(page.head.title);
api.watch(api.keys(), () => writeTitle(page.head.title(api.state())));
};
const createShell = page.shell ? (environment) => page.shell.createApp(environment, shellContent.view) : undefined;
const PLUGIN_FIX = 'A page lists plugin factories, (environment) => plugin, for example plugins: [withResources]; the plugin itself (follow, moves, resources(fetchFunction)) belongs in app({ plugins })';
const pluginName = (plugin) => (typeof plugin?.name === 'string' && plugin.name ? ` ("${plugin.name}")` : '');
const installPagePlugin = (plugin, index, environment) => {
if (typeof plugin !== 'function') fail(`page "${path}"`, `plugins[${index}] is ${typeof plugin}, not a function`, PLUGIN_FIX);
let installed;
try {
installed = plugin({ ...environment, page: { path, head: page.head } });
} catch (error) {
const wrapped = new Error(problem(`page "${path}"`, `plugins[${index}]${pluginName(plugin)} threw ${error?.message ?? String(error)}`, PLUGIN_FIX));
wrapped.cause = error;
throw wrapped;
}
if (typeof installed !== 'function') {
fail(`page "${path}"`, `plugins[${index}]${pluginName(plugin)} returned ${installed === undefined ? 'nothing' : typeof installed}, not a plugin`, PLUGIN_FIX);
}
return installed;
};
let specChecked = false;
const create = (environment) => {
const { root, win, dev, initialState = {}, shell: shellApp, basePath = '' } = environment;
const pathname = win?.location?.pathname === undefined ? path : withoutBase(basePath, win.location.pathname) ?? path;
const params = pattern.match(withoutTrailingSlash(pathname)) ?? {};
const ui = app({
namespaces,
initialState: mergeInitialState(initialState, { [RESERVED_NAMESPACE]: { params } }),
spec: pageSpec,
root,
dev,
basePath,
debug: environment.debug ?? page.debug,
plugins: [...pagePlugins.map((plugin, index) => installPagePlugin(plugin, index, environment)), keepTitleCurrent(win)],
specChecked: specChecked && !dev && Object.keys(initialState).length === 0,
});
specChecked = true;
if (shellApp && page.shell) {
try {
ui.onDestroy(page.shell.connect(ui, shellApp, win, basePath));
} catch (error) {
ui.destroy();
throw error;
}
}
ui.isReady = () => readiness(ui.state());
ui.getStatus = () => statusOf(ui.state());
return ui;
};
return {
path,
namespaces,
spec: pageSpec,
create,
mount: (environment) => {
const ui = create(environment);
ui.dispatch('route.hydrate');
return ui;
},
createShell,
shellName: page.shell?.name,
shellContent,
shellNamespaces: page.shell?.namespaces,
describePage,
};
};
const entries = new Map();
let current = null;
const findEntry = (url) => entries.get(url);
const currentPage = () => current;
const startPage = (page, { url, dev, basePath = '', ...options }) => {
const entry = definePage(page, options);
exposeHot({ entries, getCurrent: () => current });
if (url) entries.set(url, entry);
if (current) return entry;
const environment = browserEnvironment({ dev, basePath });
current = { ...(page.shell ? page.shell.start(entry, environment) : { entry, ui: entry.mount(environment), shellApp: null, slot: environment.root }), dev, basePath };
return entry;
};
return { contentOf, pageOf, definePage, findEntry, currentPage, startPage };
})();
export { module_pages };
