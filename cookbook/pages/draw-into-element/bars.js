// A plugin that draws into an element: here, a bar chart made of text, standing for a charting library. Everything such a plugin
// does is in this file: claim the element by its id (mountElement), draw into it, follow the state it shows (api.watch), report what
// the visitor does in it (api.dispatch), and give everything back when the element leaves the page.
//
// The page lists it like any plugin: plugins: [withBars]. It never touches state itself; it reads through api.watch and writes
// through api.dispatch, so what happens in the chart is a logged action like a click anywhere else.
import { mountElement } from '@ehtb/agent-ui/mount-element';

const drawBars = (element, series) => {
  element.replaceChildren();
  series.forEach((value, index) => {
    const bar = element.ownerDocument.createElement('div');
    bar.setAttribute('data-bar', String(index));
    bar.append(element.ownerDocument.createTextNode('#'.repeat(value)));
    element.append(bar);
  });
};

// A page lists it as `plugins: [withBars]`: the page hands every plugin its environment (win, fetchFunction), and this one needs none.
export const withBars = () => (api) =>
  mountElement(api, 'bars', (element) => {
    const stop = api.watch(['sales.series'], (values) => drawBars(element, values['sales.series']));
    // The element belongs to the plugin: its own listener, removed with it. A click on a bar is an action, like any other.
    const onClick = (event) => {
      const index = event.target.getAttribute?.('data-bar');
      if (index !== null && index !== undefined && !api.replaying) api.dispatch('sales.select', { index: Number(index) });
    };
    element.addEventListener('click', onClick);
    return () => {
      stop();
      element.removeEventListener('click', onClick);
      element.replaceChildren();
    };
  });
