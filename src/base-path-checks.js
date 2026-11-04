// The one valid form of a base path (src/base-path.js), checked where one enters: the build configuration (build/config-check.mjs),
// renderPage and createSsrHandler, and app() in development (src/runtime-checks.js). Production browser bundles leave it out: their
// base path was written down by a build that checked it.

// One or more segments, each starting with "/", with no trailing slash: "/shop", "/apps/shop". "" is a site at the root.
const BASE_PATH = /^(?:\/[A-Za-z0-9._~-]+)+$/;
export const isBasePath = (value) => value === '' || (typeof value === 'string' && BASE_PATH.test(value) && !/\/\.\.?(?:\/|$)/.test(value));
export const BASE_PATH_ADVICE = 'Write basePath as a path below the root with no trailing slash, for example "/shop" or "/apps/shop", or leave it out for a site at the root';
