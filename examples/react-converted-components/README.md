# React-converted components

Seven shadcn/ui components converted to agent-ui: `button`, `badge`, `card` with its seven parts, `alert` with title and description, `label`, `input` and `checkbox`, plus a `fieldError`. The page's content in `pages/view.js` is built only from them; `pages/page.js` holds its behavior. The real React source of each component (shadcn-ui/ui, MIT) is quoted at the top of its converted file in `ui/`, and `parity.test.mjs` compares the conversion with it. Nothing React is run here.

The third page, `/charts` (`pages/charts/`), draws a **Chart.js** chart into one element of the page with a plugin, the way a React component wraps a chart library in `useRef` and `useEffect`. See "A chart library" below.

The second page, `/primitives` (`pages/primitives/`), takes the interactive primitives React gets from a library — a popover, a combobox, a date picker and a drag list — and builds them from namespaces and components. See "The Radix gap" below.

```
npm install
npm start        # http://localhost:8080/
npm test
```

## How a React component converts

| In the React original | In agent-ui | Why |
|---|---|---|
| `cva({ variants, defaultVariants })` | `options` and `default` on a param | The use writes a key (`variant: 'outline'`). A key that is not an option fails with the options listed and the nearest one suggested. `data-variant={variant}` becomes `{ param: 'variant', key: true }`. |
| `cn(base, className)` | `class` param, joined onto the base class | A `join` of literals is folded into one `class` string when the page is built, and the spaces are tidied. |
| `children` | the slot (`{ slot: 'children' }`) | The use node's `children`. |
| `onClick`, `...props` spread | one declared optional param per handler (`onClick`) | There is no spread, so a prop the component does not declare is an error, not an attribute that silently goes nowhere. |
| `forwardRef` and `ref` | none | Give the element an `id`; `focus: true` covers focus. |
| a prop that may be missing | `optional: true` | The key that holds it disappears, like an undefined prop. |
| a boolean or string prop with a default | `default` | `disabled: { default: false }`. |
| `useState`, `useMemo`, `onBlur` in the form | a feature: `email: textField({ validate })` | See below. |
| Radix primitives (`Label`, `Checkbox`) | the native element | `label` with `for`, `input type="checkbox"`. |
| `asChild` (Radix `Slot`) | not supported | Write a component for the tag you want. |

A variant is resolved when the page is built, so it must be a literal. To switch at runtime, use a `when` with one `use` per variant.

## Where the hooks went

The kit has no local state, because a component has no instance. Reusable logic that React puts in custom hooks lives in `features.js` as functions that return a namespace (`{ state, derive, actions }` with short names). Mounting the namespace under a name gives it that name's keys, so one definition serves any number of fields:

```js
namespaces: {
  email: textField({ validate }),                           // email.value, email.touched, email.error, email.invalid, email.message, email.set, email.touch
  terms: checkField({ required: 'Accept the terms to continue.' }),
  welcome: dismissible(),                                   // welcome.dismissed, welcome.dismiss
  signup: { ... actions: { submit: { calls: ['email.touch', ...] } } },
}
```

`input` and `checkbox` take a `field` name and build the binding names from it (`{ state: 'email.value' }`), so the namespace name is the contract between the feature and the components. Two namespaces cannot share a name, and `signup.submit` reaches the fields only through `calls` (it touches each field so every message shows).

## The Radix gap: interactive primitives

The kit above is static: the components render, they do not hold state. The behaviour behind a Radix or dnd-kit primitive — open or closed, the highlighted option, the displayed month, the row being dragged — is exactly the local state those libraries keep in `useState` and `useRef`, so it converts the same way the form fields did: as a namespace. The page at `/primitives` mounts four of them.

| React primitive | What it needs | In agent-ui |
|---|---|---|
| Popover (Radix) | open state, a focus trap, outside-click dismissal | namespace `popover`: `open`, `focusIndex`, `value`; the trap is `keydown.Tab`/`Shift+Tab` moving `focusIndex` and a `focus` binding per choice; the backdrop's `onClick` closes it |
| Combobox (Popover + cmdk) | a query, a filtered list, the active option, outside-click dismissal | namespace `combobox`: `query`, `activeIndex`; `matches` and `activeValue` are derived; Arrow/Enter/Escape are actions; `aria-activedescendant` names the active row; a backdrop (painted under the input and the options) closes it on an outside click |
| Date picker (react-day-picker) | the displayed month, the focused day, the selection, outside-click dismissal | namespace `date`: `viewYear`, `viewMonth`, `focus`, `selected`; `weeks` is a derived 6×7 grid; the arrow keys move `focus` across month edges; a backdrop (painted under the trigger and the grid) closes it |
| Drag list (dnd-kit) | the item being dragged and where it lands | namespace `sortable`: `draggingId`, `startIndex`; `press`/`over`/`release`/`move`/`cancel`. `pointerdown` on a grip picks a row up, `pointerover` on another row moves the picked-up row there at once (the other rows slide aside), `pointerup` drops it. Enter and the arrow keys do the same from the keyboard; Escape puts the row back where it started |

Each is a function in `primitives.js` that returns a namespace from its options (`popover({ choices })`), mounted under a name in `pages/primitives/page.js`, and a component in `ui/` that binds to it by that name — the same contract `textField` and `input` share.

What is **not** reproduced, and is stated in each file's header rather than hidden:

- **A portal.** Radix renders the content at the end of the document so an `overflow: hidden` ancestor cannot clip it. Here the content renders where it is written and CSS positions it, so such an ancestor can clip it.
- **Library positioning.** `align`, `sideOffset` and collision handling are CSS only.
- **True DOM focus trapping.** Nothing may read the DOM to find the focused element, so the trap is a state index (`focusIndex`) plus a `focus` binding on each item. It keeps focus inside while Tab and Shift+Tab are handled; it is not a `FocusScope` that intercepts every way focus can move.
- **A separate drag overlay element.** There is no copy of the row: the picked-up row itself follows the pointer (the `follow` prop sets `--follow-x`/`--follow-y`, `[data-dragging]` in `pages/style.css` turns them into a transform, `docs/API.md` "Following the pointer"). Reordering animates too: the rows carry `transition: 200`, so the runtime slides every row that changes place (`docs/API.md`, "Moves"). The slide is skipped when the operating system asks for reduced motion (macOS: System Settings, Accessibility, Display, Reduce motion), so turn that off to see it.
- **A native HTML5 drag.** There is no `dragstart`/`dragover`/`drop`, no `dataTransfer` and no drag ghost image; the drag is built on the six bubbling pointer events (`pointerdown`/`pointermove`/`pointerup`/`pointercancel`/`pointerover`/`pointerout`) and CSS styles the picked-up row. A mouse (or pen) drag tracks the row under the pointer; a touch pointer is implicitly captured by the grip, so `pointerover` never fires on the other rows and the keyboard gesture is the touch path. A release anywhere on the page ends the drag (the page's root handles `pointerup` and `pointercancel`, so nothing is left picked up and following the pointer); only a release outside the browser window or the mount root is not seen, and Escape finishes it. The page-level handlers log a `sortable.release` per pointer release on the page, a no-op when nothing is picked up.

## A chart library: the ref

React gives a chart library its element with `useRef`, creates the chart in `useEffect` and destroys it in the cleanup. Here the element is a `div` with an explicit id and nothing inside (`pages/charts/view.js`), and a plugin does the rest (`pages/charts/chart-plugin.js`) with `mountElement` from `@ehtb/agent-ui/mount-element`:

| React | agent-ui |
|---|---|
| `const ref = useRef()` and `<canvas ref={ref}>` | `div({ id: 'revenue-chart', ... })`, empty; the plugin claims it by that id and puts a canvas in it |
| `useEffect(() => { const chart = new Chart(ref.current, ...); return () => chart.destroy(); }, [])` | `mountElement(api, 'revenue-chart', (element) => { ...new Chart(canvas, ...); return () => chart.destroy(); })`: called when the element is in the page, its return value when it leaves or the app is destroyed |
| `useEffect(() => chart.update(), [data])` | `api.watch(['sales.series', 'sales.selectedId'], ...)` calls `chart.update()` |
| `onClick` of the chart calls `setSelected` | Chart.js's `onClick` calls `api.dispatch('sales.select', { id })`, unless `api.replaying`: a logged action, so replay reproduces the selection and a click does not dispatch twice |

The plugin never writes state and the page never touches Chart.js. The data and the selection are state of the namespace `sales`, so `ui.state()` and the log show everything about the chart except its pixels. The plugin starts only in a browser (`win === window`), because Chart.js needs a real canvas: the server renders the page with an empty element, and the test shim does not draw.

This example depends on **Chart.js** from the npm registry (`dependencies` in `package.json`), imported by name like any package; the bundler accepts its ES module build. Only the chart-specific pieces are registered (`Chart.register(BarController, ...)`), so only they are bundled, and only into the chunk of `/charts`: the build report shows `charts` at about 393 KB (97 KB gzipped) while `index` is 11 KB, which is the code splitting by page paying for itself. Because of the dependency, `npm test` skips this example, as it skips `events`; run it with `node test/run-examples.mjs --all` or `npm run example -- react-converted-components test`. `browser.test.mjs` is the test that proves the plugin: in headless Chrome it reads the canvas back (the bar heights are in the proportion of the values), clicks a bar with a real mouse event and sees `sales.select` in the log and the bar turn blue, edits a value and sees the bar grow, replays the log, and destroys the app and finds no canvas. It skips itself without Chrome or without `npm install`.

## Converting another component

`docs/CONVERTING.md` is the procedure: quote the original, take inventory, decide each item, write the definition, prove parity.

## Tests

`parity.test.mjs` has two parts. The first reads the real shadcn/ui source quoted at the top of each file in `ui/` and checks the conversion against it: the same exported components, variants, sizes and defaults, and the same element for every `data-slot`. The second is behaviour tests in the style of React Testing Library. shadcn/ui ships no component tests (its test suites cover the CLI and the registry), so these are ours, not upstream's. `app.test.mjs` covers the page and the mistakes the kit refuses; `primitives.test.mjs` covers the four interactive primitives (the ARIA, the keystrokes, the state) and `conformance.test.mjs` checks all three pages against the validator and the JSON Schema; `charts.test.mjs` covers the chart page's data and actions in the shim, and `browser.test.mjs` the chart in Chrome.

## What to read

`ui/button.js` (the full conversion, with a comment per row of the table above), `ui/input.js` (names built from a param), `features.js`, then `pages/page.js` (the behavior) and `pages/view.js` (the content). For the interactive primitives, `primitives.js` (the four namespaces), `ui/popover.js`, `ui/combobox.js`, `ui/date-picker.js` and `ui/sortable.js`, then `pages/primitives/page.js` and `pages/primitives/view.js`. `app.test.mjs` shows what each component expands to and which mistakes the kit refuses; `primitives.test.mjs` drives the primitives with events.
