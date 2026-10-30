// @ts-check
// Compiled (not run) by test/types.test.mjs: proves the declarations accept real usage and reject mistakes.
import { app } from '../../src/ui.js';
import { resources } from '../../src/resources.js';
import { expandComponents } from '../../src/components.js';
import { renderPage } from '../../server/render-page.js';
import { mountElement } from '../../src/mount-element.js';

/** @type {import('../../src/ui.js').Namespaces} */
const namespaces = {
  counter: {
    state: { count: 0, label: 'x' },
    derive: { double: (get) => get('count') * 2 },
    actions: { add: { args: { by: 'number' }, calls: ['log.note'], run: (store, { by }, call) => { store.set('count', store.get('count') + by); call('log.note', { text: 'added' }); } } },
  },
  log: { state: { notes: [] }, actions: { note: { args: { text: 'string' }, run: (store, { text }) => store.set('notes', [...store.get('notes'), text]) } } },
};
const ui = app({ dev: true,
  namespaces,
  initialState: { counter: { count: 1 } },
  spec: { tag: 'button', on: { click: ['counter.add', { by: 1 }] }, transition: 100, children: [{ state: 'counter.count' }, { when: { greaterThan: [{ state: 'counter.count' }, 3] }, children: 'many' }] },
  root: /** @type {any} */ (null),
});
ui.dispatch('counter.add', { by: 2 });
const names = ui.outline().map((node) => node.tag);
const snapshot = ui.state().counter.count;
// Several handlers on one event.
app({ dev: true, namespaces, spec: { tag: 'button', on: { click: [['counter.add', { by: 1 }], ['log.note', { text: 'x' }]] }, children: 'go' }, root: /** @type {any} */ (null) });
// Resources live in the namespace that declares them; the plugin takes only the fetch function.
resources(fetch);
resources((url, init) => fetch(url, { signal: init?.signal }), { win: null });
app({ dev: true, namespaces: { items: { state: { list: [] }, resources: [{ watch: ['filters.category'], owns: ['list'], request: () => null, onStart: 'a', onSuccess: 'b', onError: 'c', onCancel: 'd', onIdle: 'e' }] } }, spec: 'x', root: /** @type {any} */ (null), plugins: [resources(fetch)] });
// A plugin claiming state keys through api.watch.
app({ dev: true,
  namespaces,
  spec: 'x',
  root: /** @type {any} */ (null),
  plugins: [
    (api) => {
      api.watch(['counter.count'], (values) => values['counter.count']);
      api.watch(['counter.label'], () => {}, { owns: { where: 'plugin', keys: ['counter.label'], allowedActions: ['counter.add'], message: (key) => `${key} is owned` } });
      api.claim('resources');
      api.get('counter.double');
      api.keys().length;
      api.namespaces().counter.state;
    },
  ],
});
expandComponents({ use: 'x', with: {} }, { x: { params: [], spec: { tag: 'p' } } });
// Per-row state, a named row read from a nested each, and a plugin that claims an element.
app({ dev: true,
  namespaces: {
    ...namespaces,
    details: { rowState: { open: false }, actions: { toggle: { args: { id: 'number' }, run: (store, { id }) => { store.setRow(id, { open: !store.getRow(id).open }); store.clearRow(id); } } } },
  },
  spec: { each: 'counter.double', key: 'id', as: 'outer', template: { tag: 'li', children: [{ rowState: 'details.open' }, { row: 'outer.id' }] } },
  root: /** @type {any} */ (null),
  plugins: [(api) => mountElement(api, 'chart', (element, info) => { element.setAttribute('data-key', String(info.key)); return () => {}; })],
});
renderPage(() => ui, { dev: false, url: '/' }).then((page) => page.html.length);

// Each line below must be a type error (checked by the test with @ts-expect-error).
// @ts-expect-error a row binding is a string path
app({ dev: true, namespaces, spec: { tag: 'p', children: { row: 3 } }, root: null });
// @ts-expect-error unknown binding shape
app({ dev: true, namespaces, spec: { tag: 'p', children: { stat: 'counter.count' } }, root: null });
// @ts-expect-error the old flat state option does not exist any more
app({ dev: true, state: { count: 0 }, spec: 'x', root: null });
// @ts-expect-error argument type name
app({ dev: true, namespaces: { a: { actions: { b: { args: { n: 'integer' }, run: () => {} } } } }, spec: 'x', root: null });
// @ts-expect-error an action in a namespace needs its args
app({ dev: true, namespaces: { a: { actions: { b: { run: () => {} } } } }, spec: 'x', root: null });
// @ts-expect-error the owns option needs where, keys, allowedActions and message
ui.watch(['counter.count'], () => {}, { owns: { keys: ['counter.count'] } });
export { names };

// Builders and defineElement.
import { div as divBuilder, button as buttonBuilder, state as stateBinding, act as actHandler, each as eachNode } from '../../src/spec.js';
import { defineElement, param, slot } from '../../src/components.js';
import { join as joinOperand, item as itemBinding, event as eventBinding } from '../../src/spec.js';
const badge = defineElement('badge', {
  params: { tone: { options: { plain: 'b-plain', loud: 'b-loud' }, default: 'plain' }, label: {} },
  spec: divBuilder({ class: param('tone') }, slot()),
});
const page = divBuilder({ class: 'x' }, buttonBuilder({ on: { click: actHandler('counter.add', { by: 1 }) } }, 'Add'), stateBinding('counter.count'), badge({ label: 'a', tone: 'loud' }, 'text'), eachNode('log.notes', 'id', divBuilder(null)));
expandComponents(page, [badge]);
// Paths and action names built in a component definition (the pattern of the shipped kit).
defineElement('field', {
  params: { field: {} },
  spec: divBuilder({ value: stateBinding(joinOperand(param('field'), 'Value')), on: { click: actHandler(joinOperand(param('field'), '.set'), { v: eventBinding('target.value') }) } }, itemBinding(joinOperand('a', 'b'))),
});
// @ts-expect-error a variant only accepts its option keys
badge({ label: 'a', tone: 'huge' });
// @ts-expect-error a required param must be given
badge({ tone: 'plain' });
// @ts-expect-error the first argument of a builder is the attributes object or null
divBuilder('text');
// @ts-expect-error a handler is made with act(...)
buttonBuilder({ on: { click: 'counter.add' } });

// Pages.
import { contentOf, definePage } from '../../src/pages.js';
import { fail, didYouMean } from '../../src/messages.js';
const home = definePage({ head: { title: 'Home' } }, { path: '/', view: { tag: 'p', children: 'hi' }, layout: (content) => ({ tag: 'main', children: content }) });
home.describePage({ route: { params: {} } }).title.toUpperCase();
home.namespaces.route.state;
didYouMean('itme', ['item']).toUpperCase();
// @ts-expect-error fail takes where, problem and fix
fail('where', 'problem');

import { memoizeItem } from '../../src/memoize.js';
expandComponents({ use: 'x' }, { x: { params: { a: {}, b: { options: { p: 'q' }, default: 'p' }, c: { optional: true } }, spec: { tag: 'p' } } });
memoizeItem((/** @type {{ id: number }} */ item) => item.id);
// @ts-expect-error unknown key in a param declaration
expandComponents({}, { x: { params: { a: { dflt: 1 } }, spec: {} } });
// @ts-expect-error a page's view is a spec, not a number
definePage({ head: { title: 't' } }, { path: '/', view: 5 });

// Shells and soft navigation.
import { defineShell } from '../../src/shell.js';
import { navigation, withNavigation, readDocument } from '../../src/navigation.js';
import { findEntry, currentPage, startPage } from '../../src/pages.js';
const mainShell = defineShell({ name: 'main', namespaces: { frame: { state: { count: 0 } } }, plugins: [withNavigation], reads: [{ watch: ['cart.count'], action: 'frame.set', args: { count: 'cart.count' } }] });
mainShell.name.toUpperCase();
mainShell.connect(null, null, null)();
// @ts-expect-error a shell needs a name
defineShell({ namespaces: {} });
// @ts-expect-error a read needs its args
defineShell({ name: 'main', reads: [{ watch: ['cart.count'], action: 'frame.set' }] });
definePage({ head: { title: 'Home' }, shell: mainShell }, { path: '/', view: { tag: 'p', children: 'hi' }, shell: { name: 'main', view: { tag: 'main', children: [{ tag: 'div', props: { id: 'app' } }] } } }).createShell?.({ root: null, win: null, fetchFunction: null, dev: false });
// @ts-expect-error the page's shell comes from defineShell
definePage({ head: { title: 'Home' }, shell: { name: 'main' } }, { path: '/', view: { tag: 'p', children: 'hi' } });
readDocument('<html></html>').stylesheets.length;
navigation({ win: null, fetchFunction: async () => null, shellName: 'main', importModule: async () => ({}), loadStylesheet: async () => {} });
// @ts-expect-error the plugin needs the name of its shell
navigation({ win: null, fetchFunction: async () => null });
startPage({ head: { title: 'Home' } }, { dev: true, path: '/', url: 'http://localhost/assets/index.js', spec: { tag: 'p' } }).path.toUpperCase();
findEntry('http://localhost/assets/index.js')?.path;
currentPage()?.slot;
const app2 = app({ dev: true, namespaces: {}, spec: { tag: 'p' }, root: /** @type {any} */ (null) });
app2.destroy();
app2.onDestroy(() => {});
app2.destroyed.valueOf();
app2.isReady?.()?.valueOf();
app2.getStatus?.()?.toFixed();
// @ts-expect-error an action name is a string or a join, not a number
actHandler(5);

// Shapes in a namespace, sync between two apps, and a list of handlers in a builder.
import { syncApps } from '../../src/sync-apps.js';
const shaped = app({ dev: true,
  namespaces: { todos: { state: { items: [] }, shapes: { items: { fields: { id: 'number', title: 'string', meta: 'json' }, validate: (item) => (item.title ? null : 'Title is required') } } } },
  spec: 'x',
  root: /** @type {any} */ (null),
});
// @ts-expect-error a shape field type must be string, number, boolean or json
app({ dev: true, namespaces: { todos: { state: { items: [] }, shapes: { items: { fields: { id: 'integer' } } } } }, spec: 'x', root: null });
// @ts-expect-error validate returns a message or null, not a boolean
app({ dev: true, namespaces: { todos: { state: { items: [] }, shapes: { items: { validate: () => true } } } }, spec: 'x', root: null });
const stopSync = syncApps({ from: shaped, to: shaped, watch: ['todos.items'], action: 'todos.set', args: { items: 'todos.items' } });
stopSync();
// @ts-expect-error syncApps needs args
syncApps({ from: shaped, to: shaped, watch: ['todos.items'], action: 'todos.set' });
buttonBuilder({ on: { click: [actHandler('todos.add', {}), actHandler('search.clear')] } }, 'Go');
// A page can declare shapes like any namespace.
definePage({ head: { title: 't' }, namespaces: { x: { state: { rows: [] }, shapes: { rows: { fields: { id: 'number' } } } } } }, { path: '/', view: { tag: 'p' } });

import { APP_ELEMENT_ID, STATE_ELEMENT_ID } from '../../src/hydrate.js';
APP_ELEMENT_ID.toUpperCase();
STATE_ELEMENT_ID.toUpperCase();

// The parts of a view.js module, checked, ready for definePage.
const content = contentOf({ view: { tag: 'p' } }, 'pages/view.js');
definePage({ head: { title: 't' } }, { path: '/', ...content });
// @ts-expect-error the file is a string
contentOf({}, 5);

// The head of a page: attributes of <html> and <body>, and elements of <head> and the end of <body>.
definePage(
  { head: { title: 't', html: { lang: 'en', class: (state) => String(state.route.params.id) }, body: { hidden: false }, tags: [{ tag: 'meta', props: { name: 'robots', content: 'noindex' } }], bodyTags: [{ tag: 'script', props: { src: '/a.js', defer: true } }] } },
  { path: '/', view: { tag: 'p' } },
).describePage({ route: { params: {} } }).tags.map((element) => element.tag.length);
// @ts-expect-error base is not allowed at the end of the body
definePage({ head: { title: 't', bodyTags: [{ tag: 'base', props: { href: '/' } }] } }, { path: '/', view: { tag: 'p' } });
// @ts-expect-error only a data script builds its children from the state
definePage({ head: { title: 't', tags: [{ tag: 'style', children: () => 'a{}' }] } }, { path: '/', view: { tag: 'p' } });
// @ts-expect-error title is not an element of the head
definePage({ head: { title: 't', tags: [{ tag: 'title' }] } }, { path: '/', view: { tag: 'p' } });

// Errors: onError hands over the code and details; decodeError reads either form (src/error-messages.d.ts).
import { decodeError } from '../../src/error-messages.js';
const errorApp = app({ dev: true, namespaces: {}, spec: { tag: 'div' }, root: /** @type {any} */ (null) });
const stopReporting = errorApp.onError(({ code, details, message, action }) => `${code} ${JSON.stringify(details)} ${message} ${action}`);
stopReporting();
errorApp.report(new Error('caught by a plugin'));
const decodedError = decodeError('AUI0202 {"action":"todos.add"}');
const decodedText = decodedError?.text ?? null;

// debug is a boolean option of an app, a page and a shell.
app({ dev: true, namespaces: {}, spec: { tag: 'div' }, root: /** @type {any} */ (null), debug: true });
definePage({ head: { title: 'x' }, debug: true }, { path: '/', view: { tag: 'div' } });

// Declarations that the review found missing or wrong: problem(), destroyApps, the document functions, string[] params, optional first argument.
import { problem } from '../../src/messages.js';
import { destroyApps } from '../../server/render-page.js';
import { injectHead, renderDocument } from '../../server/document.mjs';
import { createStaticHandler } from '../../cli/static-handler.mjs';
const problemText = problem('where', 'what', 'fix').length;
destroyApps(errorApp, null);
injectHead('<html></html>', { title: 't', html: { lang: 'en' } }).length;
renderDocument('<html></html>', { html: '', stateScript: '', state: {} }).length;
createStaticHandler('dist', { rewrites: () => [{ pattern: '/product/:id', page: 'product-id.html' }] });
const listed = defineElement('listed', { params: ['title'], spec: { tag: 'div' } });
listed({ title: 'x' });
const noParams = defineElement('noParams', { spec: { tag: 'div' } });
noParams();
noParams(null, divBuilder(null, 'child'));
const allOptional = defineElement('allOptional', { params: { size: { default: 'm' } }, spec: { tag: 'div' } });
allOptional();

// Response headers, the request context and the render handler's hooks.
import { checkResponseHeaders, mergeResponseHeaders } from '../../src/http-headers.js';
import { createSsrHandler } from '../../server/ssr-handler.mjs';
import { createRequestContext, isLocalPath, parseCookies, requestContextForUrl } from '../../server/request.mjs';
const checkedHeaders = checkResponseHeaders({ 'cache-control': 'no-store', 'set-cookie': ['a=1'] }, 'test', { reserved: ['location'] });
checkedHeaders?.['cache-control']?.toString();
mergeResponseHeaders({ 'set-cookie': 'a=1' }, { 'set-cookie': ['b=2'] })['set-cookie']?.toString();
parseCookies('a=1; b=2').a?.toUpperCase();
isLocalPath('/contact').valueOf();
const context = createRequestContext({ method: 'GET', headers: { cookie: 'a=1' } }, { pathname: '/', search: '?q=1' });
requestContextForUrl(context, '/?sent=1').query.get('sent')?.toUpperCase();
context.query.get('q')?.toUpperCase();
context.cookies.a?.toUpperCase();
context.headers.host?.toString();
renderPage(() => ui, { dev: false, url: '/', request: context }).then((page) => page.stateScript.length);
createSsrHandler({
  config: /** @type {any} */ ({}),
  initialStateFor: (request) => ({ session: { user: request.cookies.session ?? null } }),
  transformResponse: (request, response) => ({ headers: { 'content-security-policy': `nonce-${request.method}` }, body: response.body }),
}).then((handler) => handler.length);
// @ts-expect-error a header value is a string, a number or a list of strings
checkResponseHeaders({ x: {} }, 'test');
// @ts-expect-error the request context needs a method and a pathname
createRequestContext({ headers: {} }, {});
// @ts-expect-error an unknown handler option is refused
createSsrHandler({ config: /** @type {any} */ ({}), nope: true });
