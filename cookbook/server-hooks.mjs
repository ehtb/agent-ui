// The server side of pages/server-hooks. Mount this module's pieces with createSsrHandler:
//   initialStateFor, transformResponse and createApi.
//
// This is a dependency-free demo, not a production session store: the session cookie is an HMAC-signed display name,
// and the secret is random per process, so a restart signs everyone out. A real app keeps a server-side session and
// stores only an opaque id in the cookie. Serve it over HTTPS (browsers treat localhost as secure, but production does not).
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const secret = randomBytes(32);
const USER = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,39}$/;

const sessionCookie = (user) => {
  const value = Buffer.from(user, 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(value).digest('base64url');
  return `session=${value}.${signature}; Path=/; HttpOnly; Secure; SameSite=Lax`;
};

// The cookie is signed and carries only the display name; the state carries that name, never the token.
const readUser = (cookies) => {
  const token = cookies?.session;
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [value, signature] = parts;
  const expected = createHmac('sha256', secret).update(value).digest('base64url');
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const user = Buffer.from(value, 'base64url').toString('utf8');
  return USER.test(user) ? user : null;
};

export const initialStateFor = (request) => ({ session: { user: readUser(request.cookies) } });

// One site policy over every answer. The body may be HTML, JSON or text, so the content type decides whether a nonce
// and a body rewrite belong. The page's own status (200 or 403) is not changed here.
// The framework's page CSS is an external file covered by style-src 'self'; a page that emits inline style needs a
// hash/nonce (or 'unsafe-inline'), which is the host's decision.
export const transformResponse = (request, { status, headers, body }) => {
  const html = String(headers['content-type'] ?? '').startsWith('text/html');
  const policy = { 'strict-transport-security': 'max-age=31536000; includeSubDomains' };
  if (!html) return { headers: policy };
  const nonce = randomBytes(16).toString('base64');
  return {
    headers: { ...policy, 'content-security-policy': `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self'` },
    body: body.replace(/<script(?=[\s>])(?![^>]*\bsrc\s*=)/g, `<script nonce="${nonce}"`),
  };
};

// The request context is the same object the page and initialStateFor read.
export const createApi = () => ({
  handle({ pathname, query, cookies }) {
    if (pathname !== '/api/server-hooks') return null;
    return {
      status: 200,
      body: { user: readUser(cookies), q: query.get('q') },
      headers: { 'cache-control': 'no-store', 'set-cookie': 'seen=1; Path=/; HttpOnly; Secure; SameSite=Lax' },
    };
  },
  handleForm({ pathname, form }) {
    if (pathname !== '/server-hooks/login') return null;
    const user = String(form?.user ?? '').trim();
    if (!USER.test(user)) return { status: 400, url: '/server-hooks', initialState: { session: { user: null } } };
    return { redirect: '/server-hooks', headers: { 'set-cookie': sessionCookie(user) } };
  },
});
