// The topics of `agent-ui explain` (cli/explain-topics.mjs): each one prints an example of the grammar, which must be valid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../src/validate.js';
import * as builders from '../src/spec.js';
import { topics } from '../cli/explain-topics.mjs';

test('every example of a topic builds with the builders and passes the validator against the namespaces it names', () => {
  for (const topic of topics.filter((candidate) => candidate.example)) {
    const spec = new Function(...Object.keys(builders), `return ${topic.example};`)(...Object.values(builders));
    assert.deepEqual(validate(spec, { namespaces: topic.namespaces }), [], `topic ${topic.name}`);
    assert.ok(topic.see, `topic ${topic.name} says where the reference is`);
  }
});
