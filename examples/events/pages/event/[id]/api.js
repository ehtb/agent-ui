// Server side of the "event" page (Node only; never bundled for the browser). Endpoints are served below
// /api/event/ and the plain form post at the page URL, both declared in the table returned here.
// State is in memory: restarting the server forgets the registrations.
import { readFileSync } from 'node:fs';
import { emptySignup, normalizeSignup, validateSignup } from './signup.js';

export const createEventApi = () => {
  const events = JSON.parse(readFileSync(new URL('../../../public/events.json', import.meta.url), 'utf8'));
  let registrations = [];
  const seatsTaken = (eventId) => registrations.filter((entry) => entry.eventId === eventId).reduce((sum, entry) => sum + entry.values.tickets, 0);

  // The single place that decides the outcome of a sign-up, for both the JSON API and the plain form post.
  const register = (eventId, rawValues) => {
    const event = events.find((candidate) => String(candidate.id) === String(eventId));
    if (!event) return { status: 404, message: 'Event not found.' };
    const errors = validateSignup(rawValues, event);
    if (Object.keys(errors).length) return { status: 422, message: 'Please fix the highlighted fields.', errors };
    const values = normalizeSignup(rawValues);
    if (registrations.some((entry) => entry.eventId === event.id && entry.values.email === values.email)) {
      return { status: 409, message: 'This email is already registered for this event.' };
    }
    const seatsLeft = event.capacity - seatsTaken(event.id);
    if (values.tickets > seatsLeft) {
      return { status: 409, message: seatsLeft === 0 ? 'Sorry, this event is sold out.' : `Only ${seatsLeft} seat${seatsLeft === 1 ? '' : 's'} left.` };
    }
    registrations.push({ eventId: event.id, values });
    return { status: 201, reference: `EVT-${event.id}-${registrations.length}`, seatsLeft: seatsLeft - values.tickets };
  };

  return {
    endpoints: {
      'POST /:id/signup': ({ params, body }) => {
        const { status, ...payload } = register(params.id, body);
        return { status, body: payload };
      },
      'GET /:id/registrations': ({ params }) => {
        const eventId = Number(params.id);
        return { status: 200, body: { eventId, count: registrations.filter((entry) => entry.eventId === eventId).length, seatsTaken: seatsTaken(eventId) } };
      },
    },
    // A plain <form method="post"> to the page URL (no JavaScript): the page is rendered with the outcome as state.
    forms: {
      '/event/:id/signup': ({ params, form }) => {
        const values = {
          ...emptySignup(),
          name: form.name ?? '',
          email: form.email ?? '',
          tickets: String(form.tickets ?? '1'),
          ticketType: form.ticketType ?? 'standard',
          newsletter: form.newsletter === 'on' || form.newsletter === 'true',
          notes: form.notes ?? '',
        };
        const result = register(params.id, values);
        if (result.status === 404) return null;
        const url = `/event/${params.id}`; // the page the form belongs to
        // The state has the shape of ui.state(): by namespace.
        if (result.status === 201) {
          return { status: 200, url, initialState: { event: { values: emptySignup(), errors: {}, status: 'done', message: '', reference: result.reference } } };
        }
        return { status: result.status, url, initialState: { event: { values: values, errors: result.errors ?? {}, status: 'editing', message: result.message } } };
      },
    },
    reset: () => {
      registrations = [];
    },
    registrations: () => registrations,
  };
};
