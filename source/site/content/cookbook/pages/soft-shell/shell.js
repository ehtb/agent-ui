// Recipe: a header that stays while the page changes. Behavior of the shell, and the namespace both pages share.
// The shell is an app of its own around the page. `frame.clicks` lives in the shell, so it survives every soft link; `visit.count`
// lives in the page, which is replaced, so it starts again on each page. The shell shows the page's count (`reads`, one way).
import { defineShell } from '@ehtb/agent-ui/shell';
import { withNavigation } from '@ehtb/agent-ui/navigation';

export const visit = {
  state: { count: 0 },
  actions: { bump: { args: {}, run: (store) => store.set('count', store.get('count') + 1) } },
};

const frame = {
  state: { clicks: 0, pageCount: 0 },
  actions: {
    click: { args: {}, run: (store) => store.set('clicks', store.get('clicks') + 1) },
    setPageCount: { args: { count: 'number' }, run: (store, { count }) => store.set('pageCount', count) },
  },
};

export const shell = defineShell({
  name: 'main',
  namespaces: { frame },
  plugins: [withNavigation], // makes `soft: true` links and route.go work
  reads: [{ watch: ['visit.count'], action: 'frame.setPageCount', args: { count: 'visit.count' } }],
});
