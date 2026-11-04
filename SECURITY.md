# Security

## Reporting a vulnerability

Please report a vulnerability privately, through the repository's private vulnerability reporting (the Security tab, "Report a vulnerability"), not in a public issue. Say what is affected (the module or command, the version), how to reproduce it, and what an attacker gains. You get an answer within a week; a fix is released as soon as it is ready, with a note in `CHANGELOG.md`.

## What the framework is responsible for

- **Markup it writes.** Text and attribute values are escaped (`src/html-escape.js`); the state the server embeds is escaped for a script element (`stateScriptHtml`). There is no `innerHTML` in the grammar.
- **URLs in a spec.** `javascript:` and other unsafe URLs are refused by the validator and removed by the runtime (`AUI0301`), in the page and in the head.
- **The render server's own requests** (`createSsrHandler`): the Host header of a server bound to this machine is checked against DNS rebinding (421), request bodies are limited (`maxBodyBytes`, 413), only JSON and URL-encoded bodies are read (415 for anything else, including a compressed body), response headers are checked in one place (`src/http-headers.js`), a form redirect must be a local path, and an error is never shown to the visitor (500 with no detail; the host's `onError` gets it).
- **State sent to the browser.** `stateForBrowser` chooses what the state script carries. What the page renders is in the markup whatever the hook does, so a secret never belongs in state a page shows.

## What the host is responsible for

The framework is a UI library with server rendering, not a web server. The host's own server owns: TLS, sessions, authentication and authorization, CSRF protection, a Content-Security-Policy and other site headers (set them with `transformResponse`), rate limiting, compression, caching policy, file uploads, and serving the built files. `agent-ui serve` and `agent-ui dev` are for development and the examples; a deployment mounts `createSsrHandler` in the host's server.
