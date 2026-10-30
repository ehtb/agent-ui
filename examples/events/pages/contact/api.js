// Server side of the "contact" page (Node only). Messages are kept in memory.
import { emptyContact, normalizeContact, validateContact } from './rules.js';

export const createContactApi = () => {
  let messages = [];

  // One decision for both the JSON endpoint and the plain form post.
  const send = (rawValues) => {
    const errors = validateContact(rawValues);
    if (Object.keys(errors).length) return { status: 422, message: 'Please fix the highlighted fields.', errors };
    messages.push(normalizeContact(rawValues));
    return { status: 201, reference: `MSG-${messages.length}` };
  };

  return {
    endpoints: {
      'POST /message': ({ body }) => {
        const { status, ...payload } = send(body);
        return { status, body: payload };
      },
    },
    forms: {
      '/contact': ({ form }) => {
        const values = { ...emptyContact(), name: form.name ?? '', email: form.email ?? '', message: form.message ?? '' };
        const result = send(values);
        if (result.status === 201) {
          return { status: 200, url: '/contact', initialState: { contact: { values: emptyContact(), errors: {}, status: 'done', note: '', reference: result.reference } } };
        }
        return { status: result.status, url: '/contact', initialState: { contact: { values, errors: result.errors ?? {}, status: 'editing', note: result.message } } };
      },
    },
    reset: () => {
      messages = [];
    },
    messages: () => messages,
  };
};
