// The shell of the shop: the header and the footer, which stay while the page inside them is replaced by a soft link (`soft: true`).
// Behavior only: what the shell keeps in state, what it takes from the page, and the plugin that makes soft links work. Its content
// is shell-view.js. Every page's page.js imports this and lists it as `shell`.
import { defineShell } from '@ehtb/agent-ui/shell';
import { withNavigation } from '@ehtb/agent-ui/navigation';

const frame = {
  state: { cartCount: 0 }, // what the header shows; the page owns the cart and the shell reads the count from it
  actions: { setCartCount: { args: { count: 'number' }, run: (store, { count }) => store.set('cartCount', count) } },
};

export const shell = defineShell({
  name: 'main',
  namespaces: { frame },
  plugins: [withNavigation],
  reads: [{ watch: ['cart.count'], action: 'frame.setCartCount', args: { count: 'cart.count' } }],
});
