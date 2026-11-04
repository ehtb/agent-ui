# Support

- **Questions and ideas:** open a [discussion](https://github.com/ehtb/agent-ui/discussions) or an issue.
- **Bugs and feature requests:** use the issue templates.
- **Security:** do not open a public issue. Follow [SECURITY.md](SECURITY.md).

When reporting a bug, include:

- the version of `@ehtb/agent-ui` (`npm ls @ehtb/agent-ui` or the `version` in `node_modules/@ehtb/agent-ui/package.json`);
- the Node version and operating system;
- the browser, when the bug is in the browser;
- a minimal reproduction: the `page.js` and `view.js` involved, or a repository;
- what you expected and what happened;
- the output of `agent-ui check` and any error code (`AUI` + four digits).

The framework is a UI library with server rendering, not a web server. Questions about TLS, sessions, authentication, uploads, compression, caching or deployment belong to the host server or its documentation (`SECURITY.md`).
