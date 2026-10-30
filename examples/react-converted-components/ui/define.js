// The helper every plain container in the kit is made with. A component library is ordinary JavaScript that returns
// component definitions, so repeated shapes are a function, not a convention to remember.
//
// A container is a div with an optional `id`, an extra `class` that is added to its base class, a `data-slot` like the
// upstream shadcn component has, and takes its content from the children of its use (React's `children` prop).
// Nothing else: a param that is not declared is an error.
import { defineElement, param, slot } from '@ehtb/agent-ui/components';
import { div, join } from '@ehtb/agent-ui/spec';

export const container = (name, baseClass, slotName) =>
  defineElement(name, {
    params: { id: { optional: true }, class: { default: '' } },
    spec: div({ id: param('id'), 'data-slot': slotName, class: join(baseClass, ' ', param('class')) }, slot()),
  });
