# Converting a React component

For an agent that has been given a React component (usually from shadcn/ui) and must produce the agent-ui version. Read `AGENT-RULES.md` (in this folder) first, then `API.md` section 12 (components, features, hooks table). The working reference is `examples/react-converted-components`: seven converted shadcn/ui components, their quoted originals, and the tests that compare the two.

The result of a conversion is **a component definition** (`{ params, spec }`) in `ui/<name>.js`, **state logic as a feature** when the original has state, and **tests** that prove it matches the original. A conversion is finished when `node --test` passes in the example folder, not when it looks right.

## 1. Quote the original

Copy the React source into the top comment of `ui/<name>.js`, unchanged, between the markers the parity tests read:

```js
// Badge, converted from React.
// Source: shadcn-ui/ui, apps/v4/registry/new-york-v4/ui/badge.tsx (MIT licence, (c) shadcn), copied unchanged on 2026-10-15.
// It is kept here only so the conversion can be compared with it (parity.test.mjs reads it). It is not run: this
// repository has no React dependency.
//
//   import * as React from "react"
//   ...every line of the original, indented by three spaces after the comment marker...
//   export { Badge, badgeVariants }
// (end of the quoted source)
//
// What each part became: ...
```

Rules: one `// Source: .../<file>.tsx` line per quoted file, the code lines start with `//   `, blank lines are `//`, and `// (end of the quoted source)` closes the block. Keep the licence line. If the original changes upstream, replace the quote; the parity tests then show what no longer matches.

## 2. Take inventory

Read the original and list every item below that it uses. Each one has a fixed answer in section 3.

1. **Elements and tags.** Which element carries each `data-slot` (or the root)?
2. **Variants.** `cva` groups (`variant`, `size`), their keys, their `defaultVariants`.
3. **`className` and `cn(...)`.** Extra classes from the caller.
4. **Props.** Every prop the component reads, and what `...props` forwards to the element.
5. **`children`.** What goes inside.
6. **Events.** `onClick`, `onChange`, and so on.
7. **State and effects.** `useState`, `useReducer`, `useMemo`, `useEffect`, `useRef`, `useContext`, custom hooks.
8. **Polymorphism.** `asChild`, `Slot`, a `tag` or `as` prop.
9. **Primitives.** Anything imported from `@radix-ui`, `radix-ui`, `@base-ui` or similar.
10. **Icons, portals, animation, refs.**

## 3. Decide each item

| In the original | In agent-ui | Notes |
|---|---|---|
| root element, `data-slot="x"` | `tag` and `props: { 'data-slot': 'x' }` | Keep the same tag as upstream. The parity test fails if you change it. |
| `cva({ variants: { variant: { default: "..." } }, defaultVariants })` | `params.variant: { options: { default: 'ui-x--default' }, default: 'default' }` | Same keys, same order, same default. The value is *your* class name; the Tailwind strings are not copied. |
| `data-variant={variant}`, `data-size={size}` | `'data-variant': { param: 'variant', key: true }` | `key: true` gives the key the use wrote, not the mapped class. |
| `cn(base, variants, className)` | `class: { join: ['ui-x ', { param: 'variant' }, ' ', { param: 'class' }] }` and `class: { default: '' }` | A join of literals is folded at build time and tidied. |
| `children` | `children: { slot: 'children' }` | Use `children:` on the `use` node. There is one slot. |
| a node passed as a prop (`icon`, `action`) | `params.action: { optional: true }` and `{ param: 'action' }` where it goes | The value is a whole node, for example `{ use: 'button', ... }`. |
| `onClick`, `onChange` | `params.onClick: { optional: true }`, `on: { click: { param: 'onClick' } }` | The value is `['actionName', { args }]`. |
| `...props` | nothing | Declare every prop the component should accept. An undeclared prop is an error, which is the point. List the ones you drop in the header comment. |
| `disabled`, `placeholder`, `type` | a param: `disabled: { default: false }`, `placeholder: { optional: true }` | Optional with `options` and no default means the attribute is absent unless given. |
| `id`, `htmlFor`, `aria-*` | `id: { optional: true }`, `for`, `'aria-label'` params | The validator requires `aria-label` on every input, so make it a required param. |
| `useState` | a feature: `state` key plus an action | See section 5. |
| `useMemo`, derived values | `derive` in the feature | |
| `useEffect` fetching | a `resources` entry in the feature | |
| `useRef`, `forwardRef` | none | Give the element an `id`. |
| `useContext`, providers | the global store | |
| `asChild`, `Slot` | not supported | Write a second component for the other tag. Record it in the header comment. |
| `@radix-ui` Label | `label` with `for` | Native. |
| `@radix-ui` Checkbox | `input` with `type: 'checkbox'` and `data-state` | Native. Record the divergence (section 6). |
| Dialog, Popover, Select, Tooltip, Dropdown, Tabs, Accordion | native `dialog`, `details`/`summary`, `select`, or a feature with explicit open state | The behaviour behind them (open state, the active option, the displayed month, the row being moved) becomes a namespace, and the component binds to it. What is still **not** reproduced: a portal (content renders in place and CSS positions it), true focus trapping (a focus index plus the `focus` prop stands in), and library positioning. Say so in the header and in DESIGN.md. Do not fake it. The popover, combobox, date picker and drag list in `examples/react-converted-components` are worked examples. |
| icons (`lucide-react`) | SVG tags (`svg`, `path`, `circle`, ...; recipe `svg-icons`), text, a `children` node, or an `img` | There is no icon library. |
| animation classes | `transition` plus CSS | |

When an item has no row, stop and say so rather than invent a mapping.

## 4. Write the definition

```js
import { defineElement, param, paramKey, slot } from '@ehtb/agent-ui/components';
import { span, join } from '@ehtb/agent-ui/spec';

export const Badge = defineElement('badge', {
  params: {
    id: { optional: true },
    variant: { options: { default: 'ui-badge--default', secondary: 'ui-badge--secondary' /* ...all upstream keys */ }, default: 'default' },
    class: { default: '' },
  },
  spec: span({ id: param('id'), 'data-slot': 'badge', 'data-variant': paramKey('variant'), class: join('ui-badge ', param('variant'), ' ', param('class')) }, slot()),
});
```

The export keeps the upstream name (`Badge`); the string is the name a raw `{ use: 'badge' }` node writes. A page calls `Badge({ variant: 'secondary' }, 'New')`, and a misspelt param fails at that call. The raw `{ params, spec }` object form still works for definitions written as JSON.

- For a component that only wraps one element and a class, use `container(name, baseClass, slot)` from `ui/define.js`, which returns a `defineElement` component.
- Add the component to `ui/index.js` as the made function, and name it with the upstream name with a lower-case first letter (`CardTitle` is `defineElement('cardTitle', ...)`).
- Write the CSS for the classes you invented in `style.css`. Plain CSS with variables is enough; keep the class names greppable.
- Variants are resolved when the page is built, so a variant is always a literal in a `use` node. To switch at runtime, write a `when` with one `use` per variant. A component that forwards its variant to another component declares its own options.

## 5. State: the field namespace convention

If the original keeps state or takes `value` and `onChange`, put that logic in `features.js` as a function that returns a namespace (`{ state, derive, actions }` with short names), mount it under the field's name (`namespaces: { email: textField({ validate }) }`), and have the component take a `field` name:

| Piece | Name for field `email` |
|---|---|
| value | state `email.value` |
| left once | state `email.touched`, action `email.touch` |
| write | action `email.set` |
| message | derived `email.error`, `email.invalid`, `email.message` |
| checkbox | also derived `email.state`: `'checked'` or `'unchecked'` |

The namespace name is the only prefix, so two fields never collide. The component builds the names with `state(join(param('field'), '.value'))`. Two namespaces cannot share a name; mounting the same namespace under two names gives two independent copies.

## 6. Prove it matches

1. **Parity against the quote.** `parity.test.mjs` reads the quoted source. It already checks, for every quoted file: each exported component exists, `variant` and `size` keys and defaults are the upstream ones in the same order, and each `data-slot` is on the same element. For a new component, add its file name to the list of files the test reads and its minimal params to `required` if it has required params. Then update the counts the test asserts (components and slots).
2. **Divergences are written down.** If the conversion must use a different element or leaves something out, add it to `DIVERGENCES` with the reason. The test then also checks that upstream still renders what you said it does.
3. **Behaviour.** Add a test in the style of a React Testing Library test: it renders the component through `expandComponents`, mounts it on the DOM shim, fires events, and asserts on attributes, text (from `ui.outline()`) and state. Cover each variant that changes markup, each optional prop present and absent, and each handler.
4. **Mistakes are refused.** One test per way a caller could go wrong: a mistyped variant, a missing required param, an undeclared prop. The messages come from `expandComponents`.
5. Run `node --test` in the example folder, then `npm test` at the repository root.

Mutation check worth doing once: delete one option from the conversion, run the tests, and see that a test fails. If nothing fails, the parity test is not reading what you think.

## 7. Errors you will meet

| Message | Cause |
|---|---|
| `component X needs param P` / `has no param P` | the `use` node and the declaration disagree; the message suggests the nearest name |
| `param P is "v", which is not one of its options` | a variant key that upstream does not have |
| `param P must be a literal option` | a binding was passed for a variant |
| `components.X.params.P: unknown key ...` | a typo in a declaration; allowed keys are `default`, `options`, `optional`, `type` |
| `... needs aria-label` | an `input`, `select` or `textarea` without an `aria-label` param |
| `state key "a.b": a dot is not allowed` | a feature built a state key with a dot; use camelCase |

## 8. Checklist

- [ ] Original quoted unchanged, with licence line and end marker.
- [ ] Every upstream export has a converted component, named by lower-casing the first letter.
- [ ] Variant and size keys, order and defaults equal upstream.
- [ ] Each `data-slot` on the same tag as upstream, or a documented divergence.
- [ ] No `...props` equivalent; dropped props are listed in the header comment.
- [ ] State lives in a feature; state keys have no dots.
- [ ] CSS written for every class the definition produces.
- [ ] Parity and behaviour tests added; a deliberate break makes them fail.
- [ ] What could not be converted is written in the header comment, not hidden.
