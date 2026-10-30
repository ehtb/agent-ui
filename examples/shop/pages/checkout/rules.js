// The rules of an order, as plain functions: the checkout page validates with them before sending, and the server (api.js)
// validates again with the same function, so the two cannot disagree.
export const ORDER_FIELDS = ['name', 'email', 'address'];
export const emptyOrder = () => ({ name: '', email: '', address: '' });

export const validateOrder = (values) => {
  const errors = {};
  if (!String(values.name ?? '').trim()) errors.name = 'Enter your name.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(values.email ?? '').trim())) errors.email = 'Enter a valid email address.';
  if (!String(values.address ?? '').trim()) errors.address = 'Enter a delivery address.';
  return errors;
};
