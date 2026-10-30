// The content of the page at "/event/:id" (the file next to page.js). Only the server and the build import it.
import { a, act, article, button, equals, event, form, h2, h3, input, join, label, option, p, section, select, state, textarea, when } from '@ehtb/agent-ui/spec';
import { site } from '../../layout.js';

const fieldError = (field) =>
  when(state(`event.errors.${field}`), p({ id: `error-${field}`, role: 'alert', class: 'field-error' }, state(`event.errors.${field}`)));

const field = (id, labelText, control) => label({ id: `field-${id}` }, labelText, control, fieldError(id));
const inputEvents = (name) => ({ input: act('event.field', { name, value: event('target.value') }) });

const signupForm =
  form(
    {
      id: 'signup-form',
      // Without JavaScript the browser posts these fields to the page URL and the server renders the outcome.
      method: 'post',
      action: join('/event/', state('route.params.id'), '/signup'),
      novalidate: true,
      on: { submit: act('event.submit') },
    },
    h3({ id: 'signup-heading' }, 'Register'),
    when(state('event.message'), p({ id: 'signup-message', role: 'alert', class: 'form-error' }, state('event.message'))),
    field('name', 'Full name', input({ id: 'name', type: 'text', name: 'name', 'aria-label': 'Full name', autocomplete: 'name', value: state('event.values.name'), on: inputEvents('name') })),
    field('email', 'Email', input({ id: 'email', type: 'email', name: 'email', 'aria-label': 'Email', autocomplete: 'email', value: state('event.values.email'), on: inputEvents('email') })),
    field('tickets', 'Tickets', input({ id: 'tickets', type: 'number', name: 'tickets', min: 1, max: 5, 'aria-label': 'Number of tickets', value: state('event.values.tickets'), on: inputEvents('tickets') })),
    field(
      'ticketType',
      'Ticket type',
      select(
        { id: 'ticket-type', name: 'ticketType', 'aria-label': 'Ticket type', value: state('event.values.ticketType'), on: { change: act('event.field', { name: 'ticketType', value: event('target.value') }) } },
        option({ value: 'standard' }, 'Standard'),
        option({ value: 'vip' }, 'VIP'),
      ),
    ),
    field('notes', 'Notes (optional)', textarea({ id: 'notes', name: 'notes', rows: 3, 'aria-label': 'Notes', value: state('event.values.notes'), on: inputEvents('notes') })),
    label(
      { id: 'field-newsletter' },
      input({ id: 'newsletter', type: 'checkbox', name: 'newsletter', 'aria-label': 'Send me the newsletter', checked: state('event.values.newsletter'), on: { change: act('event.field', { name: 'newsletter', value: event('target.checked') }) } }),
      ' Send me the newsletter',
    ),
    button({ id: 'signup-submit', type: 'submit', disabled: state('event.busy') }, when(state('event.busy'), 'Sending…', 'Register')),
  );

export const view =
  article(
    { id: 'event-view' },
    a({ id: 'back', href: '/' }, 'All events'),
    when(state('event.isNotFound'), p({ id: 'not-found', role: 'alert' }, 'Event not found.')),
    when(state('event.current'), [
      h2({ id: 'event-title' }, state('event.current.title')),
      p({ id: 'event-meta' }, state('event.current.date'), ' · ', state('event.current.place'), ' · ', state('event.current.category'), ' · ', state('event.current.capacity'), ' seats'),
      p({ id: 'event-description' }, state('event.current.description')),
      section(
        { id: 'signup' },
        when(
          equals(state('event.status'), 'done'),
          [
            p({ id: 'signup-confirmation', role: 'status' }, 'You are registered. Your reference is ', state('event.reference'), '.'),
            button({ id: 'signup-another', on: { click: act('event.reset') } }, 'Register another person'),
          ],
          signupForm,
        ),
      ),
    ]),
  );

export const layout = site;
