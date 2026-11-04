# Contributing

Read `AGENTS.md` first: it is the guide for work on the framework itself (layout, code style, the hard rules, the loop for every change), whether you are a person or an agent. The app author's guide is `docs/AGENT-RULES.md`.

- **No dependencies.** The framework uses Node built-ins and browser APIs only (`AGENTS.md`, "Hard rules"). An example may depend on a library it exists to show.
- **Run the tests.** `npm test` runs the framework's tests and the examples; `npm run test:framework` the framework's alone. Node 22 or later.
- **The test suite is POSIX-oriented.** It creates symlinks and finds Chrome with `which`, so run it on macOS or Linux. The package itself is plain Node and browser code.
- **Keep the grammar closed.** A new tag, event, operator or plugin comes with the validator, `docs/API.md` and a test in the same change.
- **Messages guide.** An error says where, what is wrong and how to fix it, and a test asserts its text.
- **Docs stay true.** `test/docs.test.mjs` fails when a doc names a file, script, command or import that does not exist; update the docs in the same change.

A pull request says what it changes and why, and how it was tested.

Participation follows [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Contributions are accepted under the MIT license, the same as the project (`LICENSE`). Use the pull request template; it repeats the checks above.
