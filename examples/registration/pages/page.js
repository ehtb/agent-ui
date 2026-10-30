// A registration form where state changes reshape the form:
//   - the account type shows or hides the company fields; the VAT number becomes required for companies in the EU
//   - the country list is fetched; choosing a country fetches its regions (a country without a list hides the region field)
//   - "same as billing" hides the shipping address; "newsletter" reveals a frequency; "advanced" is a collapsible panel
//     with a field that appears when a checkbox is ticked
//   - the password field switches between hidden and visible, and its strength is derived
// Nothing here changes the page by hand: actions write state, derived values compute what is shown, and the spec binds to them.
//   rules.js    the validation and the payload as plain functions (what is shown decides what is checked and sent)
//   page.js     the namespaces (form, countries, regions) and the two resources
//   view.js     the spec of the form
import { withResources } from '@ehtb/agent-ui/resources';
import { TEXT_FIELDS, BOOLEAN_FIELDS, buildPayload, passwordStrength, validateRegistration, visibility } from './rules.js';

// Three namespaces:
//   form        the fields, what is shown, the validation and the payload (everything the visitor is filling in)
//   countries   the fetched country list
//   regions     the regions of the chosen country, fetched when `form.country` changes
// `form` reads the other two (reading is open); choosing a country empties the regions through `calls`.
const DEFAULT_VALUES = {
  accountType: 'personal', // 'personal' | 'business'
  companyName: '',
  vatNumber: '',
  fullName: '',
  email: '',
  password: '',
  passwordConfirm: '',
  showPassword: false,
  country: '',
  region: '',
  street: '',
  city: '',
  postalCode: '',
  shippingSame: true,
  shippingStreet: '',
  shippingCity: '',
  shippingPostalCode: '',
  newsletter: false,
  newsletterFrequency: 'weekly',
  advancedOpen: false,
  phoneContact: false,
  phone: '',
};

const VALUE_FIELDS = [...TEXT_FIELDS, ...BOOLEAN_FIELDS, 'country'];

export const namespaces = {
  form: {
    state: {
      ...DEFAULT_VALUES,
      submitted: false, // true after the first attempt: errors are shown from then on
      submitStatus: 'editing', // 'editing' | 'done'
    },
    derive: {
      values: (get) => Object.fromEntries(VALUE_FIELDS.map((name) => [name, get(name)])),
      countryIsEu: (get) => get('countries.list').some((country) => country.code === get('country') && country.eu),
      context: (get) => ({ regionsStatus: get('regions.status'), countryIsEu: get('countryIsEu') }),
      shown: (get) => visibility(get('values'), get('context')),
      errors: (get) => validateRegistration(get('values'), get('context')),
      shownErrors: (get) => (get('submitted') ? get('errors') : {}),
      errorCount: (get) => Object.keys(get('shownErrors')).length,
      errorSummary: (get) => `Fix ${get('errorCount')} ${get('errorCount') === 1 ? 'field' : 'fields'} to continue.`,
      payloadText: (get) => JSON.stringify(buildPayload(get('values'), get('context')), null, 2),
      passwordType: (get) => (get('showPassword') ? 'text' : 'password'),
      passwordStrengthText: (get) => (get('password') ? `Strength: ${passwordStrength(get('password'))}` : ''),
      postalLabel: (get) => (get('country') === 'US' ? 'ZIP code' : 'Postal code'),
      advancedLabel: (get) => (get('advancedOpen') ? 'Hide advanced options' : 'Show advanced options'),
    },
    actions: {
      setField: {
        args: { name: 'string', value: 'string' },
        run: (store, { name, value }) => {
          if (!TEXT_FIELDS.includes(name)) throw new Error(`form.setField: unknown field "${name}". Text fields: ${TEXT_FIELDS.join(', ')}`);
          store.set(name, value);
        },
      },
      toggleField: {
        args: { name: 'string', checked: 'boolean' },
        run: (store, { name, checked }) => {
          if (!BOOLEAN_FIELDS.includes(name)) throw new Error(`form.toggleField: unknown field "${name}". Checkbox fields: ${BOOLEAN_FIELDS.join(', ')}`);
          store.set(name, checked);
        },
      },
      toggleAdvanced: { args: {}, run: (store) => store.set('advancedOpen', !store.get('advancedOpen')) },
      // Changing the country empties everything that depended on the old one: the region and its list (the regions namespace).
      setCountry: {
        args: { value: 'string' },
        calls: ['regions.clear'],
        run: (store, { value }, call) => {
          store.set('country', value);
          store.set('region', '');
          call('regions.clear', { loading: Boolean(value) });
        },
      },
      submit: {
        args: {},
        run: (store) => {
          store.set('submitted', true);
          if (Object.keys(store.get('errors')).length === 0) store.set('submitStatus', 'done');
        },
      },
      // Back to an empty form; the fetched country list stays.
      reset: {
        args: {},
        calls: ['regions.clear'],
        run: (store, args, call) => {
          for (const name of VALUE_FIELDS) store.set(name, DEFAULT_VALUES[name]);
          store.set('submitted', false);
          store.set('submitStatus', 'editing');
          call('regions.clear', { loading: false });
        },
      },
    },
  },
  countries: {
    state: {
      list: [],
      status: 'idle', // 'idle' | 'loading' | 'ready' | 'failed'
      error: '',
      reloadCount: 0,
    },
    derive: { busy: (get) => get('status') === 'loading' || get('status') === 'idle' },
    actions: {
      loading: { args: {}, run: (store) => { store.set('status', 'loading'); store.set('error', ''); } },
      loaded: { args: { data: 'json' }, run: (store, { data }) => { store.set('list', data); store.set('status', 'ready'); } },
      failed: { args: { message: 'string' }, run: (store, { message }) => { store.set('status', 'failed'); store.set('error', message); } },
      reload: { args: {}, run: (store) => store.set('reloadCount', store.get('reloadCount') + 1) },
    },
    resources: [{ watch: ['reloadCount'], request: () => ({ url: '/countries.json' }), onStart: 'loading', onSuccess: 'loaded', onError: 'failed' }],
  },
  regions: {
    state: {
      list: [],
      status: 'idle', // 'idle' (no country) | 'loading' | 'ready' | 'none' (this country has no list) | 'failed'
    },
    derive: { busy: (get) => get('status') === 'loading' },
    actions: {
      // Called by form.setCountry and form.reset: forget the old list; "loading" is already shown while the new one is on its way.
      clear: {
        args: { loading: 'boolean' },
        run: (store, { loading }) => {
          store.set('list', []);
          store.set('status', loading ? 'loading' : 'idle');
        },
      },
      started: { args: {}, run: (store) => store.set('status', 'loading') },
      loaded: {
        args: { data: 'json' },
        run: (store, { data }) => {
          store.set('list', data);
          store.set('status', data.length ? 'ready' : 'none');
        },
      },
      // "HTTP 404" means this country has no list of regions: that is an answer, not a failure.
      failed: {
        args: { message: 'string' },
        run: (store, { message }) => {
          store.set('list', []);
          store.set('status', message === 'HTTP 404' ? 'none' : 'failed');
        },
      },
    },
    resources: [
      {
        // Only the latest request counts: choosing another country while one is loading drops the old answer.
        watch: ['form.country'],
        request: (values) => (values['form.country'] ? { url: `/regions/${values['form.country']}.json` } : null),
        onStart: 'started',
        onSuccess: 'loaded',
        onError: 'failed',
      },
    ],
  },
};

// The same function runs in the browser and in the tests. `fetchFunction` is the real fetch in the browser.
// The server renders the page once the country list has loaded (or failed), so the HTML already has the select filled in.
export const page = { head: { title: 'Registration' }, namespaces, plugins: [withResources], ready: (state) => state.countries.status === 'ready' || state.countries.status === 'failed' };
