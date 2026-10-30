// Reusable field logic: what a React project writes as custom hooks (useField, useDisclosure).
//
// A feature is a namespace: { state, derive, actions } with short names (value, touched, error, set, touch). Mounting
// it under a name gives it that name's keys, so one definition serves any number of fields and two uses never collide:
//
//   namespaces: { email: textField({ validate }), password: textField({ validate }), terms: checkField({ required }) }
//
// gives `email.value`, `email.invalid`, `email.set`, `password.value`, ... Inside the feature the keys are written
// without the prefix (get('value')); the page and the components write them with it (state('email.value')).
//
//   React                                     agent-ui
//   const [value, setValue] = useState('')    state email.value, action email.set
//   const error = useMemo(validate, [value])  derive email.error
//   onBlur={() => setTouched(true)}           action email.touch
//   const field = useField('email', rules)    email: textField({ validate }), in `namespaces`

// A text input: value, touched flag, error message, and whether the message should show yet.
export const textField = ({ initial = '', validate = () => '' } = {}) => ({
  state: { value: initial, touched: false },
  derive: {
    error: (get) => validate(get('value')),
    invalid: (get) => get('touched') && get('error') !== '',
    message: (get) => (get('invalid') ? get('error') : ''),
  },
  actions: {
    set: { args: { value: 'string' }, run: (store, { value }) => store.set('value', value) },
    touch: { args: {}, run: (store) => store.set('touched', true) },
  },
});

// A checkbox with the same names, plus `state` ('checked' or 'unchecked'), the data-state a stylesheet selects on.
// `required` is the message shown while it is unchecked ('' for no rule).
export const checkField = ({ initial = false, required = '' } = {}) => ({
  state: { value: initial, touched: false },
  derive: {
    state: (get) => (get('value') ? 'checked' : 'unchecked'),
    error: (get) => (required && !get('value') ? required : ''),
    invalid: (get) => get('touched') && get('error') !== '',
    message: (get) => (get('invalid') ? get('error') : ''),
  },
  actions: {
    set: { args: { value: 'boolean' }, run: (store, { value }) => store.set('value', value) },
    touch: { args: {}, run: (store) => store.set('touched', true) },
  },
});

// Something the visitor can close for good: mounted as `welcome`, it gives welcome.dismissed and welcome.dismiss.
export const dismissible = () => ({
  state: { dismissed: false },
  actions: { dismiss: { args: {}, run: (store) => store.set('dismissed', true) } },
});
