// Recipe: a list reordered by dragging a row, or from the keyboard.
// There is no drag-and-drop API here (no dragstart, drop or dataTransfer): the gesture is the bubbling pointer events the grammar has,
// and every step is a logged action, so a drag replays like anything else. Pressing a grip picks the row up (`press`), moving over another
// row puts the picked-up one in its place (`over`), releasing ends the drag (`release`). The pointer's coordinates are not state:
// `follow` (see view.js) makes the runtime keep the picked-up row under the pointer. A touch pointer is captured by the grip, so
// `over` never fires for it: the keyboard (Enter picks up and puts down, the arrow keys `move`, Escape `cancel`s) is the touch path and
// the accessible path, and a list that has no keyboard path is not finished.
const movedItem = (items, from, to) => {
  const next = items.slice();
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
};
const indexOfId = (items, id) => items.findIndex((task) => task.id === id);

// Picking up, putting down and cancelling all end the drag the same way.
const endDrag = (store) => {
  store.set('draggingId', null);
  store.set('startIndex', -1);
};

// Moves the picked-up row to the place of row `id` (nothing happens when it is already there or nothing is picked up).
const moveDraggedTo = (store, id) => {
  const items = store.get('items');
  const from = indexOfId(items, store.get('draggingId'));
  const to = indexOfId(items, id);
  if (from >= 0 && to >= 0 && from !== to) store.set('items', movedItem(items, from, to));
};

const tasks = {
  // startIndex is where the picked-up row began, so Escape can put it back.
  state: {
    items: [
      { id: 1, title: 'Draft the outline' },
      { id: 2, title: 'Write the tests' },
      { id: 3, title: 'Ship it' },
    ],
    draggingId: null,
    startIndex: -1,
  },
  derive: {
    hint: (get) => (get('draggingId') === null ? 'Drag a grip over the other rows, or focus a grip and press Enter, then use the up and down arrows. Escape puts it back.' : 'Moving. Drag over a row, or use the arrows and Enter. Escape puts it back where it started.'),
  },
  actions: {
    // Pointer down on a grip, or Enter on it, in one action, so a grip is always a meaningful target: with nothing picked up this row is
    // picked up; on the picked-up row it is put down; on any other row the picked-up row moves there and is put down.
    press: {
      args: { id: 'number' },
      run: (store, { id }) => {
        if (store.get('draggingId') === null) {
          store.set('draggingId', id);
          store.set('startIndex', indexOfId(store.get('items'), id));
          return;
        }
        moveDraggedTo(store, id);
        endDrag(store);
      },
    },
    // The pointer crosses a row while dragging: the picked-up row takes that row's place right away.
    over: { args: { id: 'number' }, run: (store, { id }) => moveDraggedTo(store, id) },
    // The pointer is released: the drag ends where the row is. Decided by the release, not by where the row ended up (a row dragged out
    // and back to its first place is still dropped). It is idempotent: with nothing picked up it does nothing.
    release: {
      args: {},
      run: (store) => {
        if (store.get('draggingId') !== null) endDrag(store);
      },
    },
    // Escape, or a cancelled pointer (the browser took it, for example a touch scroll): put the row back where it started.
    cancel: {
      args: {},
      run: (store) => {
        const items = store.get('items');
        const from = indexOfId(items, store.get('draggingId'));
        const to = store.get('startIndex');
        if (from >= 0 && to >= 0 && from !== to) store.set('items', movedItem(items, from, to));
        endDrag(store);
      },
    },
    // The arrow keys move the picked-up row by one place.
    move: {
      args: { delta: 'number' },
      run: (store, { delta }) => {
        const items = store.get('items');
        const from = indexOfId(items, store.get('draggingId'));
        const to = from + delta;
        if (from >= 0 && to >= 0 && to < items.length) store.set('items', movedItem(items, from, to));
      },
    },
  },
};

export const page = { head: { title: 'Reorder - cookbook' }, namespaces: { tasks } };
