// The content of the page at "/contact" (the file next to page.js). Only the server and the build import it.
import { act, article, aside, button, details, equals, event, form, h2, h3, input, label, p, state, summary, textarea, when } from '@ehtb/agent-ui/spec';
import { focused } from '../layout.js';

const errorFor = (field) =>
  when(state(`contact.errors.${field}`), p({ id: `contact-error-${field}`, role: 'alert', class: 'field-error' }, state(`contact.errors.${field}`)));
const inputEvents = (name) => ({ input: act('contact.field', { name, value: event('target.value') }) });

const contactForm =
  form(
    { id: 'contact-form', method: 'post', action: '/contact', novalidate: true, on: { submit: act('contact.submit') } },
    when(state('contact.note'), p({ id: 'contact-note', role: 'alert', class: 'form-error' }, state('contact.note'))),
    label({ id: 'contact-field-name' }, 'Your name', input({ id: 'contact-name', type: 'text', name: 'name', 'aria-label': 'Your name', autocomplete: 'name', value: state('contact.values.name'), on: inputEvents('name') }), errorFor('name')),
    label({ id: 'contact-field-email' }, 'Email', input({ id: 'contact-email', type: 'email', name: 'email', 'aria-label': 'Email', autocomplete: 'email', value: state('contact.values.email'), on: inputEvents('email') }), errorFor('email')),
    label({ id: 'contact-field-message' }, 'Message', textarea({ id: 'contact-message', name: 'message', rows: 5, 'aria-label': 'Message', value: state('contact.values.message'), on: inputEvents('message') }), errorFor('message')),
    button({ id: 'contact-submit', type: 'submit', disabled: state('contact.busy') }, when(state('contact.busy'), 'Sending…', 'Send message')),
  );

export const view =
  article(
    { id: 'contact-view' },
    h2({ id: 'contact-title' }, 'Contact the organisers'),
    when(
      equals(state('contact.status'), 'done'),
      [
        p({ id: 'contact-confirmation', role: 'status' }, 'Thank you. Your reference is ', state('contact.reference'), '.'),
        button({ id: 'contact-another', on: { click: act('contact.reset') } }, 'Send another message'),
      ],
      contactForm,
    ),
    aside(
      { id: 'contact-aside' },
      h3(null, 'Other ways to reach us'),
      p(null, 'We answer within two working days.'),
      details({ id: 'contact-details' }, summary(null, 'Press and partnerships'), p(null, 'Write to the same form and mention "press" in your message.')),
    ),
  );

export const layout = focused;
