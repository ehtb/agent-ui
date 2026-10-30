// Contact form rules, shared by the browser (before sending) and the server (after sending).
export const CONTACT_FIELDS = ['name', 'email', 'message'];

export const emptyContact = () => ({ name: '', email: '', message: '' });

// {field: message} for every problem; an empty object means valid.
export const validateContact = (values) => {
  const errors = {};
  if (String(values.name ?? '').trim().length < 2) errors.name = 'Enter your name (at least 2 characters).';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(values.email ?? '').trim())) errors.email = 'Enter a valid email address.';
  const length = String(values.message ?? '').trim().length;
  if (length < 10) errors.message = 'Write at least 10 characters.';
  else if (length > 500) errors.message = 'At most 500 characters.';
  return errors;
};

export const normalizeContact = (values) => ({
  name: String(values.name).trim(),
  email: String(values.email).trim().toLowerCase(),
  message: String(values.message).trim(),
});
