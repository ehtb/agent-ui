// Development checks for definePage (src/pages.js): every mistake in a page is reported when the page is defined, with its
// URL and the fix. Production builds replace this module with a stub whose function does nothing
// (build/stubs/pages-checks-omitted.js), the same way as src/spec-checks.js: a shipped app was checked in development and
// does not carry the messages.
import { didYouMean, fail } from './messages.js';
import { IDENTIFIER, NAMESPACE_KEYS, RESERVED_NAMESPACE } from './namespaces.js';
import { isBinding, isPlainObject } from './spec-core.js';
import { APP_ELEMENT_ID } from './hydrate.js';
import { compileUrlPattern } from './url-pattern.js';
import { DYNAMIC_HEAD_TAGS, withHead } from './head.js';
import { isReservedAttribute } from './grammar.js';
import { ATTRIBUTE_NAME, BODY_TAGS, DATA_SCRIPT_TYPES, HEAD_KEYS, HEAD_TAGS, VOID_HEAD_TAGS } from './head-document.js';

const PAGE_KEYS = ['head', 'namespaces', 'plugins', 'ready', 'status', 'shell', 'debug'];
// What a literal segment of a page's path may hold (a parameter segment is judged by compileUrlPattern, the one grammar of URL patterns).
const LITERAL_SEGMENT = /^[A-Za-z0-9._~-]+$/;
const PATH_ADVICE = 'Use "/", literal segments ("/about"), ":name" for one segment ("/item/:id"), and "*name" as the last segment to match the rest ("/docs/*path"); no trailing slash, no "#"';

// A page's path is a URL pattern (src/url-pattern.js) that also starts with "/", has no empty segment and no trailing slash, and
// whose literal segments are plain URL characters. The pattern's own mistakes (a bad name, "*name" not last, a name twice) are
// reported by compileUrlPattern, with its message.
const checkPagePath = (path) => {
  if (typeof path !== 'string' || !path.startsWith('/')) fail('definePage', `path ${JSON.stringify(path)} is not allowed`, PATH_ADVICE);
  if (path === '/') return;
  const segments = path.slice(1).split('/');
  for (const segment of segments) {
    const isParameter = segment.startsWith(':') || segment.startsWith('*');
    if (!segment || (!isParameter && !LITERAL_SEGMENT.test(segment))) fail('definePage', `path ${JSON.stringify(path)} is not allowed`, PATH_ADVICE);
  }
  try {
    compileUrlPattern(path);
  } catch (error) {
    fail('definePage', `path ${JSON.stringify(path)} is not allowed (${error.message})`, PATH_ADVICE);
  }
};

// What view.js may export. The generated modules read these names off the module, so a misspelt export would be
// dropped without a word; this turns it into an error with the nearest valid name.
export const VIEW_EXPORTS = ['view', 'layout', 'pending', 'shell', 'paths'];
export const checkViewExports = (viewModule, file) => {
  for (const name of Object.keys(viewModule)) {
    if (!VIEW_EXPORTS.includes(name)) fail(file, `unknown export "${name}"`, `${didYouMean(name, VIEW_EXPORTS)}Export only ${VIEW_EXPORTS.join(', ')} from view.js; anything else belongs in page.js or in a module you import`);
  }
};

// A page.js must export `page`. Without this, a misspelt export (`pages`) reaches definePage as `undefined`, and the message names
// the URL rather than the file. A page.js that exports the view's names is the file split the wrong way round.
export const checkPageExports = (pageModule, file) => {
  if (pageModule.page !== undefined) return;
  const names = Object.keys(pageModule);
  const misplaced = names.find((name) => VIEW_EXPORTS.includes(name));
  if (misplaced) fail(file, `exports "${misplaced}" instead of "page"`, `page.js holds the page's behavior: write \`export const page = { head: { title: '...' } }\`. Export \`${misplaced}\` from the view.js next to it instead`);
  const suggestion = names.map((name) => didYouMean(name, ['page'])).find(Boolean) ?? '';
  fail(file, 'does not export "page"', `${suggestion}Write \`export const page = { head: { title: '...' } }\` in ${file}: page.js holds the page's behavior, and the view.js next to it holds the content`);
};

// The shape of `head`, checked when the page is defined (development only: this module is stubbed in production).
const checkHeadShape = (head, where) => {
  const problem = (what, fix) => fail(where, what, fix);
  if (!isPlainObject(head)) problem('"head" must be an object', 'Write `head: { title: \'Page title\' }`');
  for (const key of Object.keys(head)) {
    if (!HEAD_KEYS.includes(key)) fail(`${where} head`, `unknown key "${key}"`, `${didYouMean(key, HEAD_KEYS)}Allowed keys: ${HEAD_KEYS.join(', ')}`);
  }
  if (head.title === undefined) problem('head.title is missing', 'Every page needs a title: a string or (state) => string');
  for (const key of ['title', 'description']) {
    const value = head[key];
    if (value !== undefined && typeof value !== 'string' && typeof value !== 'function') problem(`head.${key} must be a string or a function (state) => string`, `Write head: { ${key}: 'text' } or head: { ${key}: (state) => ... }`);
  }
  const checkAttributes = (props, at) => {
    if (!isPlainObject(props)) fail(`${where} ${at}`, 'must be an object of attributes', `Write ${at}: { lang: 'en' }`);
    for (const [name, value] of Object.entries(props)) {
      if (!ATTRIBUTE_NAME.test(name)) fail(`${where} ${at}`, `"${name}" is not an attribute name`, 'Use lower case letters, digits, "-", "_", ":" and ".", starting with a letter');
      if (/^on/i.test(name)) fail(`${where} ${at}`, `"${name}" is an event handler attribute`, 'Handlers are actions: attach them in the view with `on: { click: act(...) }`');
      if (isReservedAttribute(name)) fail(`${where} ${at}`, `"${name}" is the framework's own attribute`, 'Leave it out (every data-agent-ui-* name is the framework\'s)');
      if (isBinding(value)) fail(`${where} ${at}`, `${name} is a binding object`, 'A head value is a literal or a function of the state snapshot: write `(state) => state.item.name`');
      if (value !== undefined && value !== null && !['string', 'number', 'boolean', 'function'].includes(typeof value)) fail(`${where} ${at}`, `${name} must be a string, a number, a boolean or a function (state) => one of those`, `Write ${name}: 'text'`);
    }
  };
  if (head.html !== undefined) checkAttributes(head.html, 'html');
  if (head.body !== undefined) checkAttributes(head.body, 'body');
  const checkTags = (tags, at, allowed) => {
    if (!Array.isArray(tags)) fail(`${where} ${at}`, 'must be a list of elements', `Write ${at}: [{ tag: '${allowed[0]}', props: { ... } }]`);
    tags.forEach((node, index) => {
      const here = `${where} ${at}[${index}]`;
      if (!isPlainObject(node)) fail(here, 'must be an element { tag, props, children }', `Write { tag: '${allowed[0]}', props: { ... } }`);
      for (const key of Object.keys(node)) {
        if (!['tag', 'props', 'children'].includes(key)) fail(here, `unknown key "${key}"`, `${didYouMean(key, ['tag', 'props', 'children'])}An element has tag, props and children`);
      }
      if (!allowed.includes(node.tag)) {
        const moved = node.tag === 'title' ? ' The title is `head.title`.' : '';
        fail(here, `"${node.tag}" is not allowed here`, `${didYouMean(String(node.tag), allowed)}Allowed in ${at}: ${allowed.join(', ')}.${moved}`);
      }
      if (node.props !== undefined) checkAttributes(node.props, `${at}[${index}].props`);
      const props = node.props ?? {};
      if (node.tag === 'meta' && (props.name === 'description')) fail(here, 'a meta description is `head.description`', 'Use head.description, so the page has one way to say it');
      if (node.tag === 'meta' && ('charset' in props || props['http-equiv'] === 'content-type')) fail(here, 'the document\'s character set is written by the framework', 'Leave the charset out');
      if (node.tag === 'link' && typeof props.rel === 'function') fail(here, 'the rel of a link is a literal', 'A function could produce "stylesheet", which is not written here (page styles are page.css); write rel as a string and let href follow the state');
      if (node.tag === 'link' && typeof props.rel === 'string' && props.rel.toLowerCase().split(/\s+/).includes('stylesheet')) fail(here, 'a stylesheet link is not written here', 'Put the styles in page.css (this page) or pages/style.css (every page): the build links them and a soft navigation waits for them');
      if (VOID_HEAD_TAGS.includes(node.tag) && node.children !== undefined) fail(here, `${node.tag} has no children`, 'Put the value in props');
      if (node.tag === 'script' && props.src !== undefined && node.children !== undefined) fail(here, 'a script has either `src` or children, not both', 'Remove one of them');
      if (node.children !== undefined) {
        const isData = node.tag === 'script' && DATA_SCRIPT_TYPES.includes(props.type);
        if (typeof node.children === 'function' && !isData) fail(here, `the children of a ${node.tag} are a literal string`, `Only a script of type ${DATA_SCRIPT_TYPES.join(', ')} may build its children from the state`);
        if (typeof node.children !== 'string' && typeof node.children !== 'function' && !isData) fail(here, `the children of a ${node.tag} must be a string`, 'Write the text as a string');
        if (isData && isBinding(node.children)) fail(here, 'children is a binding object', 'A head value is a literal or a function of the state snapshot: write `(state) => ({ ... })`');
      }
      if (!DYNAMIC_HEAD_TAGS.includes(node.tag)) {
        for (const [name, value] of Object.entries(props)) {
          if (typeof value === 'function') fail(here, `${name} of a ${node.tag} is a function`, `A ${node.tag} is written once by the server, so its attributes are literals (a meta or link can follow the state)`);
        }
      }
    });
  };
  if (head.tags !== undefined) checkTags(head.tags, 'tags', HEAD_TAGS);
  if (head.bodyTags !== undefined) checkTags(head.bodyTags, 'bodyTags', BODY_TAGS);
};

// A head value that follows the state is only kept current in the browser by the plugin `withHead`: a page that has one without
// the plugin would show the server's value until the next page load, with nothing saying so.
const checkHeadIsKeptCurrent = (page, where) => {
  const { head } = page;
  const dynamic = [];
  if (typeof head.description === 'function') dynamic.push('description');
  for (const name of ['html', 'body']) for (const [key, value] of Object.entries(head[name] ?? {})) if (typeof value === 'function') dynamic.push(`${name}.${key}`);
  for (const name of ['tags', 'bodyTags']) (head[name] ?? []).forEach((node, index) => {
    for (const [key, value] of Object.entries(node.props ?? {})) if (typeof value === 'function') dynamic.push(`${name}[${index}].props.${key}`);
  });
  if (dynamic.length && !(Array.isArray(page.plugins) && page.plugins.includes(withHead))) {
    fail(where, `head.${dynamic[0]} follows the state, but nothing keeps the browser's document current`, "Add `plugins: [withHead]` to page.js (withHead is the export of `@ehtb/agent-ui/head`), or make the value a literal");
  }
};

// The places the page's element ("app") stands in a shell's spec: [{ dynamic }] for each, `dynamic` when it is inside a `when` or an `each`.
const slotsIn = (node, dynamic = false) => {
  if (Array.isArray(node)) return node.flatMap((child) => slotsIn(child, dynamic));
  if (!isPlainObject(node)) return [];
  const own = node.props?.id === APP_ELEMENT_ID ? [{ dynamic }] : [];
  return [...own, ...slotsIn(node.children, dynamic || 'when' in node), ...slotsIn(node.otherwise, true), ...slotsIn(node.template, true)];
};

// The shell of a page: its behavior in page.js (defineShell) and its content in view.js ({ name, view }) go together.
const checkShellPair = (page, shellContent, where) => {
  if (page.shell === undefined && shellContent === undefined) return;
  if (page.shell !== undefined && (!isPlainObject(page.shell) || page.shell.kind !== 'shell')) fail(where, '"shell" must come from defineShell', "Write `shell: shell` in page.js, with `export const shell = defineShell({ name: 'main', ... })` imported from a shared module (defineShell comes from @ehtb/agent-ui/shell)");
  if (page.shell === undefined) fail(where, 'view.js exports a shell, but page.js has none', 'Add `shell` (the behavior, from defineShell) to page.js, or remove the export from view.js');
  if (shellContent === undefined) fail(where, `page.js names the shell "${page.shell.name}", but view.js exports no shell`, `Add \`export const shell = shellView\` to view.js, with the content of "${page.shell.name}" ({ name: '${page.shell.name}', view: ... })`);
  if (!isPlainObject(shellContent) || Object.keys(shellContent).sort().join() !== 'name,view') fail(where, 'the shell exported by view.js must be { name, view }', `Write \`export const shell = { name: '${page.shell.name}', view: main(..., pageSlot(), ...) }\``);
  if (shellContent.name !== page.shell.name) fail(where, `page.js uses the shell "${page.shell.name}", view.js the content of "${shellContent.name}"`, 'Both must name the same shell: import the behavior and the content of one shell');
  if (!isPlainObject(shellContent.view)) fail(where, `the view of shell "${page.shell.name}" must be a spec element, not ${typeof shellContent.view}`, 'Build it with the builders from @ehtb/agent-ui/spec');
  const slots = slotsIn(shellContent.view);
  if (slots.length !== 1) fail(where, `the view of shell "${page.shell.name}" has ${slots.length} places for the page (an element with the HTML id "${APP_ELEMENT_ID}")`, 'Write pageSlot() (from @ehtb/agent-ui/spec) exactly once, where the page belongs');
  if (slots[0].dynamic) fail(where, `the page's place in shell "${page.shell.name}" is inside a when or an each`, 'The page stays in one place while the shell lives: put pageSlot() outside every when and each');
};

export const checkPage = (page, { path, view, layout, pending, spec, shell: shellContent }) => {
  checkPagePath(path);
  const where = `page "${path}"`;
  if (!isPlainObject(page)) fail(where, 'a page must be a plain object', 'Export `const page = { head }` from page.js, and `export const view = ...` from the view.js next to it');
  for (const key of Object.keys(page)) {
    if (PAGE_KEYS.includes(key)) continue;
    if (key === 'view' || key === 'layout' || key === 'pending' || key === 'paths') fail(where, `"${key}" does not belong in page.js`, `Move it to the view.js next to page.js: \`export const ${key} = ...\`. page.js keeps the page's behavior: ${PAGE_KEYS.join(', ')}`);
    fail(where, `unknown key "${key}"`, `${didYouMean(key, PAGE_KEYS)}Allowed keys: ${PAGE_KEYS.join(', ')}`);
  }
  if (page.head === undefined) fail(where, 'missing "head"', 'Add `head: { title: \'Page title\' }` to page.js');
  // The spec is built on the server from `view` (with `layout`) or arrives already built from the browser as `spec`.
  if (spec !== undefined && view !== undefined) fail(where, 'both "view" and "spec" are given', 'Give "view" (and "layout") to build the spec, or "spec" alone when it is already built');
  if (spec !== undefined && (layout !== undefined || pending !== undefined)) fail(where, `"${layout !== undefined ? 'layout' : 'pending'}" is given with "spec"`, 'A finished "spec" already contains its layout and its pending view: give "view" (with "layout" and "pending"), or "spec" alone');
  const name = spec !== undefined ? 'spec' : 'view';
  const node = spec !== undefined ? spec : view;
  if (node === undefined) fail(where, 'missing "view"', 'Export `const view = section({ ... })` from the view.js next to page.js');
  if (typeof node === 'function') fail(where, `"${name}" must be a spec, not a function`, `Export the spec itself from view.js (a value), not a function that returns it`);
  if (!isPlainObject(node) && typeof node !== 'string') fail(where, `"${name}" must be a spec node (an element such as section(...))`, 'Build it with the builders from @ehtb/agent-ui/spec');
  checkShellPair(page, shellContent, where);
  checkHeadShape(page.head, where);
  checkHeadIsKeptCurrent(page, where);
  if (layout !== undefined && typeof layout !== 'function') fail(where, '"layout" must be a function (content) => spec', 'Import the shared layout module and `export const layout = pageLayout` from view.js; it receives the content and returns the page around it');
  if (page.namespaces !== undefined) {
    if (!isPlainObject(page.namespaces)) fail(where, `"namespaces" must be an object { name: { ${NAMESPACE_KEYS.join(', ')} } }`, 'Write `namespaces: { cart, product: { state: {}, actions: {} } }`');
    for (const [name, definition] of Object.entries(page.namespaces)) {
      if (name === RESERVED_NAMESPACE) fail(where, `namespace "${name}" is reserved`, `The framework owns "${RESERVED_NAMESPACE}" (route.params, the parameters of the URL, route.hydrated, and route.go, which takes the visitor to another page). Call it something else, for example "product"`);
      if (!IDENTIFIER.test(name)) fail(where, `namespace name ${JSON.stringify(name)} is not allowed`, 'Names are letters and digits, starting with a lowercase letter, no dashes (for example "cart" or "eventArchived")');
      if (!isPlainObject(definition)) fail(where, `namespace "${name}" must be an object { ${NAMESPACE_KEYS.join(', ')} }`, 'Write the namespace as in app()');
    }
  }
  if (page.plugins !== undefined && (!Array.isArray(page.plugins) || page.plugins.some((plugin) => typeof plugin !== 'function'))) {
    fail(where, '"plugins" must be a list of functions (environment) => plugin', 'Write `plugins: [withResources]` (withResources comes from @ehtb/agent-ui/resources) or `plugins: [({ win }) => windowEvents(win, { ... })]`');
  }
  if (pending !== undefined && !isPlainObject(pending)) fail(where, '"pending" must be a spec (an element), not a function', 'Export `const pending = p({ id: \'loading\' }, \'Loading...\')` from view.js');
  if (pending !== undefined && page.ready === undefined) fail(where, '"pending" is given but "ready" is not', 'Add `ready: (state) => boolean` to page.js: it says when to stop showing the pending view');
  if (page.ready !== undefined && typeof page.ready !== 'function') fail(where, '"ready" must be a function (state) => boolean', 'Write `ready: (state) => state.items.status === \'ready\'`');
  if (page.status !== undefined && typeof page.status !== 'function') fail(where, '"status" must be a function (state) => HTTP status number', 'Write `status: (state) => (found ? 200 : 404)`');
};
