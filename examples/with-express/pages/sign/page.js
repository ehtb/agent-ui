// The page "/sign": the form. The browser sends it to the host's POST /api/entries through `resources`; a refusal from the
// host (422) is shown and the form is kept. When the entry is accepted the page shows a confirmation with a link to it.
// Behavior only; the content is in view.js next to it.
import { guestbook, plugins } from '../shared.js';

// The namespace of this page. Accepted entries are not added to the list here: the host owns the data, and the entries
// page loads it from the host when it opens.
const sign = {
  state: {
    name: '',
    message: '',
    status: 'editing', // 'editing' | 'sending'
    note: '', // a refusal from the server
    request: null, // set by sign.send; the `resources` entry below sends it
    sent: null, // the entry the server accepted
  },
  derive: {
    sending: (get) => get('status') === 'sending',
  },
  actions: {
    setName: { args: { value: 'string' }, run: (store, { value }) => store.set('name', value) },
    setMessage: { args: { value: 'string' }, run: (store, { value }) => store.set('message', value) },
    send: {
      args: {},
      run: (store) => {
        if (store.get('status') !== 'editing') return; // a repeated Enter while sending
        const name = store.get('name').trim();
        const message = store.get('message').trim();
        if (!name || !message) return store.set('note', 'Write your name and a message.');
        store.set('status', 'sending');
        store.set('note', '');
        store.set('request', { name, message });
      },
    },
    started: { args: {}, run: (store) => store.set('note', '') },
    accepted: {
      args: { data: 'json' },
      run: (store, { data }) => {
        store.set('sent', data);
        store.set('name', '');
        store.set('message', '');
        store.set('status', 'editing');
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
    another: { args: {}, run: (store) => store.set('sent', null) },
  },
  resources: [
    {
      watch: ['request'],
      request: ({ request }) => (request ? { url: '/api/entries', method: 'POST', body: request } : null),
      onStart: 'started',
      onSuccess: 'accepted',
      onError: 'failed',
    },
  ],
};

export const page = {
  namespaces: { guestbook, sign },
  plugins,
  head: { title: 'Sign - Guestbook', description: 'Write a message in the guestbook.' },
};
