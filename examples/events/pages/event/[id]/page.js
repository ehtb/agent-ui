// The page "event": one event with its sign-up form. The form works with JavaScript (validated here, sent through
// `resources` to this route's API) and without it (a plain form post that the server answers with a rendered page).
// Validation rules are shared (signup.js) with the server code in api.js, so client and server cannot disagree.
// page.js is page-shape and behavior only; the content is view.js next to it.
import { FIELDS, emptySignup, normalizeSignup, validateSignup } from './signup.js';
import { events, eventsSettled, plugins } from '../../shared.js';
import { withHead } from '@ehtb/agent-ui/head';

const findEvent = (events, routeParams) => events.find((event) => String(event.id) === routeParams.id) ?? null;

const resetSignup = (store) => {
  store.set('values', emptySignup());
  store.set('errors', {});
  store.set('status', 'editing');
  store.set('message', '');
  store.set('reference', '');
  store.set('request', null);
};

// The namespace "event": the form is `event.values`, `event.errors`, ... and its actions `event.field`, `event.submit`, ...
const signup = {
  state: {
    values: emptySignup(),
    errors: {}, // field -> message
    status: 'editing', // 'editing' | 'submitting' | 'done'
    message: '', // a refusal from the server (sold out, already registered, ...)
    reference: '',
    request: null, // set by event.submit; the `resources` entry below sends it
  },
  derive: {
    current: (get) => findEvent(get('events.list'), get('route.params')),
    isNotFound: (get) => get('events.status') === 'ready' && !findEvent(get('events.list'), get('route.params')),
    busy: (get) => get('status') === 'submitting',
  },
  actions: {
    field: {
      args: { name: 'string', value: 'json' },
      run: (store, { name, value }) => {
        if (!FIELDS.includes(name)) return;
        const { [name]: ignoredError, ...remainingErrors } = store.get('errors');
        store.set('values', { ...store.get('values'), [name]: value });
        store.set('errors', remainingErrors);
      },
    },
    submit: {
      args: {},
      run: (store) => {
        if (store.get('status') !== 'editing') return; // already sending or done (a repeated Enter)
        const event = findEvent(store.get('events.list'), store.get('route.params'));
        if (!event) return;
        const errors = validateSignup(store.get('values'), event);
        store.set('errors', errors);
        store.set('message', '');
        if (Object.keys(errors).length) return;
        store.set('status', 'submitting');
        store.set('request', { eventId: event.id, values: normalizeSignup(store.get('values')) });
      },
    },
    started: { args: {}, run: (store) => store.set('message', '') },
    succeeded: {
      args: { data: 'json' },
      run: (store, { data }) => {
        store.set('status', 'done');
        store.set('reference', String(data.reference));
        store.set('values', emptySignup());
        store.set('request', null);
      },
    },
    failed: {
      args: { message: 'string' },
      run: (store, { message }) => {
        store.set('status', 'editing');
        store.set('message', message);
        store.set('request', null);
      },
    },
    reset: { args: {}, run: resetSignup },
  },
  resources: [
    {
      watch: ['request'],
      request: ({ request }) => (request ? { url: `/api/event/${request.eventId}/signup`, method: 'POST', body: request.values } : null),
      onStart: 'started',
      onSuccess: 'succeeded',
      onError: 'failed',
    },
  ],
};

export const page = {
  namespaces: { events, event: signup },
  plugins: [...plugins, withHead],
  head: {
    title: (state) => {
      const event = findEvent(state.events.list, state.route.params);
      return event ? `${event.title} - Meetups` : 'Event - Meetups';
    },
    description: (state) => findEvent(state.events.list, state.route.params)?.summary ?? 'An event',
  },
  ready: eventsSettled,
  // An id that names no event answers 404 (once the events have loaded).
  status: (state) => (state.events.status === 'ready' && !findEvent(state.events.list, state.route.params) ? 404 : 200),
};
