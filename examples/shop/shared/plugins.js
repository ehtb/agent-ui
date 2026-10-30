// What every page of the shop needs from outside its state: the resources (the cart, and the catalog where a page lists it).
import { withResources } from '@ehtb/agent-ui/resources';

export const plugins = [withResources];
