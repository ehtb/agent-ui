import { act, button, div, event, form, h1, input, label, length, greaterThan, main, p, state, when } from '@ehtb/agent-ui/spec';

const field = (name, labelText, type, setter) => [
  label({ for: `${name}-field` }, labelText),
  input({ id: name, domId: `${name}-field`, type, 'aria-label': labelText, value: state(`signup.${name}`), on: { input: act(setter, { value: event('target.value') }) } }),
  when(greaterThan(length(state(`signup.shown${name[0].toUpperCase()}${name.slice(1)}Error`)), 0), p({ id: `${name}-error`, role: 'alert' }, state(`signup.shown${name[0].toUpperCase()}${name.slice(1)}Error`))),
];

export const view = main(
  { id: 'signup-page' },
  h1(null, 'Sign up'),
  when(
    state('signup.done'),
    p({ id: 'welcome', role: 'status' }, 'Welcome aboard.'),
    form(
      { id: 'signup-form', on: { submit: act('signup.submit') } },
      div(null, ...field('email', 'Email', 'email', 'signup.setEmail')),
      div(null, ...field('password', 'Password', 'password', 'signup.setPassword')),
      button({ id: 'submit', type: 'submit' }, 'Create account'),
    ),
  ),
);
