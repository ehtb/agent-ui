// Starts the Express server: `npm start` builds the site first, then runs this file.
import { createServer } from './server.js';

const port = Number(process.env.PORT ?? 3000);
(await createServer()).listen(port, () => console.log(`http://localhost:${port}/`));
