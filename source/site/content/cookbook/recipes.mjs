// The cookbook: one canonical way to build each common thing, as a page of this folder that `agent-ui check` renders and
// test/examples/cookbook.test.mjs drives. `agent-ui explain <name>` prints a recipe. Copy the files, rename the namespaces.
//
//   name   the folder below pages/ (and the URL of the recipe's page)
//   title  what it builds
//   use    when to reach for it, and what to leave alone
//   files  what to copy, in reading order (relative to this folder)
export const recipes = [
  {
    name: 'list-edit',
    title: 'A list you can add to, edit in place, tick and remove from',
    use: 'Any list of records the visitor changes. The list, the draft being typed and the row being edited are three namespaces; the one that changes another goes through `calls`. Every item has its own `id` (the list\'s `key`); `agent-ui check` fails on a duplicate.',
    files: ['pages/list-edit/page.js', 'pages/list-edit/view.js'],
  },
  {
    name: 'form-validation',
    title: 'A form whose errors, and whether it can be submitted, follow from its fields',
    use: 'Validation is derived from the fields, never stored: `emailError`, `passwordError` and `valid` are `derive`, the errors only show after the first attempt (`attempted`), and `submit` finishes only when `valid`.',
    files: ['pages/form-validation/page.js', 'pages/form-validation/view.js'],
  },
  {
    name: 'async-list',
    title: 'A list loaded from the server, with loading, failure and retry',
    use: 'Data that lives on the server. A `resources` entry runs the request and writes only through its lifecycle actions; a retry flips a watched key. The page says when it is ready (`ready`) so the server waits for the data.',
    files: ['pages/async-list/page.js', 'pages/async-list/view.js', 'public/books.json', 'server-fetch.mjs', 'build.config.mjs'],
  },
  {
    name: 'modal',
    title: 'A dialog that opens, closes on Escape and keeps the focus until it closes',
    use: 'Anything that sits above the page until it is dismissed. `open` is state; the dialog exists only while it is open (`when`); the content behind it is `inert`; focus.js focuses the dialog, wraps Tab and Shift+Tab inside it, and gives the focus back to the control that opened it.',
    files: ['pages/modal/page.js', 'pages/modal/view.js', 'pages/modal/focus.js'],
  },
  {
    name: 'combobox',
    title: 'A text field with a list of options chosen by mouse or keyboard',
    use: 'Search-as-you-type and pickers. The filtered options, with the active one marked, are derived; the arrow keys, Enter and Escape are `keydown.*` handlers on the input.',
    files: ['pages/combobox/page.js', 'pages/combobox/view.js'],
  },
  {
    name: 'drag-reorder',
    title: 'A list reordered by dragging a row, or from the keyboard',
    use: 'Drag and drop. There is no drag-and-drop API (no dragstart, drop or dataTransfer): a grip button picks a row up on pointerdown, entering another row moves it there, releasing drops it, and every step is a logged action. `follow` (plugin `withFollow`) keeps the row under the pointer (the coordinates never enter the state) and `transition` slides the others aside (plugin `withMoves`); the page lists both plugins. Escape and a cancelled pointer put the row back (the start position is state). A touch pointer never reports the rows it crosses, so the keyboard (Enter, the arrow keys) is both the touch path and the accessible one: build it every time.',
    files: ['pages/drag-reorder/page.js', 'pages/drag-reorder/view.js', 'pages/drag-reorder/page.css'],
  },
  {
    name: 'soft-shell',
    title: 'A header that stays while the page changes (soft navigation)',
    use: 'Something that must survive a link click (a header, a cart count, a player). A shell is an app of its own around the page; a link marked `soft: true` swaps only the page.',
    files: ['pages/soft-shell/page.js', 'pages/soft-shell/view.js', 'pages/soft-shell/shell.js', 'pages/soft-shell/shell-view.js', 'pages/soft-shell/other/page.js', 'pages/soft-shell/other/view.js'],
  },
  {
    name: 'nested-rows',
    title: 'Rows inside rows that read the outer row',
    use: 'A list of groups, each with a list of items, where the inner template needs a field of the outer row (an id for a handler, a name for a label). Name the outer row with `as`, read it with `row(...)`; no copying of outer fields into the inner items.',
    files: ['pages/nested-rows/page.js', 'pages/nested-rows/view.js'],
  },
  {
    name: 'row-state',
    title: 'State that belongs to each row of a list (open, selected, a note)',
    use: 'Every row of a list has its own open/closed or draft text. Declare `rowState` with the defaults, write with `store.setRow(id, ...)`, read with `rowState(...)` in the row. Do not invent a keyed map by hand.',
    files: ['pages/row-state/page.js', 'pages/row-state/view.js'],
  },
  {
    name: 'format-values',
    title: 'Numbers, dates and money shown the way the reader writes them',
    use: 'The grammar has no formatting operators and will not get any. Format in `derive` with `Intl`, one derived row per item, and wrap the per-item work in `memoizeItem` so a change to one item formats one item.',
    files: ['pages/format-values/page.js', 'pages/format-values/view.js'],
  },
  {
    name: 'draw-into-element',
    title: 'A chart, an editor or a map drawn by a plugin into one element',
    use: 'Anything that owns its own DOM. The spec has an empty element with an explicit id; a plugin claims it with `mountElement`, draws into it, reports what happens with `api.dispatch`, and cleans up when the element leaves the page.',
    files: ['pages/draw-into-element/page.js', 'pages/draw-into-element/view.js', 'pages/draw-into-element/bars.js'],
  },
  {
    name: 'svg-icons',
    title: 'Icons and a small chart in SVG',
    use: 'An icon next to text is `aria-hidden`, sized with `1em` and coloured with `currentColor`; an icon used many times comes from a sprite in public/ with `use`; a drawing that says something is `role: \'img\'` with an `aria-label`. What is drawn from data (the stars, the points of a line) is a derived value. A large or interactive chart belongs to a library drawn by a plugin (recipe `draw-into-element`).',
    files: ['pages/svg-icons/page.js', 'pages/svg-icons/view.js', 'public/icons.svg'],
  },
  {
    name: 'server-hooks',
    title: 'A server with a session, a site policy and a form redirect',
    use: 'A page rendered per request. `initialStateFor` verifies a signed session cookie and supplies only the display name; `transformResponse` sets a site policy, a CSP nonce and a `style-src` decision; the API and form handler read the same request context; a form post answers `{ redirect }` with 303. The page owns only its data-dependent `status`; a page cannot set response headers. The cookie is a dependency-free demo: it is HMAC-signed with a per-process secret, and a real app keeps a server-side session.',
    files: ['pages/server-hooks/page.js', 'pages/server-hooks/view.js', 'server-hooks.mjs'],
  },
  {
    name: 'browser-only-plugin',
    title: 'A plugin with a timer, a window listener or a request, that does nothing while the server renders',
    use: 'Autosave, analytics, anything that needs a real window. The server runs the plugins too, against a stand-in window; the plugin starts with `if (isServerRendering) return;` (a field of the environment every plugin receives), stays quiet while `api.replaying`, and undoes everything it started in `api.onDestroy`.',
    files: ['pages/browser-only-plugin/page.js', 'pages/browser-only-plugin/view.js', 'pages/browser-only-plugin/autosave.js'],
  },
];
