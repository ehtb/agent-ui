// The only file esbuild reads for zod. agent-ui's bundler reads a small module dialect (no `export *`, no re-exports) and zod is
// written with both, so `npm run vendor` bundles zod/mini into vendor/zod.js (generated, not committed), and build.config.mjs
// (`replaceModules`) gives a browser bundle that file where the source says `import ... from 'zod/mini'`. Node and tsc use the package.
// Name only what the app uses: esbuild leaves the rest of zod out (`export *` would put all of it in the file, 420 kB).
export { array, enum, nullable, number, object, string } from 'zod/mini';
