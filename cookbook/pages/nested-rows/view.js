import { act, button, each, h2, item, join, li, main, row, section, span, ul } from '@ehtb/agent-ui/spec';

const lineRow = li(
  { id: 'line' },
  span({ id: 'line-label' }, join(row('order.customer'), ': ', item('sku'))),
  button({ id: 'line-remove', 'aria-label': join('Remove ', item('sku'), ' from order ', row('order.id')), on: { click: act('orders.removeLine', { orderId: row('order.id'), lineId: item('id') }) } }, 'x'),
);

const orderSection = section({ id: 'order' }, h2({ id: 'order-title' }, 'Order ', item('id')), ul({ id: 'lines' }, each(item('lines'), 'id', lineRow)));

export const view = main({ id: 'orders-page' }, each('orders.list', 'id', orderSection, { as: 'order' }));
