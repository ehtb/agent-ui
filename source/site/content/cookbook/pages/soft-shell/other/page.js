// The page "/soft-shell/other": behavior only. It lists the shell it lives in, and the namespace the shell reads.
import { shell, visit } from '../shell.js';

export const page = { head: { title: 'Second page - cookbook' }, namespaces: { visit }, shell };
