// The content of the page at "/faq" (the file next to page.js). Only the server and the build import it.
import { dd, dl, dt, h2, section } from '@ehtb/agent-ui/spec';
import { site } from '../layout.js';

export const view = section(
  { id: 'faq-view' },
  h2({ id: 'faq-title' }, 'Frequently asked questions'),
  dl(
    null,
    dt({ id: 'faq-q1' }, 'Do I need JavaScript to register?'),
    dd(null, 'No. The form is a normal HTML form; with JavaScript it validates as you go and does not reload the page.'),
    dt({ id: 'faq-q2' }, 'What if an event is full?'),
    dd(null, 'The server refuses the registration and tells you how many seats are left.'),
    dt({ id: 'faq-q3' }, 'Can I register twice?'),
    dd(null, 'Once per email address and event.'),
  ),
);

export const layout = site;
