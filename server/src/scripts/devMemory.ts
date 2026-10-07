/**
 * Run the API against a throwaway in-memory MongoDB: no database install needed.
 *   npm run dev:memory
 * Everything is lost when you stop it. For real development use `npm run dev` with MONGODB_URI.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';

const mongo = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongo.getUri();
console.log('In-memory MongoDB started (data is NOT saved)');
await import('../server.js');
