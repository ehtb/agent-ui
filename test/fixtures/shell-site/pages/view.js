import { each, item, li, ul } from '@ehtb/agent-ui/spec';
import { shell } from '../shared/shell-view.js';

export const view = ul({ id: 'items' }, each('items.list', 'id', li(null, item('title'))));
export { shell };
