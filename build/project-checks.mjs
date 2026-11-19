// The project's own rules for its pages: `checks` in build.config.mjs, run by `agent-ui check` and by a production build over the
// finished spec of every page and shell. A rule that an agent breaks again and again ("a button comes from ui/button.js, never
// the raw builder") is written once here and then fails with the fix, instead of being enforced by hand in review.
//
//   // build.config.mjs
//   import { forbidTags } from '@ehtb/agent-ui/checks';
//   export default {
//     checks: [
//       forbidTags({ button: 'Use Button from ui/button.js' }),
//       {
//         name: 'icon-buttons-have-a-label',
//         node: ({ node }) => node.tag === 'button' && !node.children && !node.props?.['aria-label'] && { problem: 'an icon button has no label', fix: "Add 'aria-label'" },
//       },
//     ],
//   };
//
// A check is `{ name, node }`. `node(context)` is called for every node of a spec (an element, a `when`, an `each`; text is not a node)
// and returns nothing, or `{ problem, fix }` (or a list of them). Both are plain sentences; the report is written as
// `where: problem. fix`, so every message of a project rule has the shape the framework's own have. The context:
//
//   node     the node (a plain object of the finished spec: `tag`, `props`, `children`, `id`, ...)
//   madeBy   the name of the component whose definition wrote the node, or null when the node was written directly, in a view or a
//            layout (`madeBy` of `@ehtb/agent-ui/components`). A rule about what a page may write checks `madeBy === null`:
//            the raw `button` inside the `Button` component is that component's own, and is where the rule sends the page.
//   parent   the node that holds it, or null for the root
//   path     where it is in the spec, for example `$.children[2].children[0]` (the report adds the node's `id` when it has one)
//   where    'page' or 'shell': whose spec it is
//
// A check runs in Node while the pages are checked, never in the browser. One that throws is reported as a problem of its own.
import { fail, didYouMean } from '../src/messages.js';
import { madeBy } from '../src/components.js';
import { ALLOWED_TAGS } from '../src/grammar.js';
import { visitSpec } from '../src/spec-walk.js';

const CHECK_KEYS = ['name', 'node'];
const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value) => typeof value === 'string' && value.trim() !== '';

// Says what is wrong with the `checks` option, as sentences (config-check.mjs reports them with the others).
export const checkProjectChecks = (checks) => {
  if (!Array.isArray(checks)) return [`"checks": must be a list of checks. Write checks: [forbidTags({ button: 'Use Button from ui/button.js' })], or { name: 'my-rule', node: (context) => ... } for a rule of your own`];
  const problems = [];
  const names = new Set();
  checks.forEach((check, index) => {
    const at = `"checks[${index}]"`;
    if (!isObject(check)) return problems.push(`${at}: a check is { name, node }, got ${check === null ? 'null' : Array.isArray(check) ? 'a list' : typeof check}. Write { name: 'my-rule', node: (context) => ({ problem: '...', fix: '...' }) }`);
    for (const key of Object.keys(check)) {
      if (!CHECK_KEYS.includes(key)) problems.push(`${at}: unknown key "${key}". ${didYouMean(key, CHECK_KEYS)}A check has ${CHECK_KEYS.join(' and ')}`);
    }
    if (typeof check.name !== 'string' || !NAME_PATTERN.test(check.name)) problems.push(`${at}: name must be lower-case words joined by dashes, got ${JSON.stringify(check.name)}. Write name: 'no-raw-button'; the report shows it so the rule can be found`);
    else if (names.has(check.name)) problems.push(`${at}: the name "${check.name}" is used twice. Give each check a name of its own (forbidTags takes it as a second argument)`);
    else names.add(check.name);
    if (typeof check.node !== 'function') problems.push(`${at}: node must be a function. Write node: ({ node, madeBy }) => (cond && { problem: 'what is wrong', fix: 'what to write' })`);
  });
  return problems;
};

// A check that fails a tag that a page writes directly, the way a project says "use the component, not the element".
//   forbidTags({ button: 'Use Button from ui/button.js', a: 'Use Link from ui/link.js' })
// The component's own definition (`madeBy` is its name) is not reported: it is where the page is sent.
export const forbidTags = (tags, name = 'forbid-tags') => {
  const where = 'forbidTags(...)';
  if (!isObject(tags) || !Object.keys(tags).length) fail(where, 'the first argument must be an object of tag to what to write instead', "Write forbidTags({ button: 'Use Button from ui/button.js' })");
  for (const [tag, fix] of Object.entries(tags)) {
    if (!ALLOWED_TAGS.includes(tag)) fail(where, `"${tag}" is not a tag of the grammar`, `${didYouMean(tag, ALLOWED_TAGS)}Write one of the tags of \`grammar.tags\``);
    if (!isText(fix)) fail(where, `the fix for "${tag}" must be a sentence that says what to write instead`, `Write ${tag}: 'Use ${tag[0].toUpperCase()}${tag.slice(1)} from ui/${tag}.js'`);
  }
  if (!NAME_PATTERN.test(name)) fail(where, `the name ${JSON.stringify(name)} must be lower-case words joined by dashes`, "Write forbidTags({ ... }, 'no-raw-button')");
  const forbidden = new Map(Object.entries(tags));
  return {
    name,
    node: ({ node, madeBy: author }) => (author === null && typeof node.tag === 'string' && forbidden.has(node.tag) ? { problem: `a ${node.tag} is written directly`, fix: forbidden.get(node.tag) } : undefined),
  };
};

const readFindings = (result) => (result === undefined || result === null || result === false ? [] : Array.isArray(result) ? result : [result]);

// Runs the checks over one spec and returns the problems as sentences: `<file>: <where>: <problem>. <fix> (check "<name>")`.
// `owner` names whose spec it is for the sentence ('' for a page, `shell "name": ` for a shell).
export const runProjectChecks = (checks, { spec, file, where = 'page', owner = '' }) => {
  const problems = [];
  if (!checks?.length) return problems;
  const paths = new Map();
  visitSpec(spec, (node, { parent, slot, index }) => {
    const path = parent === null ? '$' : `${paths.get(parent)}.${slot}${index === null ? '' : `[${index}]`}`;
    paths.set(node, path);
    const name = typeof node.id === 'string' ? ` (id "${node.id}")` : '';
    for (const check of checks) {
      let findings;
      try {
        findings = readFindings(check.node({ node, madeBy: madeBy(node), parent, path, where }));
      } catch (error) {
        problems.push(`${file}: ${owner}${path}${name}: the check "${check.name}" threw ${error?.message ?? String(error)}. Fix the check in build.config.mjs; a check must return nothing or { problem, fix }`);
        continue;
      }
      for (const finding of findings) {
        if (!isObject(finding) || !isText(finding.problem) || !isText(finding.fix)) {
          problems.push(`${file}: ${owner}${path}${name}: the check "${check.name}" returned ${JSON.stringify(finding)}, which is not { problem, fix }. Return nothing, or { problem: 'what is wrong', fix: 'what to write' } (two sentences, so the report says both)`);
          continue;
        }
        problems.push(`${file}: ${owner}${path}${name}: ${finding.problem.trim().replace(/\.$/, '')}. ${finding.fix.trim()} (check "${check.name}")`);
      }
    }
    return undefined;
  });
  return problems;
};

// The checks over one page's finished spec and, the first time a shell is met, over the shell's content (every page of a shell gives
// the same content, so `checkedShells`, a Set the caller keeps for the whole run, makes it one report). `module` is the page's
// generated module (`spec`, `shellContent`, `shellName`).
export const runPageChecks = (checks, { module, file, checkedShells }) => {
  const problems = runProjectChecks(checks, { spec: module.spec, file });
  if (module.shellContent && !checkedShells.has(module.shellName)) {
    checkedShells.add(module.shellName);
    problems.push(...runProjectChecks(checks, { spec: module.shellContent.view, file, where: 'shell', owner: `shell "${module.shellName}": ` }));
  }
  return problems;
};
