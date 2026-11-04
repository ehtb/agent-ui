// Starts the host: npm start, then open http://localhost:3000/
import { PRODUCTS, createIslandsServer } from './server.js';

const port = Number(process.env.PORT ?? 3000);
createIslandsServer({ products: PRODUCTS }).listen(port, '127.0.0.1', () => console.log(`islands at http://localhost:${port}/`));
