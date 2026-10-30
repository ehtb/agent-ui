// Sign-up rules, shared by the browser (before sending), the server API and the plain form post (after sending).
// One function for all three: the client and the server can never disagree about what is valid.
export const TICKET_TYPES = ['standard', 'vip'];
export const MAX_TICKETS = 5;
export const FIELDS = ['name', 'email', 'tickets', 'ticketType', 'newsletter', 'notes'];

export const emptySignup = () => ({ name: '', email: '', tickets: '1', ticketType: 'standard', newsletter: false, notes: '' });

// Returns {field: message} for every problem; an empty object means valid. `event` may be null (unknown event).
export const validateSignup = (values, event) => {
  const errors = {};
  if (String(values.name ?? '').trim().length < 2) errors.name = 'Enter your name (at least 2 characters).';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(values.email ?? '').trim())) errors.email = 'Enter a valid email address.';
  const tickets = Number(values.tickets);
  if (!Number.isInteger(tickets) || tickets < 1 || tickets > MAX_TICKETS) errors.tickets = `Choose between 1 and ${MAX_TICKETS} tickets.`;
  else if (event && tickets > event.capacity) errors.tickets = `This event has only ${event.capacity} seats.`;
  if (!TICKET_TYPES.includes(values.ticketType)) errors.ticketType = 'Choose a ticket type.';
  if (String(values.notes ?? '').length > 200) errors.notes = 'Notes can be at most 200 characters.';
  return errors;
};

// The values as they are sent: trimmed, numbers as numbers.
export const normalizeSignup = (values) => ({
  name: String(values.name).trim(),
  email: String(values.email).trim().toLowerCase(),
  tickets: Number(values.tickets),
  ticketType: values.ticketType,
  newsletter: Boolean(values.newsletter),
  notes: String(values.notes ?? '').trim(),
});
