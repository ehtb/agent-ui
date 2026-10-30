// Recipe: a form whose errors, and whether it can be submitted, follow from its fields.
// The fields are state. The errors and `valid` are derived from them, so they cannot disagree with the fields. Errors are shown
// only after the first attempt to submit (`attempted`), not while the visitor is still typing the first character.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const signup = {
  state: { email: '', password: '', attempted: false, done: false },
  derive: {
    emailError: (get) => (EMAIL.test(get('email')) ? '' : 'Enter an address like name@example.com'),
    passwordError: (get) => (get('password').length >= 8 ? '' : 'Use at least 8 characters'),
    valid: (get) => get('emailError') === '' && get('passwordError') === '',
    // What the view shows: an error only once the visitor has tried to submit.
    shownEmailError: (get) => (get('attempted') ? get('emailError') : ''),
    shownPasswordError: (get) => (get('attempted') ? get('passwordError') : ''),
  },
  actions: {
    setEmail: { args: { value: 'string' }, run: (store, { value }) => store.set('email', value) },
    setPassword: { args: { value: 'string' }, run: (store, { value }) => store.set('password', value) },
    submit: {
      args: {},
      run: (store) => {
        store.set('attempted', true);
        if (store.get('valid')) store.set('done', true);
      },
    },
  },
};

export const page = { head: { title: 'Sign up - cookbook' }, namespaces: { signup } };
