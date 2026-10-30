// Starts the Fastify server: `npm start` builds the site first, then runs this file.
import { createServer } from './server.js';

const port = Number(process.env.PORT ?? 3000);
const server = await createServer();
await server.listen({ port });
console.log(`http://localhost:${port}/`);
