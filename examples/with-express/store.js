// The guestbook's data and rules. They belong to the server: Express answers /api/entries from here, and the
// server-rendered page reads the same store in process (see server.js).
export const validateEntry = (values) => {
  const errors = {};
  if (String(values.name ?? '').trim().length < 2) errors.name = 'Enter your name (at least 2 characters).';
  const message = String(values.message ?? '').trim();
  if (!message || message.length > 200) errors.message = 'Write a message of up to 200 characters.';
  return errors;
};

export const createStore = () => {
  const entries = [{ id: 1, name: 'Ada', message: 'First!' }];
  return {
    list: () => entries,
    add: (values) => {
      const entry = { id: entries.length + 1, name: String(values.name).trim(), message: String(values.message).trim() };
      entries.push(entry);
      return entry;
    },
  };
};
