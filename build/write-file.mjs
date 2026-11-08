// Writes a generated file only when its text changed. A command reads the generated modules again on every run, and most of
// them are the same as the last time: leaving those untouched keeps a project's `.agent-ui/` stable and a second run cheap.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

// Returns true when the file was written, false when it already had this text.
export const writeFileIfChanged = (path, text) => {
  if (existsSync(path) && readFileSync(path, 'utf8') === text) return false;
  writeFileSync(path, text);
  return true;
};
