// A site served below a path of its domain (`basePath: '/shop'` in build.config.mjs). Inside the app every path is the site's own:
// a spec writes `a({ href: '/product/3' })`, a page folder is `/product/:id`, `route.path` is "/product/3", a resource asks for
// "/api/cart" and the project's API sees "/api/cart". The base exists only on the wire: the runtime writes it before a root-absolute
// URL it puts in the page (href, src, action, formaction, cite, the URLs of ping and srcset, and the same attributes in the head), the browser's fetch adds it to a
// resource's URL, soft navigation adds it to the address, and the build adds it to the asset URLs; the render server takes it off a
// request's path before it looks for the page. A URL that is not root-absolute ("https://...", "//cdn...", "#top", "about") is left as it is.

// The URL on the wire for a URL of the site: "/about" -> "/shop/about", "/" -> "/shop/".
export const withBase = (basePath, url) => (basePath && typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? `${basePath}${url}` : url);

// The attributes that hold URLs of the site, and how: one URL (href, src, action, formaction, cite), a list separated by spaces (ping),
// or image candidates, "url descriptor" separated by commas (srcset). A URL in a srcset that holds a comma is not supported.
const LIST_ATTRIBUTES = { ping: ' ', srcset: ',' };
export const BASE_PATH_ATTRIBUTES = ['href', 'src', 'action', 'formaction', 'cite', 'ping', 'srcset'];
export const withBaseInAttribute = (basePath, name, value) => {
  if (!basePath || typeof value !== 'string') return value;
  const separator = LIST_ATTRIBUTES[name];
  if (!separator) return withBase(basePath, value);
  return value
    .split(separator)
    .map((part) => part.replace(/^(\s*)(\S+)/, (match, space, url) => space + withBase(basePath, url)))
    .join(separator);
};

// The site's own path for a path on the wire: "/shop/about" -> "/about", "/shop" and "/shop/" -> "/"; null for a path outside the base.
export const withoutBase = (basePath, pathname) => {
  if (!basePath) return pathname;
  if (pathname === basePath) return '/';
  return pathname.startsWith(`${basePath}/`) ? pathname.slice(basePath.length) : null;
};
