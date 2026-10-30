// The content of the page at "/primitives" (the file next to page.js): four primitives React would import from a
// library, each a component in ui/ bound to a namespace in primitives.js. Only the server and the build import it.
import { expandComponents } from '@ehtb/agent-ui/components';
import { main, h1, p, a, act, each, state, item } from '@ehtb/agent-ui/spec';
import { components, Card, CardHeader, CardTitle, CardDescription, CardContent, Popover, Combobox, DatePicker, Sortable, SortableItem } from '../../ui/index.js';

export const view = expandComponents(
  main(
    // A release or a cancelled pointer anywhere on the page ends a drag, not only inside the list (the list's own
    // handlers take it first when the pointer is over the list). Nothing happens when no row is picked up.
    { on: { pointerup: act('sortable.release', {}), pointercancel: act('sortable.cancel', {}) } },
    h1(null, 'Interactive primitives'),
    p(null, a({ id: 'back-to-kit', href: '/' }, 'Back to the component kit')),
    p(null, 'Four things a React project takes from a library — a popover with a focus trap, a combobox, a date picker and a drag-and-drop list — built from namespaces and components instead. No component state, no portal, no external library.'),

    Card(
      null,
      CardHeader(null, CardTitle(null, 'Popover with a focus trap'), CardDescription(null, 'Tab and Shift+Tab cycle the items; Escape and the backdrop close it. The trap is popover.focusIndex and a focus binding per item.')),
      CardContent(null, Popover({ id: 'status-popover', name: 'popover', label: 'Choose a status' }), p({ class: 'ui-hint' }, 'Chosen: ', state('popover.value'))),
    ),

    Card(
      null,
      CardHeader(null, CardTitle(null, 'Combobox'), CardDescription(null, 'Type to filter, arrow keys move the highlight, Enter chooses. The list is a derived value over the options; aria-activedescendant names the active row.')),
      CardContent(null, Combobox({ id: 'person', name: 'combobox', label: 'Assign to', placeholder: 'Type a name' }), p({ class: 'ui-hint' }, 'Selected: ', state('combobox.selectedLabel'))),
    ),

    Card(
      null,
      CardHeader(null, CardTitle(null, 'Date picker'), CardDescription(null, 'Arrow keys move the focused day and change the month across an edge; Enter selects the focused day. The focused day is date.focus.')),
      CardContent(null, DatePicker({ id: 'meeting-date', name: 'date', label: 'Meeting date' }), p({ class: 'ui-hint' }, 'Focused: ', state('date.focus'), ' \u00b7 Selected: ', state('date.selectedLabel'))),
    ),

    Card(
      null,
      CardHeader(null, CardTitle(null, 'Drag and drop'), CardDescription(null, 'Drag a grip over the other rows to reorder the list live; the rows slide aside (transition on the row). Enter and the arrow keys do the same from the keyboard, Escape puts the row back where it started.')),
      CardContent(
        null,
        Sortable({ id: 'tasks', name: 'sortable' }, each(state('sortable.rows'), 'id', SortableItem({ id: 'task', name: 'sortable', rowId: item('id'), title: item('title'), position: item('position') }))),
        p({ class: 'ui-hint' }, state('sortable.hint')),
      ),
    ),
  ),
  components,
);
