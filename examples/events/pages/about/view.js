// The content of the page at "/about" (the file next to page.js). Only the server and the build import it.
import { h2, li, p, section, ul } from '@ehtb/agent-ui/spec';
import { site } from '../layout.js';

export const view = section(
  { id: 'about-view' },
  h2({ id: 'about-title' }, 'About these meetups'),
  p(null, 'We meet monthly to look at how interfaces are built when agents write the code. Everything here is a demo of the framework: server rendering, static pages, forms and hydration.'),
  ul(null, li(null, 'Talks and workshops, open to everyone'), li(null, 'Small groups, so registration is limited'), li(null, 'Free of charge')),
);

export const layout = site;
