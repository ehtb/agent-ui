// The form's rules as plain functions: no state, no DOM. app.js calls them from derived values, and the tests call them
// directly. A rule applies only to a field that is on screen: a hidden field is neither checked nor sent.

export const TEXT_FIELDS = [
  'accountType', 'companyName', 'vatNumber', 'fullName', 'email', 'password', 'passwordConfirm',
  'street', 'city', 'postalCode', 'shippingStreet', 'shippingCity', 'shippingPostalCode',
  'region', 'newsletterFrequency', 'phone',
];
export const BOOLEAN_FIELDS = ['showPassword', 'shippingSame', 'newsletter', 'phoneContact', 'advancedOpen'];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VAT = /^[A-Z]{2}[A-Z0-9]{8,12}$/;

// The panels of the form that are on screen for these values. One definition, used by the view, the rules and the payload.
export const visibility = (values, { regionsStatus, countryIsEu }) => ({
  business: values.accountType === 'business',
  vatRequired: values.accountType === 'business' && countryIsEu,
  region: regionsStatus === 'ready',
  shipping: !values.shippingSame,
  newsletterFrequency: values.newsletter,
  phone: values.advancedOpen && values.phoneContact,
});

export const passwordStrength = (password) => {
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;
  if (password.length < 8) return 'too short';
  if (password.length >= 12 && classes >= 3) return 'strong';
  return classes >= 2 ? 'fair' : 'weak';
};

// Returns { field: message } for every field that is shown and wrong.
export const validateRegistration = (values, context) => {
  const shown = visibility(values, context);
  const errors = {};
  if (values.fullName.trim().length < 2) errors.fullName = 'Enter your full name.';
  if (!EMAIL.test(values.email.trim())) errors.email = 'Enter an email address like name@example.com.';
  if (values.password.length < 8) errors.password = 'Use at least 8 characters.';
  else if (!/[A-Za-z]/.test(values.password) || !/[0-9]/.test(values.password)) errors.password = 'Use letters and at least one digit.';
  if (values.passwordConfirm !== values.password) errors.passwordConfirm = 'The passwords do not match.';
  if (shown.business && !values.companyName.trim()) errors.companyName = 'Enter the company name.';
  if (shown.business) {
    const vat = values.vatNumber.replace(/\s/g, '').toUpperCase();
    if (!vat && shown.vatRequired) errors.vatNumber = 'A VAT number is required for companies in the EU.';
    else if (vat && !VAT.test(vat)) errors.vatNumber = 'Use a country code and digits, for example NL123456789B01.';
  }
  if (!values.country) errors.country = 'Choose a country.';
  if (shown.region && !values.region) errors.region = 'Choose a region.';
  if (!values.street.trim()) errors.street = 'Enter the street and number.';
  if (!values.city.trim()) errors.city = 'Enter the city.';
  if (!values.postalCode.trim()) errors.postalCode = 'Enter the postal code.';
  if (shown.shipping) {
    if (!values.shippingStreet.trim()) errors.shippingStreet = 'Enter the shipping street and number.';
    if (!values.shippingCity.trim()) errors.shippingCity = 'Enter the shipping city.';
    if (!values.shippingPostalCode.trim()) errors.shippingPostalCode = 'Enter the shipping postal code.';
  }
  if (shown.phone && values.phone.replace(/\D/g, '').length < 7) errors.phone = 'Enter a phone number with at least 7 digits.';
  return errors;
};

// What would be sent: only fields that are on screen, never the password confirmation.
export const buildPayload = (values, context) => {
  const shown = visibility(values, context);
  return {
    accountType: values.accountType,
    ...(shown.business && { companyName: values.companyName.trim(), vatNumber: values.vatNumber.replace(/\s/g, '').toUpperCase() }),
    fullName: values.fullName.trim(),
    email: values.email.trim(),
    country: values.country,
    ...(shown.region && { region: values.region }),
    address: { street: values.street.trim(), city: values.city.trim(), postalCode: values.postalCode.trim() },
    shippingAddress: shown.shipping
      ? { street: values.shippingStreet.trim(), city: values.shippingCity.trim(), postalCode: values.shippingPostalCode.trim() }
      : 'same as address',
    newsletter: values.newsletter ? values.newsletterFrequency : false,
    ...(shown.phone && { phone: values.phone.trim() }),
  };
};
