// Recipe: numbers, dates and money shown the way the reader writes them.
// The grammar has no formatting operators, and will not get any: what is shown is computed in `derive`, where `Intl` gives the right
// answer for every locale. The list of display rows is derived from the list of facts (the facts stay numbers and ISO dates), and the
// work for one item is wrapped in memoizeItem, so changing one invoice formats one invoice and every other row keeps its reference.
// memoizeItem caches by the item alone, so the formatters it uses must not depend on anything else: the locale here is a constant.
// A formatter that follows the visitor's choice (a currency switch) is a derive over both inputs, without memoizeItem.
import { memoizeItem } from '@ehtb/agent-ui/memoize';

const LOCALE = 'en-GB';
const money = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'EUR' });
const day = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeZone: 'UTC' });

const describeInvoice = memoizeItem((invoice) => ({
  id: invoice.id,
  customer: invoice.customer,
  amountText: money.format(invoice.cents / 100),
  dueText: day.format(new Date(`${invoice.due}T00:00:00Z`)),
}));

const invoices = {
  state: {
    items: [
      { id: 1, customer: 'Ada', cents: 123456, due: '2026-03-12' },
      { id: 2, customer: 'Bo', cents: 9900, due: '2026-04-01' },
    ],
  },
  derive: {
    rows: (get) => get('items').map(describeInvoice),
    totalText: (get) => money.format(get('items').reduce((sum, invoice) => sum + invoice.cents, 0) / 100),
  },
  actions: {
    setAmount: {
      args: { id: 'number', cents: 'number' },
      run: (store, { id, cents }) => store.set('items', store.get('items').map((invoice) => (invoice.id === id ? { ...invoice, cents } : invoice))),
    },
  },
};

export const page = { head: { title: 'Invoices - cookbook' }, namespaces: { invoices } };
