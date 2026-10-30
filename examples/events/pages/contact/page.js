// The page "contact": a page with its own design (the "focused" layout: no site navigation, a side panel and a details
// element), its own state, its own API (routes/contact/api.js) and its own head. Same form pattern as the event
// sign-up: validated here before sending, validated again by the server, and a plain form post works without JavaScript.
// page.js is page-shape and behavior only; the content is view.js next to it.
import { CONTACT_FIELDS, emptyContact, validateContact } from './rules.js';
import { plugins } from '../shared.js';

const resetContact = (store) => {
  store.set('values', emptyContact());
  store.set('errors', {});
  store.set('status', 'editing');
  store.set('note', '');
  store.set('reference', '');
  store.set('request', null);
};

const contact = {
  state: {
    values: emptyContact(),
    errors: {},
    status: 'editing', // 'editing' | 'submitting' | 'done'
    note: '',
    reference: '',
    request: null,
  },
  derive: { busy: (get) => get('status') === 'submitting' },
  actions: {
    field: {
      args: { name: 'string', value: 'json' },
      run: (store, { name, value }) => {
        if (!CONTACT_FIELDS.includes(name)) return;
        const { [name]: ignoredError, ...remainingErrors } = store.get('errors');
        store.set('values', { ...store.get('values'), [name]: value });
        store.set('errors', remainingErrors);
      },
    },
    submit: {
      args: {},
      run: (store) => {
        if (store.get('status') !== 'editing') return;
        const errors = validateContact(store.get('values'));
        store.set('errors', errors);
        store.set('note', '');
        if (Object.keys(errors).length) return;
        store.set('status', 'submitting');
        store.set('request', { ...store.get('values') });
      },
    },
    started: { args: {}, run: (store) => store.set('note', '') },
    succeeded: {
      args: { data: 'json' },
      run: (store, { data }) => {
        store.set('status', 'done');
        store.set('reference', String(data.reference));
        store.set('values', emptyContact());
        store.set('request', null);
      },
    },
    failed: {
      args: { message: 'string' },
      run: (store, { message }) => {
        store.set('status', 'editing');
        store.set('note', message);
        store.set('request', null);
      },
    },
    reset: { args: {}, run: resetContact },
  },
  resources: [
    {
      watch: ['request'],
      request: ({ request }) => (request ? { url: '/api/contact/message', method: 'POST', body: request } : null),
      onStart: 'started',
      onSuccess: 'succeeded',
      onError: 'failed',
    },
  ],
};

export const page = {
  namespaces: { contact },
  plugins,
  head: { title: 'Contact - Meetups', description: 'Write to the organisers.' },
};
