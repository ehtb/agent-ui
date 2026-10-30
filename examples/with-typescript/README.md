# With TypeScript and zod

TypeScript and zod next to agent-ui. agent-ui imports neither: the sources stay JavaScript (the bundler reads JavaScript), TypeScript checks them as they are (`tsc -p .`: `checkJs` and `strict` in `tsconfig.json`), and **one zod schema per kind of data** does three jobs:

| Who | How the schema is used |
|---|---|
| TypeScript (`pages/tasks.js`, `pages/page.js`, `api.js`) | `z.infer<typeof Task>` is the type of a task, in JSDoc: a renamed field is a compile error |
| the resources (`pages/page.js`) | `response: Tasks.parse`: the `response` of a resource is any function that throws when an answer does not fit, so zod's `parse` fits. A wrong answer becomes a failed load (`onError`, with zod's message) and never reaches the state |
| the server (`api.js`) | `MoveBody.safeParse(body)` refuses a request that does not fit (422) |

```
schemas.js   the zod schemas and the types taken from them
vendor/      zod-entry.js (what esbuild reads); zod.js is its generated output
tasks.js     pure helpers, typed from the schema
page.js      the namespace: the shape of a task, the resources with `response`, the actions typed with ActionDefinition<...>
view.js      three columns
api.js       the endpoints, with the same schemas
```

```
npm install      # links the framework (a local `file:` dependency), installs zod, TypeScript and esbuild from the registry
npm run check    # agent-ui check and tsc -p .
npm start        # bundles zod, builds, then serves with agent-ui serve
npm test
```

**How zod gets into the page.** The sources import the package: `import * as z from 'zod/mini'`. Node (the tests, `agent-ui check`, `agent-ui serve`) and `tsc` use it as it is. agent-ui's bundler reads ES modules without re-exports, and zod is written with them, so for the browser `npm run vendor` has esbuild bundle `zod/mini` into `vendor/zod.js` (32 kB, generated and not committed, made again by `npm run build` and `npm test`), and `build.config.mjs` gives the browser bundle that file in place of the package (`replaceModules`). `vendor/zod-entry.js` lists the few names the schemas use, so the rest of zod stays out. The page's chunk grows by about 28 kB (7 kB gzipped), and the check runs in the browser and in a production build too. If you use another zod function, add its name to the entry. The pattern for any such package is in `docs/BUILD.md`, "Vendor files".

`app.test.mjs` runs the page against the api and against an answer that does not fit its schema; `npm run check` runs `agent-ui check` and then `tsc -p .`.
