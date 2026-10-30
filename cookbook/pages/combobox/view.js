import { act, and, each, event, input, item, li, main, p, state, ul, when } from '@ehtb/agent-ui/spec';

export const view = main(
  { id: 'combobox-page' },
  input({
    id: 'fruit',
    role: 'combobox',
    'aria-label': 'Fruit',
    'aria-expanded': state('picker.open'),
    'aria-controls': 'fruit-options',
    autocomplete: 'off',
    value: state('picker.query'),
    on: {
      input: act('picker.setQuery', { value: event('target.value') }),
      'keydown.ArrowDown': act('picker.move', { by: 1 }, { preventDefault: true }),
      'keydown.ArrowUp': act('picker.move', { by: -1 }, { preventDefault: true }),
      'keydown.Enter': act('picker.chooseActive', {}, { preventDefault: true }),
      'keydown.Escape': act('picker.close'),
    },
  }),
  when(and(state('picker.open'), state('picker.hasOptions')), ul({ id: 'fruit-options', domId: 'fruit-options', role: 'listbox', 'aria-label': 'Fruit options' }, each('picker.options', 'value', li({ id: 'option', role: 'option', 'aria-selected': item('active'), classes: { active: item('active') }, on: { click: act('picker.choose', { value: item('value') }) } }, item('value'))))),
  p({ id: 'chosen' }, 'Chosen: ', state('picker.chosen')),
);
