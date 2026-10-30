// The page "/soft-shell": behavior only. It lists the shell it lives in, and the namespace the shell reads.
import { shell, visit } from './shell.js';

export const page = { head: { title: 'First page - cookbook' }, namespaces: { visit }, shell };
