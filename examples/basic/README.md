# Basic

The smallest page: a todo-style list with a filter. Shows the shape of a page (`pages/page.js` is its behavior, `pages/view.js` its content, and the folder is the URL `/`): `namespaces` (here `todos` and `filter`: each owns its state, derived values and actions), a `head`, and the view spec. Only the server and the build import `view.js`, so a browser downloads the behavior and the finished spec, not the builders.

```
npm install      # links the framework (a local `file:` dependency, works offline)
npm run build    # agent-ui build  -> dist/
npm run serve    # http://localhost:8080/
npm test
```
