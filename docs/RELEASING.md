# Releasing

The package is published to npm as `@ehtb/agent-ui` from a tag on `main`. The workflow `.github/workflows/release.yml` publishes with provenance; nothing is published from a working copy.

## One-time setup

- The npm account or organization owns the `@ehtb` scope. `publishConfig.access` is `public`, so the package is public.
- The repository is public and **private vulnerability reporting** is enabled (the Security tab), because `SECURITY.md` points there.
- The `NPM_TOKEN` repository secret holds an npm token that can publish `@ehtb/agent-ui` (or the workflow is switched to npm trusted publishing and the token is removed).
- `main` is protected and the CI checks are required.

## Checklist

1. Update `CHANGELOG.md`: move `Unreleased` to a dated `## X.Y.Z` section, with the migration note when a grammar, API or message changed.
2. Update `version` in `package.json` to the same `X.Y.Z`. The release workflow refuses a tag that does not match it.
3. Run the checks the workflow runs:
   ```bash
   npm test
   npm run typecheck          # needs tsc; the package itself has no dependencies
   npm run schema && git diff --exit-code -- docs/spec.schema.json
   npm pack --dry-run
   ```
4. Commit the release (`git commit -m "chore: release X.Y.Z"`).
5. Tag the commit and push the tag:
   ```bash
   git tag -a vX.Y.Z -m "agent-ui X.Y.Z"
   git push origin vX.Y.Z
   ```
6. The `Release` workflow checks the tag, runs the tests and publishes with `--access public --provenance`.
7. Verify:
   ```bash
   npm view @ehtb/agent-ui version
   npx @ehtb/agent-ui --version
   ```
   Install it in an empty project, run `agent-ui check` and `agent-ui build`, and open the npm page to confirm the README, repository and license links.

## If the workflow cannot publish

Run the same commands from a clean checkout of the tag:

```bash
npm publish --access public --provenance
```

`prepublishOnly` runs the framework tests first. Do not publish from a dirty tree.

## Versioning

The project follows [semantic versioning](https://semver.org/) from `1.0.0`. Until then a minor version (`0.x.0`) may change the grammar, an API or a message, and `CHANGELOG.md` says how to move. The public surface is described in `README.md`, "Browser Support, Stability & Maturity".
