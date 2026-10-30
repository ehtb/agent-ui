// The page at "/": behavior only. The field namespaces come from the feature functions in features.js; `signup` is the
// page's own and reaches the fields through `calls`. The content (built from the kit in ui/) is view.js next to this file.
import { textField, checkField, dismissible } from '../features.js';

const FIELDS = ['email', 'password', 'terms'];

// Every field is a namespace made by a feature function; `signup` is the page's own and reaches the fields through `calls`.
export const namespaces = {
  signup: {
    state: { submitted: false },
    derive: { formValid: (get) => FIELDS.every((field) => get(`${field}.error`) === '') },
    actions: {
      submit: {
        args: {},
        // Show every message, not only the field last left: touching a field is the field's own action.
        calls: FIELDS.map((field) => `${field}.touch`),
        run: (store, args, call) => {
          FIELDS.forEach((field) => call(`${field}.touch`, {}));
          store.set('submitted', store.get('formValid'));
        },
      },
    },
  },
  email: textField({ validate: (value) => (!value ? 'Enter your email.' : /^\S+@\S+\.\S+$/.test(value) ? '' : 'That does not look like an email address.') }),
  password: textField({ validate: (value) => (value.length >= 8 ? '' : 'Use at least 8 characters.') }),
  terms: checkField({ required: 'Accept the terms to continue.' }),
  welcome: dismissible(),
};

export const page = { head: { title: 'React components, converted' }, namespaces };
