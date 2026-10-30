import { footer, header, h1, main, pageSlot } from '@ehtb/agent-ui/spec';

export const shell = {
  name: 'main',
  view: main({ id: 'frame' }, header({ id: 'frame-header' }, h1({ id: 'frame-title' }, 'Fixture site')), pageSlot(), footer({ id: 'frame-footer' }, 'The end')),
};
