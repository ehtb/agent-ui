// Generates a JSON Schema (draft 2020-12) for agent-ui specs from the runtime's own `grammar` export.
// Use: constrained decoding / structured output for agents that generate specs, editor validation, other languages.
// The schema checks structure only; the runtime validator still owns semantics (action names and argument types,
// duplicate ids, accessibility rules, {item} only inside `each`).
//   createSpecSchema() returns the schema object; `agent-ui schema [outputFile]` writes it (default: spec.schema.json).
import { grammar } from './ui.js';
import { IDENTIFIER } from './namespaces.js';
import { ACTION_NAME, ROW_PATH, ROW_STATE_PATH, STATE_PATH } from './grammar.js';

const reference = (name) => ({ $ref: `#/$defs/${name}` });
const listOf = (items, minItems, maxItems) => ({ type: 'array', items, minItems, ...(maxItems !== undefined && { maxItems }) });

export const createSpecSchema = () => {
  const literal = { type: ['string', 'number', 'boolean', 'null'] };
  const operand = { anyOf: [literal, reference('binding')] };
  const single = (key, schema) => ({ type: 'object', properties: { [key]: schema }, required: [key], additionalProperties: false });
  const bindingKinds = {
    // namespace.key, then any path inside the value
    state: { type: 'string', pattern: STATE_PATH.source },
    item: { type: 'string', minLength: 1 },
    // name.field of a row of an enclosing each that says `as`, or just name for the whole item
    row: { type: 'string', pattern: ROW_PATH.source },
    // namespace.field of the namespace's rowState for the row of the innermost each, or rowname.namespace.field for the row an enclosing each names with `as`
    rowState: { type: 'string', pattern: ROW_STATE_PATH.source },
    not: operand,
    length: operand,
    equals: listOf(operand, 2, 2),
    greaterThan: listOf(operand, 2, 2),
    lessThan: listOf(operand, 2, 2),
    and: listOf(operand, 2),
    or: listOf(operand, 2),
    join: listOf(operand, 1),
  };
  const eventNames = grammar.events.join('|');
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'agent-ui spec',
    $ref: '#/$defs/node',
    $defs: {
      node: { anyOf: [{ type: 'string' }, reference('binding'), reference('element'), reference('each'), reference('when')] },
      nodes: { anyOf: [reference('node'), listOf(reference('node'), 0)] },
      binding: { anyOf: grammar.bindingKeys.map((key) => single(key, bindingKinds[key])) },
      handlers: { anyOf: [reference('handler'), listOf(reference('handler'), 2)] },
      handler: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
        prefixItems: [
          { type: 'string', pattern: ACTION_NAME.source },
          { type: 'object', additionalProperties: { anyOf: [literal, { type: 'object' }, { type: 'array' }] } }, // a 'json' argument may be a list
          { type: 'object', properties: Object.fromEntries(grammar.handlerOptions.map((name) => [name, { type: 'boolean' }])), additionalProperties: false },
        ],
      },
      element: {
        type: 'object',
        properties: {
          tag: { enum: grammar.tags },
          id: { type: 'string', minLength: 1 },
          props: { type: 'object', additionalProperties: { anyOf: [literal, reference('binding')] } },
          classes: { type: 'object', additionalProperties: reference('binding') },
          on: {
            type: 'object',
            // "click", "keydown.Enter", "keydown.Control+Shift+k": an event name, optionally with a key chord for key events.
            patternProperties: { [`^(${eventNames})(\\.[^.]+)?$`]: reference('handlers') },
            additionalProperties: false,
          },
          transition: { type: 'number', exclusiveMinimum: 0 },
          children: reference('nodes'),
        },
        required: ['tag'],
        additionalProperties: false,
      },
      each: {
        type: 'object',
        properties: { each: { anyOf: [{ type: 'string', pattern: STATE_PATH.source }, reference('binding')] }, key: { type: 'string', minLength: 1 }, as: { type: 'string', pattern: IDENTIFIER.source }, template: reference('element') },
        required: ['each', 'key', 'template'],
        additionalProperties: false,
      },
      when: {
        type: 'object',
        properties: { when: reference('binding'), children: reference('nodes'), otherwise: reference('nodes') },
        required: ['when'],
        additionalProperties: false,
      },
    },
  };
};
