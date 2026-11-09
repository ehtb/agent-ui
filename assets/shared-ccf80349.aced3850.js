import { module_resources } from "./agent-ui-3b1742b4.9ba2f011.js";
const module_pages_style = (() => {
return {};
})();
const module_global = (() => {
return {};
})();
const module_cookbook_meta = (() => {
const recipeMeta = [{"name":"list-edit","title":"A list you can add to, edit in place, tick and remove from"},{"name":"form-validation","title":"A form whose errors, and whether it can be submitted, follow from its fields"},{"name":"async-list","title":"A list loaded from the server, with loading, failure and retry"},{"name":"modal","title":"A dialog that opens, closes on Escape and keeps the focus until it closes"},{"name":"combobox","title":"A text field with a list of options chosen by mouse or keyboard"},{"name":"drag-reorder","title":"A list reordered by dragging a row, or from the keyboard"},{"name":"soft-shell","title":"A header that stays while the page changes (soft navigation)"},{"name":"nested-rows","title":"Rows inside rows that read the outer row"},{"name":"row-state","title":"State that belongs to each row of a list (open, selected, a note)"},{"name":"format-values","title":"Numbers, dates and money shown the way the reader writes them"},{"name":"draw-into-element","title":"A chart, an editor or a map drawn by a plugin into one element"},{"name":"svg-icons","title":"Icons and a small chart in SVG"},{"name":"server-hooks","title":"A server with a session, a site policy and a form redirect"},{"name":"browser-only-plugin","title":"A plugin with a timer, a window listener or a request, that does nothing while the server renders"}];
const recipeTitles = {"list-edit":"A list you can add to, edit in place, tick and remove from","form-validation":"A form whose errors, and whether it can be submitted, follow from its fields","async-list":"A list loaded from the server, with loading, failure and retry","modal":"A dialog that opens, closes on Escape and keeps the focus until it closes","combobox":"A text field with a list of options chosen by mouse or keyboard","drag-reorder":"A list reordered by dragging a row, or from the keyboard","soft-shell":"A header that stays while the page changes (soft navigation)","nested-rows":"Rows inside rows that read the outer row","row-state":"State that belongs to each row of a list (open, selected, a note)","format-values":"Numbers, dates and money shown the way the reader writes them","draw-into-element":"A chart, an editor or a map drawn by a plugin into one element","svg-icons":"Icons and a small chart in SVG","server-hooks":"A server with a session, a site policy and a form redirect","browser-only-plugin":"A plugin with a timer, a window listener or a request, that does nothing while the server renders"};
return { recipeMeta, recipeTitles };
})();
const module_search = (() => {
const normalize = (value) => String(value ?? '').toLowerCase();
const snippetAround = (text, terms) => {
const source = String(text ?? '');
const lower = source.toLowerCase();
const found = terms.map((term) => lower.indexOf(term)).filter((position) => position >= 0);
if (!found.length) return source.length > 180 ? `${source.slice(0, 177)}…` : source;
const first = Math.min(...found);
const start = Math.max(0, first - 60);
const end = Math.min(source.length, first + 140);
return `${start > 0 ? '…' : ''}${source.slice(start, end).trim()}${end < source.length ? '…' : ''}`;
};
const search = {
state: { query: '', index: [], status: 'idle', error: '' },
derive: {
results: (get) => {
const query = normalize(get('query')).trim();
if (!query) return [];
const terms = query.split(/\s+/).filter(Boolean);
const score = (entry) => {
const title = normalize(entry.title);
const pageTitle = normalize(entry.pageTitle);
const text = normalize(entry.text);
let total = 0;
for (const term of terms) {
if (title.includes(term)) total += 12;
if (pageTitle.includes(term)) total += 5;
if (text.includes(term)) total += 2;
if (!title.includes(term) && !pageTitle.includes(term) && !text.includes(term)) return -1;
}
return total;
};
return get('index')
.map((entry) => ({ entry, score: score(entry) }))
.filter((candidate) => candidate.score >= 0)
.sort((left, right) => right.score - left.score || left.entry.title.localeCompare(right.entry.title))
.slice(0, 8)
.map(({ entry }) => ({
href: entry.href,
title: entry.title,
pageTitle: entry.pageTitle,
snippet: snippetAround(entry.text, terms),
}));
},
resultLabel: (get) => {
const count = get('results').length;
return `${count} ${count === 1 ? 'result' : 'results'}`;
},
},
actions: {
setQuery: {
args: { value: 'string' },
run: (store, { value }) => store.set('query', value),
},
loading: {
args: {},
run: (store) => {
if (store.get('status') !== 'ready') store.set('status', 'loading');
store.set('error', '');
},
},
loaded: {
args: { data: 'json' },
run: (store, { data }) => {
store.set('index', Array.isArray(data) ? data : []);
store.set('status', 'ready');
},
},
failed: {
args: { message: 'string' },
run: (store, { message }) => {
store.set('status', 'failed');
store.set('error', message);
},
},
},
resources: [
{
watch: [],
owns: ['index', 'status', 'error'],
request: () => ({ url: '/search.json' }),
onStart: 'loading',
onSuccess: 'loaded',
onError: 'failed',
},
],
};
return { search };
})();
const module_docs_page = (() => {
const { withResources } = module_resources;
const { search } = module_search;
const headTags = [
{ tag: 'link', props: { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' } },
{ tag: 'meta', props: { name: 'theme-color', content: '#0b1020' } },
{ tag: 'meta', props: { name: 'color-scheme', content: 'light' } },
];
const docsPage = ({ title, description, titleForState = null }) => ({
head: {
title: titleForState ?? `${title} · agent-ui`,
description,
html: { lang: 'en' },
body: { class: 'page-docs' },
tags: headTags,
},
namespaces: { search },
plugins: [withResources],
});
return { docsPage };
})();
const module_recipe_page = (() => {
const { recipeTitles } = module_cookbook_meta;
const { docsPage } = module_docs_page;
const recipePage = (name) => {
const title = recipeTitles[name];
if (!title) throw new Error(`recipe-page: unknown recipe "${name}"`);
return docsPage({
title,
description: `Cookbook recipe: ${title}`,
});
};
return { recipePage };
})();
export { module_recipe_page, module_global, module_docs_page };
