// The rules as plain functions: what is shown decides what is checked and what is sent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPayload, passwordStrength, validateRegistration, visibility } from './pages/rules.js';

const complete = {
  accountType: 'personal', companyName: '', vatNumber: '', fullName: 'Ada Lovelace', email: 'ada@example.com',
  password: 'analytical1', passwordConfirm: 'analytical1', showPassword: false, country: 'NL', region: 'utrecht',
  street: 'Kade 1', city: 'Utrecht', postalCode: '3511 AA', shippingSame: true, shippingStreet: '', shippingCity: '',
  shippingPostalCode: '', newsletter: false, newsletterFrequency: 'weekly', advancedOpen: false, phoneContact: false, phone: '',
};
const context = { regionsStatus: 'ready', countryIsEu: true };

test('a complete personal registration has no errors', () => {
  assert.deepEqual(validateRegistration(complete, context), {});
});

test('hidden fields are not checked: company, shipping, region, phone', () => {
  const hidden = { ...complete, companyName: '', vatNumber: 'nonsense', shippingStreet: '', phone: '12', region: '' };
  assert.deepEqual(validateRegistration(hidden, { regionsStatus: 'none', countryIsEu: true }), {});
});

test('a business in the EU needs a VAT number; outside the EU it is optional but checked when given', () => {
  const business = { ...complete, accountType: 'business', companyName: 'Analytical Engines' };
  assert.equal(validateRegistration(business, context).vatNumber, 'A VAT number is required for companies in the EU.');
  assert.equal(validateRegistration(business, { ...context, countryIsEu: false }).vatNumber, undefined);
  assert.match(validateRegistration({ ...business, vatNumber: 'abc' }, { ...context, countryIsEu: false }).vatNumber, /country code and digits/);
  assert.equal(validateRegistration({ ...business, vatNumber: 'nl 123456789 b01' }, context).vatNumber, undefined);
  assert.equal(validateRegistration({ ...business, companyName: ' ' }, context).companyName, 'Enter the company name.');
});

test('the shipping address, the region and the phone number are required exactly when shown', () => {
  assert.deepEqual(Object.keys(validateRegistration({ ...complete, shippingSame: false }, context)).sort(), ['shippingCity', 'shippingPostalCode', 'shippingStreet']);
  assert.deepEqual(Object.keys(validateRegistration({ ...complete, region: '' }, context)), ['region']);
  assert.deepEqual(Object.keys(validateRegistration({ ...complete, advancedOpen: true, phoneContact: true, phone: '12' }, context)), ['phone']);
  assert.deepEqual(validateRegistration({ ...complete, advancedOpen: false, phoneContact: true, phone: '' }, context), {}); // panel collapsed: the phone field is not on screen
});

test('password rules and strength', () => {
  assert.equal(validateRegistration({ ...complete, password: 'short', passwordConfirm: 'short' }, context).password, 'Use at least 8 characters.');
  assert.equal(validateRegistration({ ...complete, password: 'onlyletters', passwordConfirm: 'onlyletters' }, context).password, 'Use letters and at least one digit.');
  assert.equal(validateRegistration({ ...complete, passwordConfirm: 'different1' }, context).passwordConfirm, 'The passwords do not match.');
  assert.deepEqual(['abc', 'abcdefgh', 'abcdefg1', 'Abcdefghij1!'].map(passwordStrength), ['too short', 'weak', 'fair', 'strong']);
});

test('visibility is one definition', () => {
  assert.deepEqual(visibility(complete, context), { business: false, vatRequired: false, region: true, shipping: false, newsletterFrequency: false, phone: false });
});

test('the payload holds only what is shown and never the password', () => {
  const personal = buildPayload(complete, context);
  assert.deepEqual(Object.keys(personal), ['accountType', 'fullName', 'email', 'country', 'region', 'address', 'shippingAddress', 'newsletter']);
  assert.equal(personal.shippingAddress, 'same as address');
  assert.equal(personal.newsletter, false);
  const full = buildPayload({ ...complete, accountType: 'business', companyName: ' Analytical ', vatNumber: 'nl 123456789 b01', shippingSame: false, shippingStreet: 'Dock 2', shippingCity: 'Delft', shippingPostalCode: '2611', newsletter: true, newsletterFrequency: 'monthly', advancedOpen: true, phoneContact: true, phone: '+31 6 12345678' }, context);
  assert.equal(full.companyName, 'Analytical');
  assert.equal(full.vatNumber, 'NL123456789B01');
  assert.deepEqual(full.shippingAddress, { street: 'Dock 2', city: 'Delft', postalCode: '2611' });
  assert.equal(full.newsletter, 'monthly');
  assert.equal(full.phone, '+31 6 12345678');
  assert.equal(JSON.stringify(full).includes('analytical1'), false);
});
