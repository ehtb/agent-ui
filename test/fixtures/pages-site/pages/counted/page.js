// Counts the apps it ends, so a test can see that the render server destroys the page after each request, also when writing its document fails.
const countDestroys = () => (api) => api.onDestroy(() => (globalThis.destroyedPages = (globalThis.destroyedPages ?? 0) + 1));

export const page = {
  head: {
    title: 'Counted',
    // The text of a data script is made when the document is written (not when the page starts), so this fails after the render.
    tags: [
      {
        tag: 'script',
        props: { type: 'application/ld+json' },
        children: () => {
          if (globalThis.failCountedRender) throw new Error('the head could not be described');
          return { name: 'Counted' };
        },
      },
    ],
  },
  plugins: [countDestroys],
};
