const known = ['1', '2'];

export const page = {
  head: { title: (state) => `Item ${state.route.params.id}` },
  status: (state) => (known.includes(state.route.params.id) ? 200 : 404),
};
