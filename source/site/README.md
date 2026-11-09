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
`--static` is what writes the files. The branch is produced from this working copy:

```bash
npm run build
node scripts/export.mjs ../../agent-ui-gh-pages
```

The export script writes the built site at the root of the branch and a stand-alone copy of this project under
`source/`, with the documentation it publishes copied into `source/site/content/` and the dependency changed to the
published package. The folder must be a checkout of `gh-pages`; the script replaces everything in it except `.git`.
Commit and push from there.
