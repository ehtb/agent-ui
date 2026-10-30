// The files a built site and its public/ folder contain, by extension. Anything else is sent as application/octet-stream.
// A path whose last segment ends in one of these is a file, not a page: "/logo.png" is, "/user/jane.doe" and "/docs/v1.0" are not, so a
// parameterized page may have a dot in its last segment.
export const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

// Sent with every answer of the handlers: a browser must not guess another content type for a body (JSON read as HTML, a file read as a script).
export const SECURITY_HEADERS = { 'x-content-type-options': 'nosniff' };

export const isFilePath = (pathname) => {
  const dot = pathname.lastIndexOf('.');
  return dot > pathname.lastIndexOf('/') && Object.hasOwn(MIME_TYPES, pathname.slice(dot).toLowerCase());
};
