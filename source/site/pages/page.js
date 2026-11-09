// The landing page at "/". It has no state and no plugins: everything it shows is decided when the site is built.
const head = {
  title: 'agent-ui — UI that agents can maintain',
  description: 'A zero-dependency UI library with server rendering, a closed JSON grammar and plain-data state. Built for agents to write, check and maintain.',
  html: { lang: 'en' },
  body: { class: 'page-home' },
  tags: [
    { tag: 'link', props: { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' } },
    { tag: 'meta', props: { name: 'theme-color', content: '#0b1020' } },
    { tag: 'meta', props: { name: 'color-scheme', content: 'light' } },
    { tag: 'meta', props: { property: 'og:title', content: 'agent-ui — UI that agents can maintain' } },
    { tag: 'meta', props: { property: 'og:description', content: 'Zero dependencies, server rendered, validated before it runs.' } },
  ],
};

export const page = { head };
