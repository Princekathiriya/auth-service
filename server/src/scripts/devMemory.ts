/**
 * Run the API against a throwaway in-memory MongoDB: no database install needed.
 *   npm run dev:memory
 * Everything is lost when you stop it. For real development use `npm run dev` with MONGODB_URI.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';

// Fixed port (not random) so other scripts, like make-admin, can connect to the same database.
const PORT = 27018;
const mongo = await MongoMemoryServer.create({ instance: { port: PORT } });
process.env.MONGODB_URI = mongo.getUri();

console.log(`
In-memory MongoDB running at ${mongo.getUri()} (data is NOT saved).
To make a user admin, in another terminal run:
  MONGODB_URI=${mongo.getUri()} npm run make-admin -- <email>
`);
await import('../server.js');
