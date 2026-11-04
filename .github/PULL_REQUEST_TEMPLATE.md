## What this changes

<!-- One or two sentences. Link the issue when there is one. -->

## How it was tested

<!-- The commands you ran and what they showed. `npm test` is the baseline; add `npm run typecheck` and `node test/run-examples.mjs --all` when relevant. -->

## Checklist

- [ ] `npm test` passes (and `npm run typecheck` when declarations changed).
- [ ] A grammar, API, option or error-code change updates the validator, `docs/API.md` and a test in the same change.
- [ ] Documentation stays true (`test/docs.test.mjs` checks paths, scripts, commands and import specifiers).
- [ ] No dependencies were added to the framework (`dependencies` and `devDependencies` stay empty).
- [ ] `CHANGELOG.md` has an entry when the change is visible to users.
- [ ] The change follows the code style in `AGENTS.md` (readable English names, one definition per helper).
