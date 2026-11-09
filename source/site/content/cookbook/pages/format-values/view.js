import { each, h1, item, li, main, p, state, ul } from '@ehtb/agent-ui/spec';

export const view = main(
  { id: 'invoices-page' },
  h1(null, 'Invoices'),
  ul({ id: 'invoices' }, each('invoices.rows', 'id', li({ id: 'invoice' }, item('customer'), ': ', item('amountText'), ', due ', item('dueText')))),
  p({ id: 'total' }, 'Total ', state('invoices.totalText')),
);
