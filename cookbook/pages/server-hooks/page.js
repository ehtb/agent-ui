// The page side of the server-hooks recipe. The server (../server-hooks.mjs) supplies the public session state;
// a page cannot set response headers. The status is the one data-dependent answer a page owns.
export const page = {
  head: { title: 'Server hooks' },
  namespaces: { session: { state: { user: null } } },
  status: (state) => (state.session.user ? 200 : 403),
};
