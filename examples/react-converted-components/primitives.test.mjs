// The four interactive primitives React takes from a library (a popover, a combobox, a date picker, a drag list),
// converted to agent-ui namespaces and components. These are the tests a React Testing Library suite of the library
// components would write: the element and its ARIA, a click, a keystroke, and what the state becomes. The library
// internals they replace (Radix's focus scope, cmdk's active index, react-day-picker's month, dnd-kit's sensors) are
// not run here; there is no React in this repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { definePage } from '@ehtb/agent-ui/pages';
import { createRoot, findElements, fireEvent, ShimElement } from '@ehtb/agent-ui/testing/dom-shim.mjs';
import { assertRepeatable } from '@ehtb/agent-ui/testing/helpers.mjs';
import { page } from './pages/primitives/page.js';
import { view } from './pages/primitives/view.js';

const { create } = definePage(page, { path: '/primitives', view });

const open = async () => {
  const root = createRoot();
  const ui = create({ root, dev: true });
  await ui.settle();
  const byDom = (id) => findElements(root, (element) => element.attributes.id === id)[0];
  const press = async (element, key) => { fireEvent(element, 'keydown', { target: element, key }); await ui.settle(); };
  return { ui, root, byDom, press };
};

// ------------------------------------------------------------------------------------------------------ popover

test('Popover: the trigger opens a dialog and the first choice takes focus', async () => {
  const { ui, byDom } = await open();
  const trigger = byDom('status-popover-trigger');
  assert.equal(trigger.attributes['aria-haspopup'], 'dialog');
  assert.equal(trigger.attributes['aria-expanded'], 'false');
  assert.equal(byDom('status-popover-content'), undefined, 'closed: the content is not rendered');

  fireEvent(trigger, 'click');
  await ui.settle();
  assert.equal(ui.state().popover.open, true);
  assert.equal(trigger.attributes['aria-expanded'], 'true');
  const content = byDom('status-popover-content');
  assert.equal(content.attributes.role, 'dialog');
  assert.equal('aria-modal' in content.attributes, false, 'no aria-modal: the trap is an index, not a real focus scope');
  assert.equal(content.attributes['aria-label'], 'Choose a status');
  assert.equal(trigger.attributes['aria-controls'], content.attributes.id);
  assert.equal(findElements(content, (element) => element.attributes['data-slot'] === 'popover-choice').length, 3);
  assert.equal(ShimElement.focusedElement, byDom('status-popover-content').childNodes[0], 'the first choice follows focusIndex 0');
});

test('Popover: Tab and Shift+Tab cycle the focus and never leave the content', async () => {
  const { ui, byDom, press } = await open();
  fireEvent(byDom('status-popover-trigger'), 'click');
  await ui.settle();
  const content = byDom('status-popover-content');
  const focusedText = () => ShimElement.focusedElement?.textContent;
  assert.equal(focusedText(), 'Draft');
  await press(content, 'Tab');
  assert.equal(ui.state().popover.focusIndex, 1);
  assert.equal(focusedText(), 'Published');
  await press(content, 'Tab');
  await press(content, 'Tab');
  assert.equal(ui.state().popover.focusIndex, 0, 'Tab wraps from the last choice to the first');
  assert.equal(focusedText(), 'Draft');
  await press(content, 'Tab');
  await press(content, 'Tab');
  assert.equal(ui.state().popover.focusIndex, 2);
  fireEvent(content, 'keydown', { target: content, key: 'Tab', shiftKey: true });
  await ui.settle();
  assert.equal(ui.state().popover.focusIndex, 1, 'Shift+Tab moves back');
  assert.equal(ShimElement.focusedElement.attributes['data-slot'], 'popover-choice');
});

test('Popover: choosing sets the trigger label; Escape and the backdrop close without choosing', async () => {
  const { ui, byDom } = await open();
  fireEvent(byDom('status-popover-trigger'), 'click');
  await ui.settle();
  fireEvent(byDom('status-popover-content').childNodes[1], 'click');
  await ui.settle();
  assert.equal(ui.state().popover.value, 'Published');
  assert.equal(ui.state().popover.open, false);
  assert.equal(byDom('status-popover-trigger').textContent, 'Published', 'the trigger shows the chosen value');

  fireEvent(byDom('status-popover-trigger'), 'click');
  await ui.settle();
  fireEvent(byDom('status-popover-content'), 'keydown', { target: byDom('status-popover-content'), key: 'Escape' });
  await ui.settle();
  assert.equal(ui.state().popover.open, false);
  assert.equal(ui.state().popover.value, 'Published', 'Escape does not change the choice');

  fireEvent(byDom('status-popover-trigger'), 'click');
  await ui.settle();
  fireEvent(byDom('status-popover-backdrop'), 'click');
  await ui.settle();
  assert.equal(ui.state().popover.open, false);
  assert.equal(ui.state().popover.value, 'Published');
});

// ----------------------------------------------------------------------------------------------------- combobox

test('Combobox: the input is a combobox, and typing filters the list and opens it', async () => {
  const { ui, byDom } = await open();
  const input = byDom('person-input');
  assert.equal(input.attributes.role, 'combobox');
  assert.equal(input.attributes['aria-expanded'], 'false');
  assert.equal(input.attributes['aria-controls'], 'person-list');
  assert.equal(byDom('person-list'), undefined, 'closed: no listbox');

  input.value = 'gr';
  fireEvent(input, 'input', { target: input });
  await ui.settle();
  assert.equal(ui.state().combobox.open, true);
  assert.equal(input.attributes['aria-expanded'], 'true');
  const options = () => findElements(byDom('person-list'), (element) => element.attributes['data-slot'] === 'combobox-option');
  assert.deepEqual(options().map((option) => option.textContent), ['Grace Hopper']);
  assert.equal(input.attributes['aria-activedescendant'], byDom('person-option-grace').attributes.id, 'the active option is named for the screen reader');
  assert.equal(options()[0].attributes['data-active'], '', 'the active option carries data-active');
});

test('Combobox: the arrows move the highlight, Enter chooses, Escape closes', async () => {
  const { ui, byDom, press } = await open();
  const input = byDom('person-input');
  fireEvent(input, 'focusin', { target: input });
  await ui.settle();
  assert.equal(ui.derived().combobox.matches.length, 4, 'an empty query shows every option');
  const optionFor = (value) => byDom(`person-option-${value}`);

  await press(input, 'ArrowDown');
  assert.equal(ui.state().combobox.activeIndex, 1);
  assert.equal(ui.derived().combobox.activeValue, 'alan');
  assert.equal(optionFor('alan').attributes['data-active'], '');
  assert.equal('data-active' in optionFor('ada').attributes, false);
  await press(input, 'ArrowUp');
  assert.equal(ui.derived().combobox.activeValue, 'ada', 'ArrowUp moves the highlight back');
  await press(input, 'ArrowUp');
  assert.equal(ui.derived().combobox.activeValue, 'katherine', 'the arrow keys wrap around the list');

  await press(input, 'Enter');
  assert.equal(ui.state().combobox.selected, 'katherine');
  assert.equal(ui.state().combobox.query, 'Katherine Johnson', 'the query becomes the chosen label');
  assert.equal(ui.state().combobox.open, false);
  assert.equal(ui.derived().combobox.selectedLabel, 'Katherine Johnson');

  fireEvent(input, 'focusin', { target: input });
  await ui.settle();
  await press(input, 'Escape');
  assert.equal(ui.state().combobox.open, false);
});

test('Combobox: no match shows the empty message, and choosing a row closes the list', async () => {
  const { ui, byDom } = await open();
  const input = byDom('person-input');
  input.value = 'zzz';
  fireEvent(input, 'input', { target: input });
  await ui.settle();
  assert.equal(ui.derived().combobox.isEmpty, true);
  assert.equal(byDom('person-empty').textContent, 'No matches');
  assert.equal(byDom('person-list'), undefined, 'the empty message replaces the listbox');

  input.value = 'al';
  fireEvent(input, 'input', { target: input });
  await ui.settle();
  fireEvent(byDom('person-option-alan'), 'click');
  await ui.settle();
  assert.equal(ui.state().combobox.selected, 'alan');
  assert.equal(byDom('person-list'), undefined);
});

test('Combobox: a click on the backdrop closes the list and keeps the query', async () => {
  const { ui, byDom } = await open();
  const input = byDom('person-input');
  fireEvent(input, 'focusin', { target: input });
  await ui.settle();
  assert.equal(ui.state().combobox.open, true);
  assert.ok(byDom('person-backdrop'), 'the outside-click layer is rendered while the list is open');

  fireEvent(byDom('person-backdrop'), 'click');
  await ui.settle();
  assert.equal(ui.state().combobox.open, false);
  assert.equal(byDom('person-list'), undefined);
  assert.equal(ui.state().combobox.query, '', 'the query is left as it was; closing does not clear it');
});

// -------------------------------------------------------------------------------------------------- date picker

test('Date picker: the trigger shows the selected day and opens the month grid', async () => {
  const { ui, byDom } = await open();
  const trigger = byDom('meeting-date-trigger');
  assert.equal(trigger.textContent, '12 March 2026');
  assert.equal(trigger.attributes['aria-expanded'], 'false');
  assert.equal(byDom('meeting-date-calendar'), undefined, 'closed: no grid');

  fireEvent(trigger, 'click');
  await ui.settle();
  assert.equal(ui.state().date.open, true);
  assert.equal(trigger.attributes['aria-expanded'], 'true');
  const calendar = byDom('meeting-date-calendar');
  assert.equal(calendar.attributes.role, 'dialog');
  assert.equal(calendar.textContent.includes('March 2026'), true);
  assert.equal(byDom('meeting-date-day-2026-03-12').attributes['aria-selected'], 'true');
  assert.equal(byDom('meeting-date-day-2026-03-11').attributes['aria-selected'], 'false');
  assert.equal(ShimElement.focusedElement, byDom('meeting-date-day-2026-03-12'), 'the selected day takes focus when the grid opens');
});

test('Date picker: the arrows move the focused day, across a month edge, and Enter selects it', async () => {
  const { ui, byDom, press } = await open();
  fireEvent(byDom('meeting-date-trigger'), 'click');
  await ui.settle();
  const calendar = byDom('meeting-date-calendar');
  await press(calendar, 'ArrowRight');
  assert.equal(ui.state().date.focus, '2026-03-13');
  assert.equal(ShimElement.focusedElement, byDom('meeting-date-day-2026-03-13'));
  await press(calendar, 'ArrowDown');
  assert.equal(ui.state().date.focus, '2026-03-20', 'ArrowDown moves a week');
  await press(calendar, 'ArrowLeft');
  assert.equal(ui.state().date.focus, '2026-03-19');

  ui.dispatch('date.focusMove', { delta: 12 }); // to 31 March
  await ui.settle();
  assert.equal(ui.state().date.focus, '2026-03-31');
  await press(calendar, 'ArrowRight');
  assert.equal(ui.state().date.focus, '2026-04-01', 'moving past the last day turns the page');
  assert.equal(ui.derived().date.monthLabel, 'April 2026');
  assert.ok(byDom('meeting-date-day-2026-04-01'), 'the grid turned to April');

  await press(calendar, 'Enter');
  assert.equal(ui.state().date.selected, '2026-04-01');
  assert.equal(ui.state().date.open, false);
  assert.equal(byDom('meeting-date-calendar'), undefined);
  assert.equal(byDom('meeting-date-trigger').textContent, '1 April 2026');
});

test('Date picker: the previous and next buttons turn the page, and a day click selects it', async () => {
  const { ui, byDom } = await open();
  fireEvent(byDom('meeting-date-trigger'), 'click');
  await ui.settle();
  fireEvent(byDom('meeting-date-next'), 'click');
  await ui.settle();
  assert.equal(ui.derived().date.monthLabel, 'April 2026');
  fireEvent(byDom('meeting-date-prev'), 'click');
  fireEvent(byDom('meeting-date-prev'), 'click');
  await ui.settle();
  assert.equal(ui.derived().date.monthLabel, 'February 2026', 'prev crosses back into the previous year');
  fireEvent(byDom('meeting-date-day-2026-02-14'), 'click');
  await ui.settle();
  assert.equal(ui.state().date.selected, '2026-02-14');
  assert.equal(ui.state().date.open, false);
  assert.equal(byDom('meeting-date-trigger').textContent, '14 February 2026');
});

test('Date picker: a click on the backdrop closes the calendar', async () => {
  const { ui, byDom } = await open();
  fireEvent(byDom('meeting-date-trigger'), 'click');
  await ui.settle();
  assert.equal(ui.state().date.open, true);
  assert.ok(byDom('meeting-date-backdrop'), 'the outside-click layer is rendered while the grid is open');

  fireEvent(byDom('meeting-date-backdrop'), 'click');
  await ui.settle();
  assert.equal(ui.state().date.open, false);
  assert.equal(byDom('meeting-date-calendar'), undefined);
  assert.equal(ui.state().date.selected, '2026-03-12', 'closing does not change the selection');
});

// ---------------------------------------------------------------------------------------------------- sortable

test('Sortable: dragging a grip over another row moves it there at once, and releasing drops it', async () => {
  const { ui, byDom } = await open();
  const grip = byDom('task-grip-1');
  assert.equal(grip.attributes['aria-label'], 'Reorder Draft the outline');
  assert.equal(grip.attributes['aria-pressed'], 'false');
  assert.equal(byDom('task-1').attributes['data-dragging'], undefined);

  fireEvent(grip, 'pointerdown');
  await ui.settle();
  assert.equal(ui.state().sortable.draggingId, 1, 'pointer down picks the row up');
  assert.equal(grip.attributes['aria-pressed'], 'true');
  assert.equal(byDom('task-1').attributes['data-dragging'], '');

  // The pointer crosses row 2, then row 3: the picked-up row takes each place while the pointer is still down.
  fireEvent(byDom('task-2'), 'pointerover');
  await ui.settle();
  assert.deepEqual(ui.state().sortable.items.map((item) => item.id), [2, 1, 3]);
  fireEvent(byDom('task-1'), 'pointerover');
  await ui.settle();
  assert.deepEqual(ui.state().sortable.items.map((item) => item.id), [2, 1, 3], 'over the picked-up row itself changes nothing');
  fireEvent(byDom('task-3'), 'pointerover');
  await ui.settle();
  assert.deepEqual(ui.state().sortable.items.map((item) => item.id), [2, 3, 1]);
  assert.equal(ui.state().sortable.draggingId, 1, 'still picked up until the pointer is released');

  fireEvent(byDom('task-3'), 'pointerup');
  await ui.settle();
  assert.deepEqual(ui.state().sortable.items.map((item) => item.id), [2, 3, 1]);
  assert.equal(ui.state().sortable.draggingId, null);
  assert.equal(byDom('task-grip-1').attributes['aria-pressed'], 'false');
});

test('Sortable: the keyboard picks a row up with Enter and the arrows move it', async () => {
  const { ui, byDom, press } = await open();
  const grip = byDom('task-grip-1');
  await press(grip, 'Enter');
  assert.equal(ui.state().sortable.draggingId, 1, 'Enter picks the row up');
  assert.equal(ShimElement.focusedElement, grip, 'the grip keeps focus while the row moves');

  await press(grip, 'ArrowDown');
  assert.deepEqual(ui.derived().sortable.rows.map((row) => row.id), [2, 1, 3], 'the row moved down one place');
  assert.deepEqual(ui.derived().sortable.rows.map((row) => row.position), [1, 2, 3]);

  await press(grip, 'Enter');
  assert.equal(ui.state().sortable.draggingId, null, 'Enter again drops the row in place');
});

test('Sortable: rows that change places slide to their new spot (FLIP), driven by `transition` on the row', async () => {
  const played = [];
  const original = { rect: ShimElement.prototype.getBoundingClientRect, animate: ShimElement.prototype.animate };
  // Fake layout: a task row sits 50px below the one before it.
  ShimElement.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 50 * this.parentNode.childNodes.filter((child) => child.attributes?.['data-slot'] === 'sortable-item').indexOf(this) };
  };
  ShimElement.prototype.animate = function (keyframes, options) { played.push({ id: this.attributes.id, keyframes, options }); };
  try {
    const { ui, byDom, press } = await open();
    const grip = byDom('task-grip-1');
    await press(grip, 'Enter');
    assert.equal(played.length, 0, 'picking up moves nothing');
    await press(grip, 'ArrowDown');
    assert.deepEqual(ui.derived().sortable.rows.map((row) => row.id), [2, 1, 3]);
    assert.deepEqual(played.map((one) => one.id).sort(), ['task-1', 'task-2'], 'only the two rows that swapped slide');
    const one = played.find((entry) => entry.id === 'task-1');
    assert.deepEqual(one.keyframes, [{ transform: 'translate(0px, -50px)' }, { transform: 'none' }]);
    assert.equal(one.options.duration, 200);
  } finally {
    ShimElement.prototype.getBoundingClientRect = original.rect;
    ShimElement.prototype.animate = original.animate;
  }
});

test("Sortable: pressing another row's grip drops the picked-up row there", async () => {
  const { ui, byDom } = await open();
  fireEvent(byDom('task-grip-1'), 'pointerdown');
  await ui.settle();
  assert.equal(ui.state().sortable.draggingId, 1);

  fireEvent(byDom('task-grip-3'), 'pointerdown');
  await ui.settle();
  assert.deepEqual(ui.state().sortable.items.map((item) => item.id), [2, 3, 1], 'row 1 dropped onto row 3');
  assert.equal(ui.state().sortable.draggingId, null);
  assert.equal(byDom('task-grip-3').attributes['aria-pressed'], 'false');
});

test('Sortable: a drag that returns to its first place is still dropped on release, and a release elsewhere on the page ends it', async () => {
  const { ui, byDom, root } = await open();
  fireEvent(byDom('task-grip-1'), 'pointerdown');
  fireEvent(byDom('task-2'), 'pointerover');
  fireEvent(byDom('task-1'), 'pointerover');
  fireEvent(byDom('task-2'), 'pointerover');
  await ui.settle();
  assert.deepEqual(ui.state().sortable.items.map((item) => item.id), [1, 2, 3], 'out and back: the first order again');
  assert.equal(ui.state().sortable.draggingId, 1);
  fireEvent(byDom('task-2'), 'pointerup');
  await ui.settle();
  assert.equal(ui.state().sortable.draggingId, null, 'released in its first place: dropped, not stuck to the pointer');

  // A release on the page, outside the list, ends the drag too.
  fireEvent(byDom('task-grip-3'), 'pointerdown');
  await ui.settle();
  assert.equal(ui.state().sortable.draggingId, 3);
  fireEvent(findElements(root, (element) => element.localName === 'h1')[0], 'pointerup');
  await ui.settle();
  assert.equal(ui.state().sortable.draggingId, null);
});

test('Sortable: Escape puts a picked-up row back where it started', async () => {
  const { ui, byDom, press } = await open();
  const [first] = ui.state().sortable.items;
  const grip = byDom('task-grip-1');
  await press(grip, 'Enter');
  await press(grip, 'ArrowDown');
  await press(grip, 'ArrowDown');
  assert.deepEqual(ui.state().sortable.items.map((item) => item.id), [2, 3, 1]);

  await press(grip, 'Escape');
  assert.deepEqual(ui.state().sortable.items.map((item) => item.id), [1, 2, 3]);
  assert.equal(ui.state().sortable.draggingId, null);
  assert.equal(ui.state().sortable.items[0], first, 'the row that moved is the same item object, back in first place');
});

test('Sortable: the arrows stop at the ends of the list', async () => {
  const { ui, byDom, press } = await open();
  const grip = byDom('task-grip-2');
  await press(grip, 'Enter');
  await press(grip, 'ArrowUp');
  assert.deepEqual(ui.state().sortable.items.map((item) => item.id), [2, 1, 3], 'ArrowUp moves the row up one place');
  await press(grip, 'ArrowUp');
  assert.deepEqual(ui.state().sortable.items.map((item) => item.id), [2, 1, 3], 'the first row cannot move further up');
});

test('the primitives are repeatable: opening, choosing and cancelling twice change nothing the second time', async () => {
  const { ui } = await open();
  await assertRepeatable(ui, 'popover.open');
  await assertRepeatable(ui, 'popover.choose', { value: 'Draft' });
  await assertRepeatable(ui, 'date.select', { iso: '2026-03-12' });
  await assertRepeatable(ui, 'sortable.cancel');
  await assertRepeatable(ui, 'combobox.choose', { value: 'ada' });
});
