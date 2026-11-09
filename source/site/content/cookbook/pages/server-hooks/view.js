import { button, form, h1, input, label, main, p, state } from '@ehtb/agent-ui/spec';

export const view = main(
  { id: 'server-hooks-page' },
  h1(null, 'Server hooks'),
  p({ id: 'who' }, 'Signed in as ', state('session.user'), '.'),
  form(
    { id: 'login-form', method: 'post', action: '/server-hooks/login' },
    label({ for: 'user-field' }, 'User'),
    input({ id: 'user', domId: 'user-field', type: 'text', name: 'user', 'aria-label': 'User' }),
    button({ id: 'login', type: 'submit' }, 'Sign in'),
  ),
);
