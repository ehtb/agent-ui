// Recipe: rows inside rows that read the outer row.
// An order has lines. A line's remove button needs the id of its order, and a line's label shows the customer. In the view the outer
// `each` says `as: 'order'`, and anything inside it, at any depth, reads that row with row('order.id'); item(...) is still the
// innermost row (the line). The data stays as it is: no outer fields copied into every line in `derive`.
const orders = {
  state: {
    list: [
      { id: 1, customer: 'Ada', lines: [{ id: 10, sku: 'pen' }, { id: 11, sku: 'ink' }] },
      { id: 2, customer: 'Bo', lines: [{ id: 20, sku: 'pad' }] },
    ],
  },
  shapes: { list: { fields: { id: 'number', customer: 'string', lines: 'json' } } }, // so row('order.custmer') is caught at mount
  actions: {
    removeLine: {
      args: { orderId: 'number', lineId: 'number' },
      run: (store, { orderId, lineId }) =>
        store.set('list', store.get('list').map((order) => (order.id === orderId ? { ...order, lines: order.lines.filter((line) => line.id !== lineId) } : order))),
    },
  },
};

export const page = { head: { title: 'Orders - cookbook' }, namespaces: { orders } };
