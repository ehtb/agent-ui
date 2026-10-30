// A tiny JSON Schema evaluator for tests. It supports only the keywords that src/spec-schema.js generates ($ref into
// the schema's own definitions, anyOf, enum, type, properties, required, additionalProperties, patternProperties, items,
// prefixItems, minItems, maxItems, minLength, pattern, exclusiveMinimum). It keeps schema tests free of dependencies; it is not
// a general validator.
//
//   matchesSchema(value, schema)   true when `value` conforms to `schema`

const typeOf = (value) => (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value);

export const matchesSchema = (value, schema) => {
  const matches = (candidate, node) => {
    if (node.$ref) return matches(candidate, node.$ref.split('/').slice(1).reduce((target, key) => target[key], schema));
    if (node.anyOf) return node.anyOf.some((option) => matches(candidate, option));
    if (node.enum) return node.enum.includes(candidate);
    if (node.type && ![].concat(node.type).includes(typeOf(candidate))) return false;
    if (typeOf(candidate) === 'string' && node.minLength && candidate.length < node.minLength) return false;
    if (typeOf(candidate) === 'string' && node.pattern && !new RegExp(node.pattern).test(candidate)) return false;
    if (typeOf(candidate) === 'number' && node.exclusiveMinimum !== undefined && !(candidate > node.exclusiveMinimum)) return false;
    if (typeOf(candidate) === 'array') {
      if (node.minItems !== undefined && candidate.length < node.minItems) return false;
      if (node.maxItems !== undefined && candidate.length > node.maxItems) return false;
      if (node.items && !candidate.every((item) => matches(item, node.items))) return false;
      if (node.prefixItems && !candidate.every((item, index) => !node.prefixItems[index] || matches(item, node.prefixItems[index]))) return false;
    }
    if (typeOf(candidate) === 'object') {
      for (const required of node.required || []) if (!(required in candidate)) return false;
      for (const [key, item] of Object.entries(candidate)) {
        const known = node.properties?.[key];
        const patternHit = Object.entries(node.patternProperties || {}).find(([pattern]) => new RegExp(pattern).test(key));
        if (known) {
          if (!matches(item, known)) return false;
        } else if (patternHit) {
          if (!matches(item, patternHit[1])) return false;
        } else if (node.additionalProperties === false) {
          return false;
        } else if (typeof node.additionalProperties === 'object' && !matches(item, node.additionalProperties)) {
          return false;
        }
      }
    }
    return true;
  };
  return matches(value, schema);
};
