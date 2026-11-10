# The documentation site

The site at https://ehtb.github.io/agent-ui/ is an agent-ui project like any other: pages are folders with a `page.js`
and a `view.js`, the build writes the chunks, and `--static` renders every URL to an HTML file. It has no server, so a
file host can serve it.

The site's own documentation is not a second copy. `scripts/generate.mjs` reads the Markdown of this repository
(`README.md`, `docs/*.md`, `CHANGELOG.md`, `examples/README.md`) and the cookbook, turns it into page spec data, and
writes the search index and the sitemap. What is generated is listed in `generated/` and is never edited by hand; the
pages under `pages/docs/` and `pages/cookbook/` are one-line wrappers the generator rewrites.

## Commands

```bash
npm install        # links the package next to it (see scripts/link-package.mjs)
npm run check      # generate, then render every page and report spec, link and data problems
npm run build      # generate, then write dist/ with one HTML file per URL
npm run dev        # generate, then serve with hot reload
```

The project depends on `@ehtb/agent-ui` through a `file:` dependency, so a change in the framework is on the site at the
next build. `scripts/link-package.mjs` runs after `npm install`: npm writes the symlink of a scoped `file:` dependency
one folder too high and does not link its command, so the script repairs both. With the published package (the copy on
the `gh-pages` branch) nothing needs repairing and the script does nothing.

## Publishing

GitHub Pages serves the repository's project site below `/agent-ui/`, so `build.config.mjs` sets that base path and
`--static` is what writes the files.

**The `gh-pages` branch is written by the workflow `.github/workflows/site.yml`.** On every push to `main` it checks
the site (`npm run check`), builds it, runs `scripts/export.mjs` into a checkout of `gh-pages` and commits and pushes
the result when something changed (the build is deterministic, so a push that changes nothing the site shows makes no
commit). A pull request runs the check only. The version the site shows is the `version` of `package.json` on `main`,
so it changes with the version bump, before the package is approved on npm. The workflow can also be started by hand
(`workflow_dispatch`). Do not edit the branch by hand; the next push to `main` overwrites it.

To produce the branch yourself, from a worktree of `gh-pages` (the script replaces everything in the folder except
`.git`):

```bash
npm run build
node scripts/export.mjs ../../agent-ui-gh-pages
```

The export script writes the built site at the root of the branch and a stand-alone copy of this project under
`source/`, with the documentation it publishes copied into `source/site/content/` and the dependency changed to the
published package.
