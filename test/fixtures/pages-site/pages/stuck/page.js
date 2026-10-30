// Never ready: the render server serves it after its deadline and logs that it did.
export const page = {
  head: { title: 'Stuck' },
  ready: () => false,
};
