// The registration form's spec (the content of the page at "/"). Only the server and the build import it: the browser
// downloads the page behavior and the finished spec, never the builders that assemble the view.
import { act, button, div, each, equals, event, fieldset, form, greaterThan, h1, h2, input, item, label, legend, main, option, p, pre, section, select, state, when } from '@ehtb/agent-ui/spec';

const errorFor = (name) => when(state(`form.shownErrors.${name}`), p({ id: `error-${name}`, role: 'alert', class: 'field-error' }, state(`form.shownErrors.${name}`)));

// A labelled text input bound to a text field.
const textField = (name, labelText, extra = {}) =>
  label(
    { id: `field-${name}` },
    labelText,
    input({
      id: name,
      type: 'text',
      name,
      'aria-label': typeof labelText === 'string' ? labelText : name,
      value: state(`form.${name}`),
      ...extra,
      on: { input: act('form.setField', { name, value: event('target.value') }) },
    }),
    errorFor(name),
  );

const checkbox = (name, labelText) =>
  label(
    { id: `field-${name}` },
    input({ id: name, type: 'checkbox', name, 'aria-label': labelText, checked: state(`form.${name}`), on: { change: act('form.toggleField', { name, checked: event('target.checked') }) } }),
    ` ${labelText}`,
  );

const selectField = (name, labelText, options) =>
  label(
    { id: `field-${name}` },
    labelText,
    select({ id: name, name, 'aria-label': labelText, value: state(`form.${name}`), on: { change: act('form.setField', { name, value: event('target.value') }) } }, options),
    errorFor(name),
  );

const accountSection = fieldset(
  { id: 'account' },
  legend(null, 'Account'),
  selectField('accountType', 'Account type', [option({ value: 'personal' }, 'Personal'), option({ value: 'business' }, 'Business')]),
  // Shown only for a business account.
  when(
    state('form.shown.business'),
    div(
      { id: 'business-fields' },
      textField('companyName', 'Company name'),
      textField('vatNumber', 'VAT number'),
      p({ id: 'vat-hint', class: 'hint' }, when(state('form.shown.vatRequired'), 'Required for companies in the EU.', 'Optional outside the EU.')),
    ),
  ),
);

const aboutSection = fieldset(
  { id: 'about' },
  legend(null, 'About you'),
  textField('fullName', 'Full name', { autocomplete: 'name' }),
  textField('email', 'Email', { type: 'email', autocomplete: 'email' }),
  label(
    { id: 'field-password' },
    'Password',
    input({ id: 'password', type: state('form.passwordType'), name: 'password', 'aria-label': 'Password', autocomplete: 'new-password', value: state('form.password'), on: { input: act('form.setField', { name: 'password', value: event('target.value') }) } }),
    errorFor('password'),
  ),
  checkbox('showPassword', 'Show password'),
  p({ id: 'password-strength', class: 'hint', role: 'status' }, state('form.passwordStrengthText')),
  label(
    { id: 'field-passwordConfirm' },
    'Repeat the password',
    input({ id: 'passwordConfirm', type: state('form.passwordType'), name: 'passwordConfirm', 'aria-label': 'Repeat the password', autocomplete: 'new-password', value: state('form.passwordConfirm'), on: { input: act('form.setField', { name: 'passwordConfirm', value: event('target.value') }) } }),
    errorFor('passwordConfirm'),
  ),
);

const regionOptions = [option({ value: '' }, 'Choose a region'), each('regions.list', 'code', option({ value: item('code') }, item('name')))];

const addressSection = fieldset(
  { id: 'address' },
  legend(null, 'Address'),
  // The country list is fetched: the select says so while it loads, and a failure offers to try again.
  when(equals(state('countries.status'), 'failed'), [
    p({ id: 'countries-error', role: 'alert', class: 'field-error' }, 'Could not load the countries: ', state('countries.error')),
    button({ id: 'countries-retry', type: 'button', on: { click: act('countries.reload') } }, 'Try again'),
  ]),
  label(
    { id: 'field-country' },
    'Country',
    select(
      { id: 'country', name: 'country', 'aria-label': 'Country', value: state('form.country'), disabled: state('countries.busy'), on: { change: act('form.setCountry', { value: event('target.value') }) } },
      option({ value: '' }, when(state('countries.busy'), 'Loading countries…', 'Choose a country')),
      each('countries.list', 'code', option({ value: item('code') }, item('name'))),
    ),
    errorFor('country'),
  ),
  // The region list depends on the country: loading, a list, or nothing at all for a country without one.
  when(state('regions.busy'), p({ id: 'regions-loading', class: 'hint', role: 'status' }, 'Loading regions…')),
  when(equals(state('regions.status'), 'failed'), p({ id: 'regions-error', role: 'alert', class: 'field-error' }, 'Could not load the regions. Choose the country again to retry.')),
  when(
    state('form.shown.region'),
    label(
      { id: 'field-region' },
      'Region',
      select({ id: 'region', name: 'region', 'aria-label': 'Region', value: state('form.region'), on: { change: act('form.setField', { name: 'region', value: event('target.value') }) } }, regionOptions),
      errorFor('region'),
    ),
  ),
  textField('street', 'Street and number', { autocomplete: 'street-address' }),
  textField('city', 'City', { autocomplete: 'address-level2' }),
  textField('postalCode', state('form.postalLabel'), { autocomplete: 'postal-code', 'aria-label': 'Postal code or ZIP code' }),
);

const shippingSection = fieldset(
  { id: 'shipping' },
  legend(null, 'Shipping'),
  checkbox('shippingSame', 'Ship to the address above'),
  when(state('form.shown.shipping'), div({ id: 'shipping-fields' }, textField('shippingStreet', 'Shipping street and number'), textField('shippingCity', 'Shipping city'), textField('shippingPostalCode', 'Shipping postal code'))),
);

const preferencesSection = fieldset(
  { id: 'preferences' },
  legend(null, 'Preferences'),
  checkbox('newsletter', 'Send me the newsletter'),
  when(state('form.shown.newsletterFrequency'), selectField('newsletterFrequency', 'How often', [option({ value: 'weekly' }, 'Every week'), option({ value: 'monthly' }, 'Every month')])),
  // A collapsible panel: the button flips `advancedOpen`; the content exists only while it is open.
  button({ id: 'advanced-toggle', type: 'button', 'aria-expanded': state('form.advancedOpen'), 'aria-controls': 'advanced-panel', on: { click: act('form.toggleAdvanced') } }, state('form.advancedLabel')),
  when(
    state('form.advancedOpen'),
    div(
      { id: 'advanced-panel' },
      checkbox('phoneContact', 'You may call me'),
      when(state('form.shown.phone'), textField('phone', 'Phone number', { type: 'tel', autocomplete: 'tel' })),
    ),
  ),
);

const registrationForm = form(
  { id: 'registration-form', novalidate: true, on: { submit: act('form.submit') } },
  accountSection,
  aboutSection,
  addressSection,
  shippingSection,
  preferencesSection,
  when(greaterThan(state('form.errorCount'), 0), p({ id: 'error-summary', role: 'alert', class: 'field-error' }, state('form.errorSummary'))),
  button({ id: 'submit', type: 'submit' }, 'Create account'),
);

const confirmation = section(
  { id: 'confirmation' },
  h2({ id: 'confirmation-title' }, 'Account created'),
  p(null, 'This is what would be sent. Fields that were hidden are not in it.'),
  pre({ id: 'payload' }, state('form.payloadText')),
  button({ id: 'start-over', on: { click: act('form.reset') } }, 'Start over'),
);

export const view = main(
  { id: 'registration-app' },
  h1({ id: 'title' }, 'Create an account'),
  when(equals(state('form.submitStatus'), 'done'), confirmation, registrationForm),
);
