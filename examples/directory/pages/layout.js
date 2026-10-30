// What both pages' views share: the shell and the tag list. Only view.js files import this module, so the spec builders it uses
// are not downloaded by a browser (shared.js is behavior and is).
import { each, h1, item, li, main, not, p, state, ul, when } from '@ehtb/agent-ui/spec';

export const tagList = (tagsBinding) => ul({ class: 'tags' }, each(tagsBinding, '.', li(null, item('.'))));

// The shell both pages share: the heading and the offline banner.
export const layout = (content) =>
  main(
    { id: 'directory-app' },
    h1(null, 'People'),
    when(not(state('network.online')), p({ id: 'offline', role: 'status' }, 'You are offline. Showing the last loaded data.')),
    content,
  );
