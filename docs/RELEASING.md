# Releasing

The package is published to npm as `@ehtb/agent-ui` from a tag on `main`. The workflow `.github/workflows/release.yml` stages the release with provenance, and a maintainer approves it on npm with 2FA; nothing is published from a working copy.

## One-time setup

- The npm account or organization owns the `@ehtb` scope. `publishConfig.access` is `public`, so the package is public.
- The repository is public and **private vulnerability reporting** is enabled (the Security tab), because `SECURITY.md` points there.
- npm **trusted publishing** is configured for `@ehtb/agent-ui` (npmjs.com, the package's Settings, Trusted Publisher: GitHub Actions, repository `ehtb/agent-ui`, workflow `release.yml`) with the permission **npm stage publish** only (not `npm publish`), and the package access is "Require two-factor authentication and disallow bypass 2fa tokens". The workflow stages through GitHub's OIDC identity (`id-token: write`), so there is no npm token and no `NPM_TOKEN` secret, and nothing the workflow does can publish without a maintainer's 2FA.
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
6. The `Release` workflow checks the tag, runs the tests and stages the release with `npm stage publish --access public --provenance`. Nothing is public yet.
7. Inspect and approve the staged release (a maintainer, with 2FA; needs npm 11.15.0 or newer):
   ```bash
   npm stage list @ehtb/agent-ui
   npm stage download <stage-id>     # unpack it: check package.json (the "bin" entry), the files and the version
   npm stage approve <stage-id>      # prompts for 2FA and publishes
   ```
   `npm stage reject <stage-id>` removes a staged version that is wrong; a version that is staged cannot be staged or published again until it is approved or rejected.
8. Verify:
   ```bash
   npm view @ehtb/agent-ui version
   npx @ehtb/agent-ui --version
   ```
   Install it in an empty project, run `agent-ui check` and `agent-ui build`, and open the npm page to confirm the README, repository and license links.
9. Update the published documentation site (`gh-pages`): its pages, search index and sitemap are generated from `README.md`, `docs/*.md`, `CHANGELOG.md`, `examples/README.md` and the cookbook, and the export stamps the new version into the branch's `source/` copy. Run the commands in `site/README.md` after the version bump and the tag, so the site documents the released version; commit and push the branch. Without this step the site keeps the previous release's documentation.

## If the workflow cannot publish

Run the same commands from a clean checkout of the tag, logged in to npm (`npm login`) with 2FA:

```bash
npm publish --access public
```

Provenance only works from a supported CI, so there is no `--provenance` here. `prepublishOnly` runs the framework tests first. Do not publish from a dirty tree.

## Versioning

The project follows [semantic versioning](https://semver.org/) from `1.0.0`. Until then a minor version (`0.x.0`) may change the grammar, an API or a message, and `CHANGELOG.md` says how to move. The public surface is described in `README.md`, "Browser Support, Stability & Maturity".
