// Test fixture: the smallest browser entry, used by the build tests.
import { create } from '../list-app.js';

create({ root: document.getElementById('app'), dev: false });
