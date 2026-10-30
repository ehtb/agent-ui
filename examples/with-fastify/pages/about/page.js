// The page "/about": static content, no state and no data. Behavior only; the content is in view.js next to it.
import { guestbook, plugins } from '../shared.js';

export const page = {
  namespaces: { guestbook },
  plugins,
  head: { title: 'About - Guestbook', description: 'How this guestbook is built.' },
};
