# TodoMVC

A page built to the official [TodoMVC app spec](https://github.com/tastejs/todomvc/blob/master/app-spec.md): no todos, new todo, mark all, item, editing, counter and clear completed. Two sections of the spec do not apply: **persistence** (the spec stores todos in the browser's localStorage; here durable data belongs on the server, so the todos live in memory) and **routing** (the spec filters through `#/active`; here a page is a URL, so the filter is state of the page, chosen with buttons). The CSS is the official `todomvc-app-css` (MIT), trimmed. `app.test.mjs` has one test per spec section; `benchmark.mjs` (`npm run benchmark`) measures update cost on the shim DOM.

```
npm install && npm run build && npm run serve    # http://localhost:8080/
npm test
npm run benchmark
```

Measured (shim DOM, comparisons between runtime versions, not browser numbers): toggling one todo costs 3.1 DOM mutations at every list size. Toggle latency is about 0.5 ms at 1,000 rows, 1.1 to 1.5 ms at 5,000 and 5 to 8 ms at 20,000, growing linearly because derived lists are recomputed in full. Adding 5,000 items takes about 80 to 105 ms; 20,000 takes about 0.9 s. 

Grammar and runtime features added **because the spec required them**, not speculatively:

| Added | Required by | Note |
|---|---|---|
| `when` | "No todos: main and footer hidden", "Clear completed hidden", an edit input that exists only while editing | Remounts only when truthiness flips. |
| `classes` | `completed`, `editing`, `selected` classes | Merged with the static `class`; one attribute write. |
| `equals` / `not` | "this row is being edited" is `editingId == item.id`, a comparison of global state and row data | Kept to two operators; everything else stays in `derive`. |
| `dblclick`, `focusout` events | "double-click label to edit", "save on blur" | `focusout` because `blur` does not bubble (events are delegated). |
| `focus` prop | "edit input should be focused", autofocus on dynamic nodes | Runs on a microtask after insertion. |
| Dev-mode deep freeze | in-place mutation is silent otherwise (`push` on an array skips the update) | Skips already-frozen objects, so the cost is O(changed). |
| `aria-*` boolean handling | `aria-pressed=false` must stay `"false"`, not be removed | Found while documenting; covered by a test. |
| Lazy `devtools` chunk | exercising dynamic import, lazy CSS and the `shared-*` rules in a real app | Optional: an app made with `debug: true` fetches it. |

Patterns that worked:

- **Idempotent actions solve a real browser race.** After Enter or Escape unmounts the edit input, the browser can still fire `focusout`. `editing.commit` returns early when `editing.id` is null, so the duplicate event is harmless. Frameworks handle this class of bug with component lifecycle; here it is one guard clause, and the guideline says so.
- **Derive instead of per-row computation.** `filter.filters`, `todos.itemWord`, `todos.allCompleted`, `todos.hasCompleted` and `todos.hasTodos` are derived; the spec stays free of logic. Filtering at model level (as the TodoMVC spec requires) is just `todos.visible`, which reads `filter.name` from the other namespace.
- **Row identity from references.** `todos.visible` returns the same item objects, so `each` reuses rows and only the changed row's bindings re-run.
- **English names cost nothing at runtime.** The readable refactor (`tag/props/children`, `store.get/set`, descriptive variables) changed no behavior and the full suite stayed green.

- **Namespaces keep each part of the spec in one place.** The editing state, the draft and the filter are not part of the list, so they are their own namespaces. `editing.commit` renames or removes a todo through `calls` instead of writing the list, and the Enter handler of the new-todo input is a list of two handlers (`todos.add`, then `draft.clear`).
