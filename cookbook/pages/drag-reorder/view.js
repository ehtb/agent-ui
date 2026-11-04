import { act, button, each, equals, h1, item, join, li, main, p, span, state, ul } from '@ehtb/agent-ui/spec';

const isDragged = equals(state('tasks.draggingId'), item('id'));

export const view = main(
  // A release or a cancelled pointer anywhere on the page ends the drag, not only inside the list. With nothing picked up they do nothing.
  { id: 'reorder-page', on: { pointerup: act('tasks.release'), pointercancel: act('tasks.cancel') } },
  h1(null, 'Tasks'),
  ul(
    // Escape anywhere in the list puts a picked-up row back.
    { id: 'tasks', on: { 'keydown.Escape': act('tasks.cancel') } },
    each(
      'tasks.items',
      'id',
      li(
        // `transition` slides the other rows aside as the list reorders (plugin withMoves); `follow` keeps the picked-up row under the pointer.
        { id: 'task', transition: 150, follow: isDragged, classes: { dragging: isDragged }, on: { pointerover: act('tasks.over', { id: item('id') }) } },
        button(
          {
            id: 'grip',
            type: 'button',
            'aria-label': join('Reorder ', item('title')),
            'aria-pressed': isDragged,
            focus: isDragged, // the grip keeps the focus while its row moves, so the arrow keys keep working
            on: {
              // preventDefault stops text selection and the browser's own drag start.
              pointerdown: act('tasks.press', { id: item('id') }, { preventDefault: true }),
              'keydown.Enter': act('tasks.press', { id: item('id') }, { preventDefault: true }),
              'keydown.ArrowUp': act('tasks.move', { delta: -1 }, { preventDefault: true }),
              'keydown.ArrowDown': act('tasks.move', { delta: 1 }, { preventDefault: true }),
            },
          },
          '⣿',
        ),
        span(null, item('title')),
      ),
    ),
  ),
  p({ id: 'hint' }, state('tasks.hint')),
);
