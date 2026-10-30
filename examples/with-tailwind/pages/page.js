// The price calculator's behavior: two namespaces, `billing` (the period and the price it gives) and `seats` (how many).
// The price reads the seats. The spec — and the Tailwind classes it uses — is view.js next to this file.

const PRICES = { monthly: 12, yearly: 120 }; // per seat

export const namespaces = {
  billing: {
    state: { period: 'monthly' },
    derive: {
      total: (get) => PRICES[get('period')] * get('seats.count'),
      totalLabel: (get) => `$${get('total')} per ${get('period') === 'monthly' ? 'month' : 'year'}`,
    },
    actions: { set: { args: { value: 'string' }, run: (store, { value }) => store.set('period', value in PRICES ? value : 'monthly') } },
  },
  seats: {
    state: { count: 3 },
    derive: { label: (get) => `${get('count')} ${get('count') === 1 ? 'seat' : 'seats'}` },
    actions: { add: { args: { by: 'number' }, run: (store, { by }) => store.set('count', Math.min(50, Math.max(1, store.get('count') + by))) } },
  },
};

export const page = { head: { title: 'Price calculator' }, namespaces };
