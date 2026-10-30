// `agent-ui schema [outputFile]`: writes the JSON Schema of the spec grammar (default: ./spec.schema.json).
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createSpecSchema } from '../src/spec-schema.js';
import { isMain } from './is-main.mjs';
import { parseOrExit } from './arguments.mjs';

if (isMain(import.meta.url)) {
  const options = parseOrExit(process.argv.slice(2), {}, { command: 'agent-ui schema', positional: true });
  if (options._.length > 1) {
    console.error(`agent-ui schema: one output file at most, got ${options._.length}. Usage: agent-ui schema [outputFile]`);
    process.exit(2);
  }
  const target = resolve(options._[0] ?? 'spec.schema.json');
  writeFileSync(target, JSON.stringify(createSpecSchema(), null, 2) + '\n');
  console.log(`wrote ${target}`);
}
