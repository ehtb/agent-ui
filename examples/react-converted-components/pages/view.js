// The content of the page at "/" (the file next to page.js): a page built only from the kit in ui/ and the field
// namespaces in features.js — buttons in every variant, badges, alerts (one the visitor can dismiss), and a sign-up card
// with label, input, checkbox and error components. Only the server and the build import it.
import { expandComponents } from '@ehtb/agent-ui/components';
import { main, h1, p, div, form, a, when, not, act, state } from '@ehtb/agent-ui/spec';
import { components, Button, Badge, Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter, Alert, AlertTitle, AlertDescription, Label, Input, Checkbox, FieldError } from '../ui/index.js';

const VARIANTS = ['default', 'secondary', 'outline', 'ghost', 'destructive', 'link'];
const BADGES = ['default', 'secondary', 'outline', 'destructive'];

const row = (...children) => div({ class: 'row' }, ...children);

// The page is written with the kit's functions; expandComponents turns them into plain spec before anything mounts.
export const view = expandComponents(
  main(
    null,
    h1(null, 'Component kit'),
    p(null, 'A shadcn-style library of agent-ui components. Every component below is declared once in ui/ and used by name.'),
    p(null, a({ id: 'to-primitives', href: '/primitives' }, 'See the interactive primitives (popover, combobox, date picker, drag list)')),
    p(null, a({ id: 'to-charts', href: '/charts' }, 'See a chart library (Chart.js) drawn into one element by a plugin')),

    Card(
      null,
      CardHeader(null, CardTitle(null, 'Buttons'), CardDescription(null, 'Variants and sizes are options of one param each.')),
      CardContent(
        null,
        row(VARIANTS.map((variant) => Button({ variant }, variant))),
        row(
          Button({ size: 'sm', variant: 'outline' }, 'Small'),
          Button({ variant: 'outline' }, 'Default'),
          Button({ size: 'lg', variant: 'outline' }, 'Large'),
          Button({ disabled: true, variant: 'outline' }, 'Disabled'),
          Button({ size: 'icon', variant: 'outline', label: 'Add item' }, '+'),
        ),
      ),
    ),

    Card(null, CardHeader(null, CardTitle(null, 'Badges')), CardContent(null, row(BADGES.map((variant) => Badge({ variant }, variant))))),

    Card(
      null,
      CardHeader(null, CardTitle(null, 'Alerts'), CardAction(null, Badge({ variant: 'outline' }, '2'))),
      CardContent(
        null,
        when(
          not(state('welcome.dismissed')),
          Alert(
            { id: 'welcome', action: Button({ id: 'welcome-dismiss', variant: 'ghost', size: 'sm', onClick: act('welcome.dismiss', {}) }, 'Dismiss') },
            AlertTitle(null, 'Welcome'),
            AlertDescription(null, 'You can close this one for good.'),
          ),
        ),
        Alert({ variant: 'destructive' }, AlertTitle(null, 'Something went wrong'), AlertDescription(null, 'This one stays.')),
      ),
    ),

    form(
      { id: 'signup', on: { submit: act('signup.submit', {}) } },
      Card(
        null,
        CardHeader(null, CardTitle(null, 'Create an account'), CardDescription(null, 'Field state comes from the textField and checkField features, mounted as the namespaces email, password and terms.')),
        CardContent(
          null,
          when(state('signup.submitted'), Alert({ id: 'signup-done' }, AlertTitle(null, 'Account created'))),
          Label({ for: 'email' }, 'Email'),
          Input({ id: 'email', domId: 'email', field: 'email', label: 'Email', type: 'email', placeholder: 'you@example.com' }),
          FieldError({ id: 'email-error', field: 'email' }),
          Label({ for: 'password' }, 'Password'),
          Input({ id: 'password', domId: 'password', field: 'password', label: 'Password', type: 'password' }),
          FieldError({ id: 'password-error', field: 'password' }),
          row(Checkbox({ id: 'terms', domId: 'terms', field: 'terms', label: 'Accept the terms' }), Label({ for: 'terms' }, 'Accept the terms')),
          FieldError({ id: 'terms-error', field: 'terms' }),
        ),
        CardFooter(null, Button({ id: 'submit', type: 'submit' }, 'Create account')),
      ),
    ),
  ),
  components,
);
