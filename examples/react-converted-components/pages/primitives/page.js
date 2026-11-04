// The page at "/primitives": behavior only. Each interactive primitive is a namespace from primitives.js, mounted
// under the name its component is given (`name: 'combobox'`), so the component's bindings and the page's live
// status lines address the same keys. The content is view.js next to this file.
import { withFollow } from '@ehtb/agent-ui/follow';
import { withMoves } from '@ehtb/agent-ui/moves';
import { combobox, datePicker, popover, sortable } from '../../primitives.js';

// The combobox options and the reorderable tasks are data, so they live in state (the namespace), not in the spec.
const PEOPLE = [
  { value: 'ada', label: 'Ada Lovelace' },
  { value: 'alan', label: 'Alan Turing' },
  { value: 'grace', label: 'Grace Hopper' },
  { value: 'katherine', label: 'Katherine Johnson' },
];

const TASKS = [
  { id: 1, title: 'Draft the outline' },
  { id: 2, title: 'Write the tests' },
  { id: 3, title: 'Ship it' },
];

export const namespaces = {
  combobox: combobox({ options: PEOPLE }),
  date: datePicker({ initial: '2026-03-12', month: [2026, 2] }),
  popover: popover({ choices: ['Draft', 'Published', 'Archived'] }),
  sortable: sortable({ items: TASKS }),
};

// The sortable's rows follow the pointer and slide aside: the two plugins behind `follow` and `transition`.
export const page = { head: { title: 'Interactive primitives' }, namespaces, plugins: [withFollow, withMoves] };
