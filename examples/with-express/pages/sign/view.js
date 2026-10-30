// The content of the page at "/sign" (the file next to page.js). build/ and the server import it; a browser does not.
import { a, act, button, event, form, h2, input, join, p, section, state, when } from '@ehtb/agent-ui/spec';
import { layout } from '../layout.js';

export { layout };

export const view =
  section(
    { id: 'sign-view' },
    h2({ id: 'sign-title' }, 'Sign the guestbook'),
    when(
      state('sign.sent'),
      [
        p({ id: 'sent-note', role: 'status' }, 'Thank you, your entry is in.'),
        a({ id: 'sent-link', href: join('/entry/', state('sign.sent.id')) }, 'See your entry'),
        button({ id: 'sign-another', on: { click: act('sign.another') } }, 'Write another'),
      ],
      form(
        { id: 'entry-form', on: { submit: act('sign.send') } },
        when(state('sign.note'), p({ id: 'send-note', role: 'alert' }, state('sign.note'))),
        input({ id: 'name', type: 'text', name: 'name', placeholder: 'Your name', 'aria-label': 'Your name', value: state('sign.name'), on: { input: act('sign.setName', { value: event('target.value') }) } }),
        input({ id: 'message', type: 'text', name: 'message', placeholder: 'Your message', 'aria-label': 'Your message', value: state('sign.message'), on: { input: act('sign.setMessage', { value: event('target.value') }) } }),
        button({ id: 'send', type: 'submit', disabled: state('sign.sending') }, when(state('sign.sending'), 'Sending…', 'Sign the guestbook')),
      ),
    ),
  );
