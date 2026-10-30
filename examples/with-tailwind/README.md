# With Tailwind CSS

agent-ui with Tailwind v4. The spec uses utility classes in `props.class` and `classes`; the Tailwind CLI reads `pages/view.js` (where the classes are), writes `pages/page.css` (`npm run css`), and agent-ui bundles that file like any stylesheet. `pages/page.js` holds the page's behavior. Nothing in the framework knows about Tailwind: the integration is one npm script and one import.

```
npm install      # installs the Tailwind CLI, so this one needs the npm registry
npm run build    # npm run css && agent-ui build
npm run serve    # http://localhost:8080/
npm test         # classes.test.mjs checks every class in the spec against the generated pages/page.css
```

`classes.test.mjs` is the accuracy part: a misspelled utility does nothing in the browser, so the test lists every class the spec uses and fails when the generated CSS has no rule for it (skipped until `npm run css` has run).

Not run against the real Tailwind CLI in the framework repository's own test run (the registry is not reachable there); the build and the class check were exercised with a hand-written stand-in for `pages/page.css`. Run `npm install && npm run css && npm test` in this folder to run them for real.

## One CSS file per page

This example has one page, so one `pages/page.css` is enough. For a site with several pages, Tailwind can generate one CSS file per page, and `agent-ui` bundles each as that page's `page.css`:

1. Import each page's `view.js` in a Node build script and collect the class names from its expanded spec (the traversal in `classes.test.mjs` is the starting point). Include `layout`, `pending` and the shell's content; a component is already expanded by then, so its variant classes are included.
2. Write a temporary content file with one class per line, and run Tailwind with automatic scanning off:

   ```css
   @import "tailwindcss" source(none);
   @source "./.tailwind/<page>.txt";
   ```

   Output to `pages/<url>/page.css`. The `source(none)` form is what makes the page's class set the whole input; the example's single `@source` works because Tailwind's automatic detection is still on.
3. Keep the base/theme and the utilities shared by the component kit in `pages/style.css`; put only page-specific utilities in each `page.css`. Running a full `@import "tailwindcss"` per page repeats Tailwind's base and theme layer, which can cancel the saving.
4. Run the script before `agent-ui build`, and add any class that is built from state or added by a plugin to the page's content file (a safelist).

Do not filter the generated CSS with a regular expression: Tailwind selectors contain variants, pseudo-classes, media queries and arbitrary values. Give Tailwind the right content set instead.

A generated per-page CSS file can also `@import` CSS shared with a subset of pages (for example a component kit), which `agent-ui` handles at build time. Do not put those imports inside the Tailwind input: Tailwind resolves them itself before `agent-ui` sees the file. Append them after generation, or import them from `pages/style.css` if every page needs them.
