// Sortable list (drag and drop), new: there is no shadcn/ui component to convert. shadcn/ui's own docs pair a
// table with @dnd-kit, whose `useSortable` hook keeps the dragging item in refs and state. agent-ui has no such
// hook, so the dragging item and where it started are state keys of the namespace `sortable` (../primitives.js) and
// the gesture is pointer down, pointer over, pointer up through actions. The bubbling pointer events (pointerdown,
// pointermove, pointerup, pointercancel, pointerover, pointerout) are part of the grammar, so a mouse (or pen) drag
// works. There is no dragstart/dragover/drop and no dataTransfer, so this is the pointer-based gesture, not HTML5
// drag and drop. A touch pointer is implicitly captured by the grip, so `pointerover` never fires on the other rows:
// the keyboard gesture (below) is the touch path.
//
// There is deliberately no `// Source:` quote here: there is no single upstream file this converts. It is not in
// parity.test.mjs's list of quoted sources.
//
// What a React drag library does, and what this does instead:
//   useSortable's active ref          -> state sortable.draggingId, and sortable.startIndex so Escape can put the
//                                        row back where it started
//   pointer sensor + sortable preview -> pointerdown on the grip picks the row up, and pointerover on another row
//                                        moves the picked-up row there at once, so the list reorders while you drag
//   the keyboard sensor (dnd-kit)     -> keydown.Enter picks up and drops, keydown.ArrowUp / ArrowDown move,
//                                        Escape puts it back, and `focus` keeps the grip focused while the row moves
//   HTML5 drag (dragstart, dragover, drop, dataTransfer) -> not used: the pointer events are enough and a spec cannot
//                                        set dataTransfer. What is missing versus a native drag: no ghost image,
//                                        and a release outside the page's mount root is not seen (Escape finishes
//                                        it), because pointer events are only delegated from the mount root.
//   DragOverlay (dnd-kit)             -> the `follow` prop on the row: while the row is picked up the runtime tracks
//                                        the pointer and sets --follow-x / --follow-y; the CSS on [data-dragging]
//                                        turns them into a transform. The coordinates never enter the state or the log.
//   FLIP/layout animation (dnd-kit)   -> `transition: 200` on the row: the runtime slides every row that changes
//                                        position (docs/API.md, "Moves"), which is what makes the live reorder move
import { defineElement, param, slot } from '@ehtb/agent-ui/components';
import { ul, li, span, button, state, act, join, equals } from '@ehtb/agent-ui/spec';

export const Sortable = defineElement('sortable', {
  params: { id: {}, name: {}, class: { default: '' } },
  spec: ul(
    {
      id: param('id'),
      'data-slot': 'sortable',
      class: join('ui-sortable ', param('class')),
      on: {
        // Escape anywhere in the list puts a picked-up row down. A release ends the drag (the page ends it too when the pointer is elsewhere, see pages/primitives/view.js); a cancelled
        // pointer (the browser took it, for example a touch scroll) reverts.
        'keydown.Escape': act(join(param('name'), '.cancel'), {}),
        pointerup: act(join(param('name'), '.release'), {}),
        pointercancel: act(join(param('name'), '.cancel'), {}),
      },
    },
    slot(),
  ),
});

export const SortableItem = defineElement('sortableItem', {
  params: { id: {}, name: {}, rowId: {}, title: {}, position: {} },
  spec: li(
    {
      id: param('id'),
      // The HTML id has to be unique per row; the spec id above is the address and may repeat inside an each.
      domId: join(param('id'), '-', param('rowId')),
      'data-slot': 'sortable-item',
      class: 'ui-sortable-item',
      transition: 200,
      'data-dragging': equals(state(join(param('name'), '.draggingId')), param('rowId')),
      // While picked up the row follows the pointer: the runtime writes --follow-x / --follow-y, the CSS moves the row.
      follow: equals(state(join(param('name'), '.draggingId')), param('rowId')),
      // Moving the pointer over a row while dragging moves the picked-up row there; nothing happens when not dragging.
      on: { pointerover: act(join(param('name'), '.over'), { id: param('rowId') }) },
    },
    button(
      {
        domId: join(param('id'), '-grip-', param('rowId')),
        type: 'button',
        'data-slot': 'sortable-grip',
        class: 'ui-sortable-grip',
        'aria-label': join('Reorder ', param('title')),
        'aria-pressed': equals(state(join(param('name'), '.draggingId')), param('rowId')),
        focus: equals(state(join(param('name'), '.draggingId')), param('rowId')),
        on: {
          // Pointer down on the grip starts the drag (preventDefault stops text selection and the native drag start);
          // Enter does the same for the keyboard. Pressing a grip again, or another grip, drops.
          pointerdown: act(join(param('name'), '.press'), { id: param('rowId') }, { preventDefault: true }),
          'keydown.Enter': act(join(param('name'), '.press'), { id: param('rowId') }, { preventDefault: true }),
          'keydown.ArrowUp': act(join(param('name'), '.move'), { delta: -1 }, { preventDefault: true }),
          'keydown.ArrowDown': act(join(param('name'), '.move'), { delta: 1 }, { preventDefault: true }),
        },
      },
      '\u28ff',
    ),
    span({ class: 'ui-sortable-title' }, param('title')),
    span({ class: 'ui-sortable-position', 'aria-hidden': 'true' }, param('position')),
  ),
});
