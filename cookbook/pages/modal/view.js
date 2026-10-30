import { act, button, dialog, div, h2, main, p, state, when } from '@ehtb/agent-ui/spec';

// The page behind the dialog is inert while it is open: it looks the same, but neither a pointer nor the Tab key reaches it.
// The dialog itself is a sibling of that content, not a child, so `inert` never covers the dialog.
export const view = main(
  { id: 'modal-page' },
  div(
    { id: 'page-content', inert: state('dialog.open') },
    button({ id: 'open', on: { click: act('dialog.show') } }, 'Delete everything'),
    p({ id: 'confirmed' }, 'Confirmed ', state('dialog.confirmed'), ' times'),
  ),
  when(
    state('dialog.open'),
    dialog(
      { id: 'dialog', open: true, 'aria-modal': true, 'aria-labelledby': 'dialog-title', tabindex: '-1', on: { 'keydown.Escape': act('dialog.close') } },
      h2({ id: 'dialog-title', domId: 'dialog-title' }, 'Are you sure?'),
      button({ id: 'confirm', on: { click: act('dialog.confirm') } }, 'Yes, delete'),
      button({ id: 'cancel', on: { click: act('dialog.close') } }, 'Cancel'),
    ),
  ),
);
