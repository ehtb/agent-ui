import { withResources } from '@ehtb/agent-ui/resources';
import { items, itemsSettled } from '../shared/items.js';
import { shell } from '../shared/shell.js';

export const page = { namespaces: { items }, plugins: [withResources], shell, head: { title: 'Items' }, ready: itemsSettled };
