// A development and test server for rendered pages: the render handler (server/ssr-handler.mjs) in front of the static server of
// this folder, which serves the built files. For `agent-ui serve` and the end to end tests of the examples. A real deployment mounts
// createSsrHandler in the host's own server and lets the host serve the files.
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { createSsrHandler } from '../server/ssr-handler.mjs';
import { createStaticHandler } from './static-handler.mjs';

export const createSsrServer = async (options = {}) => {
  const render = await createSsrHandler(options);
  const { config, root = process.cwd(), outDir = config.outDir ?? 'dist' } = options;
  const outputDirectory = resolve(root, outDir);
  const files = createStaticHandler(outputDirectory, { assetsDir: config.assetsDir ?? 'assets', onError: options.onError, hosts: options.hosts, basePath: config.basePath ?? '' });
  return createServer((request, response) => render(request, response, () => files(request, response)));
};
