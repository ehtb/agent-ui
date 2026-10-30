// The interactive primitives React gets from a library (Radix Popover, cmdk's Command, react-day-picker,
// dnd-kit) and keeps in local state. agent-ui has neither the library nor local state, so each primitive is a
// namespace: the state it used to keep in `useState`/`useRef` becomes state keys, the render-time values become
// `derive`, and every interaction (open, move, select, pick up, trap) is a named, typed action. A component in
// ui/ binds to the namespace by its mount name, exactly as `input` binds to a field name.
//
//   React primitive                     agent-ui
//   useState(false) in a Popover        popover.open + popover.toggle / open / close
//   useRef to trap focus                popover.focusIndex + a `focus` binding per item, driven by keydown.Tab
//   cmdk's internal activeIndex         combobox.activeIndex / activeValue + combobox.move / selectActive
//   react-day-picker's month + focus    date.viewYear / viewMonth / focus + date.prev / next / focusMove
//   dnd-kit's dragging item             sortable.draggingId / startIndex + press / over / release / move / cancel
//
// These are reusable the way textField is (features.js): a function of its options that returns a namespace,
// mounted under a name. The component takes that name as a `name` param and builds every binding from it.

// The month names the calendar renders. Kept as a constant so a derived value stays pure and knows no clock.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (number) => String(number).padStart(2, '0');
const isoOf = (year, month, day) => `${year}-${pad(month + 1)}-${pad(day)}`;
const fromIso = (iso) => {
  const [year, month, day] = iso.split('-').map(Number);
  return { year, month: month - 1, day };
};

// ------------------------------------------------------------------------------------------------ popover
// Open state plus a focus trap. A component cannot hold its own focus, and nothing may read the DOM to find it,
// so the focused item is state: keydown.Tab and keydown.Shift+Tab change `focusIndex`, and each item in the
// popover carries `focus: { equals: [state('name.focusIndex'), index] }`. The focused item follows the index.
export const popover = ({ choices = [] } = {}) => ({
  state: {
    choices: choices.map((value, index) => ({ index, value })),
    open: false,
    focusIndex: 0,
    value: '',
  },
  derive: {
    // What the trigger shows: the chosen value, or the prompt.
    label: (get) => get('value') || 'Choose\u2026',
  },
  actions: {
    open: {
      args: {},
      run: (store) => {
        store.set('focusIndex', 0);
        store.set('open', true);
      },
    },
    close: { args: {}, run: (store) => store.set('open', false) },
    toggle: {
      args: {},
      run: (store) => {
        const open = !store.get('open');
        if (open) store.set('focusIndex', 0);
        store.set('open', open);
      },
    },
    // The trap: wrap around the items, so Tab never leaves the popover.
    next: {
      args: {},
      run: (store) => {
        const count = store.get('choices').length || 1;
        store.set('focusIndex', (store.get('focusIndex') + 1) % count);
      },
    },
    prev: {
      args: {},
      run: (store) => {
        const count = store.get('choices').length || 1;
        store.set('focusIndex', (store.get('focusIndex') + count - 1) % count);
      },
    },
    choose: {
      args: { value: 'string' },
      run: (store, { value }) => {
        store.set('value', value);
        store.set('open', false);
      },
    },
  },
});

// ------------------------------------------------------------------------------------------------ combobox
// A text input with a filtered listbox, the active option tracked by index (aria-activedescendant). Typing and
// arrow keys are actions, not event handlers with logic; the list itself is a derived value over the options.
// `chooseValue` is the write both choosing an option and choosing the active one go through; two actions of one
// namespace share a plain function (`calls` is only for another namespace).
export const combobox = ({ options = [], initial = '' } = {}) => {
  const chooseValue = (store, value) => {
    const option = store.get('options').find((one) => one.value === value);
    if (!option) return;
    store.set('selected', option.value);
    store.set('query', option.label);
    store.set('activeIndex', 0);
    store.set('open', false);
  };
  return {
    state: { options, query: '', open: false, activeIndex: 0, selected: initial },
    derive: {
      // The options the query keeps. While the query is the chosen label (or empty), every option is shown, so
      // reopening the list does not look like it filtered itself down to one row.
      matches: (get) => {
        const all = get('options');
        const query = get('query').trim().toLowerCase();
        const chosen = all.find((option) => option.value === get('selected'));
        if (query === '' || (chosen && query === chosen.label.toLowerCase())) return all;
        return all.filter((option) => option.label.toLowerCase().includes(query));
      },
      // The option the highlight sits on, clamped so a shorter list keeps a valid index.
      activeValue: (get) => {
        const matches = get('matches');
        if (!matches.length) return '';
        return matches[Math.min(Math.max(get('activeIndex'), 0), matches.length - 1)].value;
      },
      isEmpty: (get) => get('matches').length === 0,
      selectedLabel: (get) => get('options').find((option) => option.value === get('selected'))?.label ?? '',
    },
    actions: {
      setQuery: {
        args: { value: 'string' },
        run: (store, { value }) => {
          store.set('query', value);
          store.set('open', true);
          store.set('activeIndex', 0);
        },
      },
      open: {
        args: {},
        run: (store) => {
          store.set('activeIndex', 0);
          store.set('open', true);
        },
      },
      close: { args: {}, run: (store) => store.set('open', false) },
      move: {
        args: { delta: 'number' },
        run: (store, { delta }) => {
          const count = store.get('matches').length;
          if (!count) return;
          store.set('activeIndex', (store.get('activeIndex') + delta + count) % count);
        },
      },
      choose: { args: { value: 'string' }, run: (store, { value }) => chooseValue(store, value) },
      selectActive: {
        args: {},
        run: (store) => {
          const matches = store.get('matches');
          if (!matches.length) {
            store.set('open', false);
            return;
          }
          const index = Math.min(Math.max(store.get('activeIndex'), 0), matches.length - 1);
          chooseValue(store, matches[index].value);
        },
      },
      clear: {
        args: {},
        run: (store) => {
          store.set('query', '');
          store.set('selected', '');
          store.set('open', false);
        },
      },
    },
  };
};

// ------------------------------------------------------------------------------------------------ date picker
// A month grid with the keyboard behaviour of a real date picker: the day that has focus is state (`focus`), the
// displayed month is state, and the arrow keys move the focus, changing the month when it crosses the edge.
export const datePicker = ({ initial = '', month = [2026, 0] } = {}) => {
  // Opening shows the selected month, or keeps the month already on screen. Shared by open and toggle.
  const showSelected = (store) => {
    const selected = store.get('selected');
    if (selected) {
      const { year, month: monthIndex } = fromIso(selected);
      store.set('viewYear', year);
      store.set('viewMonth', monthIndex);
      store.set('focus', selected);
    } else if (!store.get('focus')) {
      store.set('focus', isoOf(store.get('viewYear'), store.get('viewMonth'), 1));
    }
    store.set('open', true);
  };
  return {
    state: { viewYear: month[0], viewMonth: month[1], selected: initial, focus: initial, open: false },
    derive: {
      monthLabel: (get) => `${MONTHS[get('viewMonth')]} ${get('viewYear')}`,
      selectedLabel: (get) => {
        const iso = get('selected');
        if (!iso) return 'Pick a date';
        const { year, month: monthIndex, day } = fromIso(iso);
        return `${day} ${MONTHS[monthIndex]} ${year}`;
      },
      // Six weeks of cells, starting on the Sunday on or before the first of the month. Each cell carries
      // everything its row needs (a nested `each` reads only the innermost item).
      weeks: (get) => {
        const year = get('viewYear');
        const monthIndex = get('viewMonth');
        const start = Date.UTC(year, monthIndex, 1 - new Date(Date.UTC(year, monthIndex, 1)).getUTCDay());
        const weeks = [];
        for (let week = 0; week < 6; week++) {
          const days = [];
          for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
            const date = new Date(start + (week * 7 + dayOfWeek) * 86400000);
            const cellYear = date.getUTCFullYear();
            const cellMonth = date.getUTCMonth();
            const day = date.getUTCDate();
            days.push({ iso: isoOf(cellYear, cellMonth, day), day, inMonth: cellMonth === monthIndex && cellYear === year, label: `${day} ${MONTHS[cellMonth]} ${cellYear}` });
          }
          weeks.push({ key: days[0].iso, days });
        }
        return weeks;
      },
    },
    actions: {
      prev: {
        args: {},
        run: (store) => {
          const monthIndex = store.get('viewMonth') - 1;
          store.set('viewMonth', monthIndex < 0 ? 11 : monthIndex);
          if (monthIndex < 0) store.set('viewYear', store.get('viewYear') - 1);
        },
      },
      next: {
        args: {},
        run: (store) => {
          const monthIndex = store.get('viewMonth') + 1;
          store.set('viewMonth', monthIndex > 11 ? 0 : monthIndex);
          if (monthIndex > 11) store.set('viewYear', store.get('viewYear') + 1);
        },
      },
      open: { args: {}, run: (store) => showSelected(store) },
      close: { args: {}, run: (store) => store.set('open', false) },
      toggle: {
        args: {},
        run: (store) => {
          if (store.get('open')) store.set('open', false);
          else showSelected(store);
        },
      },
      select: {
        args: { iso: 'string' },
        run: (store, { iso }) => {
          if (!iso) return;
          const { year, month: monthIndex } = fromIso(iso);
          store.set('selected', iso);
          store.set('focus', iso);
          store.set('viewYear', year);
          store.set('viewMonth', monthIndex);
          store.set('open', false);
        },
      },
      focusMove: {
        args: { delta: 'number' },
        run: (store, { delta }) => {
          const current = store.get('focus') || isoOf(store.get('viewYear'), store.get('viewMonth'), 1);
          const { year, month: monthIndex, day } = fromIso(current);
          const date = new Date(Date.UTC(year, monthIndex, day + delta));
          store.set('focus', isoOf(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
          store.set('viewYear', date.getUTCFullYear());
          store.set('viewMonth', date.getUTCMonth());
        },
      },
    },
  };
};

// ------------------------------------------------------------------------------------------------ sortable list
// Reordering with a real pointer drag. The item being dragged and where it started are state keys; picking up,
// moving over a row and dropping are actions. The list reorders live: the picked-up row takes the place of each row
// the pointer crosses, and the runtime slides the other rows aside (`transition` on the row). The gesture is the
// bubbling pointer events the grammar has (pointerdown, pointerover, pointerup, pointercancel), so a mouse drag works;
// the keyboard does the same job with Enter, the arrow keys and Escape. (A touch pointer is implicitly captured by the
// grip, so the row under the finger is never reported as `pointerover`; the keyboard is the touch path.)

// The list with the item `from` taken out and put back at `to`. One definition of "move a row".
const movedItem = (items, from, to) => {
  const next = items.slice();
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
};
const indexOfId = (items, id) => items.findIndex((item) => item.id === id);

// Picking up, dropping and cancelling all end the drag the same way.
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

export const sortable = ({ items = [] } = {}) => ({
  // startIndex is where the picked-up row began, so Escape can put it back.
  state: { items, draggingId: null, startIndex: -1 },
  shapes: { items: { fields: { id: 'number', title: 'string' } } },
  derive: {
    // The list with a 1-based position per row, so a row can show where it is without computing anything.
    rows: (get) => get('items').map((item, index) => ({ ...item, position: index + 1 })),
    isDragging: (get) => get('draggingId') !== null,
    hint: (get) => (get('draggingId') === null ? 'Drag a grip over the other rows, or focus a grip and press Enter, then use \u2191/\u2193. Escape puts it back.' : 'Moving. Drag over a row, or use \u2191/\u2193 and Enter; Escape puts it back where it started.'),
  },
  actions: {
    // Pointer down on a grip (or Enter on it), in one action: with nothing picked up this row is picked up; on the
    // picked-up row it is put down; on any other row the picked-up row moves there and is put down. So a grip is
    // always a meaningful target.
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
    over: {
      args: { id: 'number' },
      run: (store, { id }) => moveDraggedTo(store, id),
    },
    // The pointer is released: the drag ends where the row is. (Decided by the release, not by where the row ended up:
    // a row dragged out and back to its first place is still dropped.) The keyboard picks up with Enter instead.
    release: {
      args: {},
      run: (store) => {
        if (store.get('draggingId') !== null) endDrag(store);
      },
    },
    // Escape, or a cancelled pointer (the browser took it, for example a touch scroll): put the row back.
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
    move: {
      args: { delta: 'number' },
      run: (store, { delta }) => {
        const items = store.get('items');
        const from = indexOfId(items, store.get('draggingId'));
        const to = from + delta;
        if (from < 0 || to < 0 || to >= items.length) return;
        store.set('items', movedItem(items, from, to));
      },
    },
  },
});
