// A fingerprint of the sources a build was made from: the hash of every file the bundler read (the project's modules, the generated
// entries and the framework's own files). `manifest.json` carries it, and `agent-ui serve` compares it with the files as they are now:
// `serve` renders pages from the sources, so a build that is older than them would send markup that the bundle then replaces with
// another page.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const stampSources = (projectRoot, files) => {
  const hash = createHash('sha1');
  for (const file of [...files].sort()) hash.update(`${file}\0`).update(readFileSync(resolve(projectRoot, file))).update('\0');
  return hash.digest('hex').slice(0, 16);
};

// null when the build is current, otherwise the sentence that says why not.
export const staleReason = (projectRoot, manifest) => {
  if (!manifest?.sources) return 'its manifest.json has no record of the sources it was built from';
  try {
    return stampSources(projectRoot, manifest.sources.files) === manifest.sources.hash ? null : 'a source file changed after it was built (or it was built with --dev, which generates different sources)';
  } catch {
    return 'a source file it was built from is gone';
  }
};
