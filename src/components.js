// Spec components: named, parameterized spec fragments, expanded to plain spec BEFORE validation and mounting.
//
//   const components = {
//     card: {
//       params: ['id', 'title'],
//       spec: { tag: 'li', id: { param: 'id' }, children: [{ tag: 'h3', children: { param: 'title' } }, { slot: 'children' }] },
//     },
//   };
//   spec: expandComponents({ tag: 'ul', children: [
//     { use: 'card', with: { id: 'card-1', title: 'First' }, children: [{ tag: 'p', children: 'body' }] },
//   ] }, components)
//
// Why a macro pass and not a runtime component system: there is no component instance, lifecycle, local state or
// prop reactivity to reason about. The result is ordinary spec data that the validator checks as a whole, that
// `patchSpec` addresses by id, and that `tree()`/`outline()` describe exactly. Reuse removes copy-paste drift (the
// error an agent makes after losing context) without adding a second execution model.
//
// Rules:
//   - `{param: name}` anywhere in a component's spec is replaced by the value given in `with` (a string, number,
//     binding, or whole spec node). Params appear in id positions too, so instances can get unique ids.
//   - `{slot: 'children'}` is replaced by the `children` of the `use` node (nothing when absent).
//   - every declared param must be given and no others (typos are reported, not ignored), unless the param
//     declares a default, options or optional (see "Param declarations").
//   - components may use other components; recursion deeper than 20 levels is an error.
//
// Param declarations. `params` is either a list of names (every one required, as above) or an object that says more
// about each one, which is what a component library needs (variants, sizes, optional handlers):
//
//   params: {
//     id:      {},                                    required: no default, so a use that omits it is an error
//     variant: { options: { default: 'btn-default', outline: 'btn-outline' }, default: 'default' },
//     class:   { default: '' },                       given or not, always a value
//     onClick: { optional: true },                    omitted: the key (or list entry) holding {param: 'onClick'} disappears
//   }
//
//   - `options` makes the param a variant: the use writes a key ('outline'), the component spec receives the mapped
//     value ('btn-outline'). Any other key is an error that lists the options and suggests the nearest one. A variant is
//     resolved when the page is built, so it must be a literal, never a binding (use a `when` to switch at runtime).
//   - `default` is used when the param is omitted (for a variant it is one of the option keys).
//   - `optional` drops whatever holds {param: name} when the param is omitted, like an undefined prop.
//   - {param: 'variant', key: true} gives the key the use wrote ('outline') instead of the mapped value, for example for a
//     data-variant attribute that a stylesheet selects on. For an omitted variant with a default, it is the default key.
//
// Class strings. A `join` whose operands are all literals after substitution becomes one string at build time, so
// {join: ['btn ', {param: 'variant'}, ' ', {param: 'size'}, ' ', {param: 'class'}]} ends as a plain `class` value;
// in `props.class` the result is also trimmed and its spaces collapsed, so an empty `class` param leaves no gap.
// Problems are returned together as `path: message` lines, like the validator, and thrown as one Error.

import { didYouMean } from './messages.js';
import { isBinding, isPlainObject, toArray } from './spec-core.js';

const MAX_DEPTH = 20;
const PARAM_KEYS = ['default', 'options', 'optional', 'type'];
const PARAM_TYPES = ['string', 'number', 'boolean', 'handler', 'node'];
const DEFINITION_KEYS = ['params', 'spec'];
const OMIT = Symbol('omitted optional param');
const KEYS = Symbol('option keys'); // on a values object: param name -> the option key the use wrote
// Checks a given value against a declared `type`. Bindings and nodes are only known at runtime, so a binding passes for
// string, number and boolean. Returns the problem, or '' when the value fits.
const typeMismatch = (type, value) => {
  if (type === 'node') return '';
  if (type === 'handler') return Array.isArray(value) && (typeof value[0] === 'string' || (value.length > 1 && value.every((one) => Array.isArray(one) && typeof one[0] === 'string'))) ? '' : `must be a handler, for example act('todo.add', {}), got ${JSON.stringify(value)}`;
  if (typeof value === type || isBinding(value)) return '';
  return `must be a ${type}${type === 'string' ? ' or a binding' : ''}, got ${JSON.stringify(value)}. Write ${type === 'string' ? "'text'" : type === 'number' ? '3' : 'true'}`;
};
const clone = (value) => JSON.parse(JSON.stringify(value));
const isSlotNode = (node) => isPlainObject(node) && 'slot' in node && Object.keys(node).length === 1;

// Reads one component's `params` (a list of names, or an object of declarations) into a Map of normalized declarations.
const readParams = (name, params = [], problems) => {
  const declarations = new Map();
  const where = `components.${name}.params`;
  if (Array.isArray(params)) {
    for (const param of params) declarations.set(param, { required: true });
    return declarations;
  }
  if (!isPlainObject(params)) {
    problems.push(`${where}: params must be a list of names or an object { name: { default?, options?, optional? } }`);
    return declarations;
  }
  for (const [param, declaration] of Object.entries(params)) {
    const at = `${where}.${param}`;
    if (!isPlainObject(declaration)) {
      problems.push(`${at}: write {} for a required param, or an object with default, options or optional`);
      continue;
    }
    for (const key of Object.keys(declaration)) {
      if (!PARAM_KEYS.includes(key)) problems.push(`${at}: unknown key ${key}. ${didYouMean(key, PARAM_KEYS)}Allowed: ${PARAM_KEYS.join(', ')}`);
    }
    if ('type' in declaration && !PARAM_TYPES.includes(declaration.type)) problems.push(`${at}: unknown type ${JSON.stringify(declaration.type)}. ${didYouMean(String(declaration.type), PARAM_TYPES)}Types: ${PARAM_TYPES.join(', ')}`);
    if ('type' in declaration && 'options' in declaration) problems.push(`${at}: a param with options is always one of its option keys; remove type`);
    if ('type' in declaration && 'default' in declaration && PARAM_TYPES.includes(declaration.type)) {
      const mismatch = typeMismatch(declaration.type, declaration.default);
      if (mismatch) problems.push(`${at}: default ${mismatch}`);
    }
    if ('default' in declaration && declaration.optional) problems.push(`${at}: a param cannot have both default and optional. A default is used when the param is omitted; optional removes whatever holds it. Keep one`);
    if ('options' in declaration) {
      const options = declaration.options;
      if (!isPlainObject(options) || !Object.keys(options).length || !Object.values(options).every((value) => typeof value === 'string')) {
        problems.push(`${at}: options must be an object of strings, for example { default: 'btn-default', outline: 'btn-outline' }`);
        continue;
      }
      if ('default' in declaration && !(declaration.default in options)) {
        problems.push(`${at}: default ${JSON.stringify(declaration.default)} is not one of the options. ${didYouMean(String(declaration.default), Object.keys(options))}Options: ${Object.keys(options).join(', ')}`);
      }
    }
    declarations.set(param, { required: !('default' in declaration) && !declaration.optional, ...declaration });
  }
  return declarations;
};

// A join of only literals is a constant: fold it so a class built from variants is one plain string.
const foldJoin = (node) => {
  const parts = node.join;
  if (!Array.isArray(parts) || !parts.every((part) => part === null || ['string', 'number', 'boolean'].includes(typeof part))) return node;
  return parts.map((part) => (part === null ? '' : String(part))).join('');
};

// Placeholders for a component's spec, so a definition written with the builders reads like the element it makes:
// param('title') is { param: 'title' }, paramKey('size') is { param: 'size', key: true }, slot() is { slot: 'children' }.
export const param = (name) => ({ param: name });
export const paramKey = (name) => ({ param: name, key: true });
export const slot = () => ({ slot: 'children' });

// A component made for the builders: defineElement('card', { params, spec }) returns a function
// card({ title: 'Hi' }, child, child) that makes the use node { use: 'card', with: { title: 'Hi' }, children: [child, child] }.
// Pass the made functions to expandComponents as a list: expandComponents(page, [card, button]).
export const defineElement = (name, definition) => {
  const where = `defineElement(${JSON.stringify(name)})`;
  const problems = [];
  if (typeof name !== 'string' || name === '') problems.push('the first argument is the component name, a non-empty string');
  if (!isPlainObject(definition)) problems.push('the second argument is { params, spec }');
  else {
    for (const key of Object.keys(definition)) if (!DEFINITION_KEYS.includes(key)) problems.push(`unknown key ${key}. ${didYouMean(key, DEFINITION_KEYS)}Allowed: ${DEFINITION_KEYS.join(', ')}`);
    if (!isPlainObject(definition.spec)) problems.push('spec must be one element, for example div({ class: param("class") }, slot())');
  }
  const declarations = problems.length ? new Map() : readParams(name, definition.params, problems);
  if (problems.length) throw new Error(`${where}: ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n  ${problems.map((problem) => problem.replace(`components.${name}.params`, 'params')).join('\n  ')}`);
  const make = (values, ...children) => {
    if (values !== null && values !== undefined && !isPlainObject(values)) throw new Error(`${where}: the first argument is the params object or null, got ${JSON.stringify(values)}. Write ${name}({ ${[...declarations.keys()][0] ?? 'param'}: ... }, ...children)`);
    // A child element passed where the params go: every key of the object is one an element has, and none of them is a param.
    const looksLikeChild = isPlainObject(values) && Object.keys(values).length > 0 && Object.keys(values).every((key) => ['tag', 'props', 'children', 'id', 'classes', 'on', 'transition', 'use', 'with', 'slot', 'each', 'when', 'key', 'template', 'otherwise'].includes(key) && !declarations.has(key)) && ['tag', 'use', 'slot', 'each', 'when'].some((key) => key in values);
    if (looksLikeChild) {
      const call = declarations.size ? `${name}({ ${[...declarations.keys()].join(': ..., ')}: ... }, child)` : `${name}(null, child)`;
      throw new Error(`${where}: the first argument is the params object or null, but it looks like a child element. Write ${call}`);
    }
    for (const key of Object.keys(values ?? {})) {
      if (!declarations.has(key)) throw new Error(`${where}: has no param ${key}. ${didYouMean(key, [...declarations.keys()])}Declared: ${[...declarations.keys()].join(', ') || 'none'}`);
    }
    const node = { use: name };
    if (values && Object.keys(values).length) node.with = values;
    const flat = children.flat();
    if (flat.length) node.children = flat;
    return node;
  };
  make.componentName = name;
  make.definition = definition;
  return make;
};

const listComponents = (components) => {
  if (!Array.isArray(components)) {
    return Object.fromEntries(Object.entries(components).map(([name, value]) => {
      if (typeof value !== 'function' || !value.definition) return [name, value];
      if (value.componentName !== name) throw new Error(`expandComponents: components.${name} was made as defineElement(${JSON.stringify(value.componentName)}, ...). A use writes the defineElement name, so register it under that name, or pass a list: expandComponents(spec, [component])`);
      return [name, value.definition];
    }));
  }
  return Object.fromEntries(components.map((made, index) => {
    if (typeof made !== 'function' || !made.componentName) throw new Error(`expandComponents: components[${index}] is not made by defineElement. Write defineElement('name', { params, spec }), or pass an object { name: { params, spec } }`);
    return [made.componentName, made.definition];
  }));
};

export const expandComponents = (spec, componentList = {}) => {
  const components = listComponents(componentList);
  const problems = [];
  const declared = {};
  for (const [name, definition] of Object.entries(components)) {
    if (!isPlainObject(definition)) {
      problems.push(`components.${name}: a component is { params, spec }`);
      continue;
    }
    for (const key of Object.keys(definition)) {
      if (!DEFINITION_KEYS.includes(key)) problems.push(`components.${name}: unknown key ${key}. ${didYouMean(key, DEFINITION_KEYS)}Allowed: ${DEFINITION_KEYS.join(', ')}`);
    }
    if (!isPlainObject(definition.spec)) {
      problems.push(`components.${name}: spec must be one element, for example div({ class: param("class") }, slot())`);
      continue;
    }
    declared[name] = { spec: definition.spec, params: readParams(name, definition.params, problems) };
  }

  const substitute = (template, values, slotNodes, path) => {
    if (Array.isArray(template)) return template.flatMap((child, index) => {
      const result = substitute(child, values, slotNodes, `${path}.${index}`);
      if (result === OMIT) return [];
      return isSlotNode(child) ? result : [result];
    });
    if (!isPlainObject(template)) return template;
    const keys = Object.keys(template);
    if (keys.includes('param') && keys.length > 1 && !(keys.length === 2 && keys.includes('key'))) {
      const extra = keys.filter((key) => key !== 'param');
      problems.push(`${path}: unknown key ${extra[0]} on a {param} node. ${didYouMean(extra[0], ['key'])}Write { param: 'name' }, or { param: 'name', key: true } for the option key of a variant`);
      return null;
    }
    if (keys.includes('param') && keys.includes('key') && template.key !== true) {
      problems.push(`${path}: {param: '${template.param}', key: ${JSON.stringify(template.key)}}: key must be the literal true. Write { param: '${template.param}', key: true }, or leave key out for the mapped value`);
      return null;
    }
    if (keys.length === 2 && keys.includes('param') && template.key === true) {
      const optionKeys = values[KEYS];
      if (!(template.param in optionKeys)) problems.push(`${path}: {param: '${template.param}', key: true} needs a param with options. Options params: ${Object.keys(optionKeys).join(', ') || 'none'}`);
      return optionKeys[template.param] === undefined ? OMIT : optionKeys[template.param];
    }
    if (keys.length === 1 && keys[0] === 'param') {
      if (!(template.param in values)) {
        problems.push(`${path}: unknown param ${template.param}. ${didYouMean(String(template.param), Object.keys(values))}Declare it in the component's params or fix the name. Declared: ${Object.keys(values).join(', ') || 'none'}`);
        return null;
      }
      return values[template.param] === OMIT ? OMIT : clone(values[template.param]);
    }
    if (keys.length === 1 && keys[0] === 'slot') {
      if (template.slot !== 'children') problems.push(`${path}: only the slot "children" exists. Write { slot: 'children' }`);
      return slotNodes;
    }
    const result = {};
    let dropped = 0;
    for (const key of keys) {
      const value = substitute(template[key], values, slotNodes, `${path}.${key}`);
      if (value === OMIT) dropped++;
      else result[key] = value;
    }
    // An object that was emptied only by omitted params (for example `on` with its one handler) goes away too.
    if (dropped && !Object.keys(result).length) return OMIT;
    if (keys.length === 1 && keys[0] === 'join') return foldJoin(result);
    if (isPlainObject(result.props) && typeof result.props.class === 'string') result.props.class = result.props.class.trim().replace(/\s+/g, ' ');
    return result;
  };

  // The values a component's spec sees: given ones, options mapped to their value, defaults and omitted optionals filled in.
  const resolveValues = (node, path, definition) => {
    const given = node.with || {};
    const before = problems.length;
    const values = { [KEYS]: {} };
    for (const [param, value] of Object.entries(given)) {
      if (value === undefined && definition.params.has(param)) problems.push(`${path}: param ${param} is undefined. Give it a JSON value, or leave it out of "with"`);
    }
    for (const [param, declaration] of definition.params) {
      if (!(param in given)) {
        if (declaration.required) problems.push(`${path}: component ${node.use} needs param ${param}. Add it to "with": { ${param}: ... }`);
        else if ('default' in declaration) {
          values[param] = declaration.options ? declaration.options[declaration.default] : declaration.default;
          if (declaration.options) values[KEYS][param] = declaration.default;
        } else {
          values[param] = OMIT;
          if (declaration.options) values[KEYS][param] = undefined;
        }
        continue;
      }
      const value = given[param];
      if (value === undefined) continue; // reported above
      if (!declaration.options) {
        const mismatch = declaration.type && typeMismatch(declaration.type, value);
        if (mismatch) problems.push(`${path}: component ${node.use} param ${param} ${mismatch}`);
        values[param] = value;
        continue;
      }
      const choices = Object.keys(declaration.options);
      if (typeof value !== 'string') problems.push(`${path}: component ${node.use} param ${param} must be a literal option, because variants are resolved when the page is built. Options: ${choices.join(', ')}. To switch at runtime, use a "when" with one use per variant`);
      else if (!(value in declaration.options)) problems.push(`${path}: component ${node.use} param ${param} is ${JSON.stringify(value)}, which is not one of its options. ${didYouMean(value, choices)}Options: ${choices.join(', ')}`);
      else {
        values[param] = declaration.options[value];
        values[KEYS][param] = value;
      }
    }
    for (const param of Object.keys(given)) {
      if (!definition.params.has(param)) problems.push(`${path}: component ${node.use} has no param ${param}. ${didYouMean(param, [...definition.params.keys()])}Declared: ${[...definition.params.keys()].join(', ') || 'none'}`);
    }
    return problems.length > before ? null : values; // report the use-site mistakes only, not their echoes
  };

  const expand = (node, path, depth) => {
    if (Array.isArray(node)) return node.flatMap((child, index) => {
      const result = expand(child, `${path}.${index}`, depth);
      return Array.isArray(result) ? result : [result];
    });
    if (!isPlainObject(node)) return node;
    if ('use' in node) {
      const definition = declared[node.use];
      const unknownKeys = Object.keys(node).filter((key) => !['use', 'with', 'children'].includes(key));
      if (unknownKeys.length) problems.push(`${path}: unknown key ${unknownKeys[0]} on a component use. ${didYouMean(unknownKeys[0], ['use', 'with', 'children'])}Allowed: use, with, children`);
      if (!definition) {
        problems.push(`${path}: unknown component ${node.use}. ${didYouMean(String(node.use), Object.keys(components))}Register it in the components option. Known: ${Object.keys(components).join(', ') || 'none'}`);
        return null;
      }
      if (depth >= MAX_DEPTH) {
        problems.push(`${path}: components nest deeper than ${MAX_DEPTH} levels. A component probably uses itself; remove the cycle`);
        return null;
      }
      const values = resolveValues(node, path, definition);
      if (!values) return null;
      const slotNodes = node.children === undefined ? [] : toArray(node.children);
      const filled = substitute(definition.spec, values, slotNodes, `${path}<${node.use}>`);
      if (filled === OMIT) {
        problems.push(`${path}<${node.use}>: the whole spec is an omitted optional param. Give the component a spec of its own`);
        return null;
      }
      return expand(filled, `${path}<${node.use}>`, depth + 1);
    }
    // Handlers hold no components, and a list of handlers must not be flattened like a list of child nodes.
    return Object.fromEntries(Object.keys(node).map((key) => [key, key === 'on' ? node[key] : expand(node[key], `${path}.${key}`, depth)]));
  };

  const expanded = expand(spec, '$', 0);
  if (problems.length) {
    const error = new Error(`components: ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n  ${problems.join('\n  ')}`);
    error.problems = problems;
    throw error;
  }
  return expanded;
};
