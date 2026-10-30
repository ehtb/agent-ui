// The content of the page at "/" (the file next to page.js): a price calculator styled with Tailwind CSS. The spec is
// plain agent-ui; styling is class names in `props.class` and `classes`. Tailwind reads this file for those names and
// generates pages/page.css (`npm run css`); agent-ui then bundles that file like any other stylesheet. classes.test.mjs
// checks that every class used below exists in the generated CSS, so a misspelled utility fails a test instead of
// silently doing nothing. Only the server and the build import it.
import { main, h1, div, p, span, button, act, equals, not, state } from '@ehtb/agent-ui/spec';

// One pill of the billing switch. Static utilities are in `class`; the two looks (selected and not) are toggled with
// `classes`, one utility per key (a key is one class name).
const billingButton = (value, text) => {
  const selected = equals(state('billing.period'), value);
  return button(
    {
      id: `billing-${value}`,
      type: 'button',
      class: 'rounded-full px-4 py-1 text-sm font-medium transition-colors',
      'aria-pressed': selected,
      classes: { 'bg-sky-600': selected, 'text-white': selected, 'bg-slate-100': not(selected), 'text-slate-700': not(selected) },
      on: { click: act('billing.set', { value }) },
    },
    text,
  );
};

const stepButton = (id, label, by, text) =>
  button(
    { id, type: 'button', 'aria-label': label, class: 'h-8 w-8 rounded-full bg-slate-100 text-lg text-slate-700 hover:bg-slate-200', on: { click: act('seats.add', { by }) } },
    text,
  );

export const view = main(
  { id: 'calculator', class: 'mx-auto mt-16 max-w-md rounded-2xl bg-white p-8 shadow-lg' },
  h1({ id: 'title', class: 'text-2xl font-semibold text-slate-900' }, 'Team plan'),
  div({ id: 'billing', class: 'mt-6 flex gap-2' }, billingButton('monthly', 'Monthly'), billingButton('yearly', 'Yearly')),
  div(
    { id: 'seats', class: 'mt-6 flex items-center justify-between' },
    span({ id: 'seat-label', class: 'text-slate-600', role: 'status' }, state('seats.label')),
    div({ class: 'flex items-center gap-3' }, stepButton('seats-less', 'Fewer seats', -1, '-'), stepButton('seats-more', 'More seats', 1, '+')),
  ),
  p({ id: 'total', class: 'mt-8 text-3xl font-bold text-sky-700' }, state('billing.totalLabel')),
);
